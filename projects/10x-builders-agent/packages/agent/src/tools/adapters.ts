import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { DbClient } from "@agents/db";
import type { UserToolSetting, UserIntegration } from "@agents/types";
import { TOOL_CATALOG } from "./catalog";
import { createToolCall, updateToolCallStatus } from "@agents/db";
import type { IntegrationsContext } from "../types";
import {
  createIssue,
  createRepository,
  listIssues,
  listRepositories,
} from "../integrations/github";
import {
  createEvent,
  deleteEvent,
  findConflictsInWindow,
  getEvent,
  listEvents,
  type Recurrence,
  updateEvent,
} from "../integrations/google-calendar";

interface ToolContext {
  db: DbClient;
  userId: string;
  sessionId: string;
  enabledTools: UserToolSetting[];
  integrations: UserIntegration[];
  integrationsContext: IntegrationsContext;
}

function isToolAvailable(toolId: string, ctx: ToolContext): boolean {
  const setting = ctx.enabledTools.find((t) => t.tool_id === toolId);
  if (!setting?.enabled) return false;

  const def = TOOL_CATALOG.find((t) => t.id === toolId);
  if (def?.requires_integration) {
    const hasIntegration = ctx.integrations.some(
      (i) => i.provider === def.requires_integration && i.status === "active",
    );
    if (!hasIntegration) return false;
  }
  return true;
}

function requireGithubToken(ctx: ToolContext): string {
  const token = ctx.integrationsContext.github?.accessToken;
  if (!token) {
    throw new Error(
      "No active GitHub access token available. Ask the user to reconnect GitHub in Settings.",
    );
  }
  return token;
}

function requireGoogleToken(ctx: ToolContext): string {
  const token = ctx.integrationsContext.google?.accessToken;
  if (!token) {
    throw new Error(
      "No active Google access token available. Ask the user to reconnect Google in Settings.",
    );
  }
  return token;
}

const WEEKDAY_LABELS: Record<string, string> = {
  MO: "lunes",
  TU: "martes",
  WE: "miércoles",
  TH: "jueves",
  FR: "viernes",
  SA: "sábado",
  SU: "domingo",
};

function describeRecurrence(r: Recurrence): string {
  const interval = r.interval && r.interval > 1 ? r.interval : 1;
  const limit = r.count ? ` (${r.count} veces)` : r.until ? ` hasta ${r.until.slice(0, 10)}` : "";
  if (r.frequency === "daily") {
    return interval === 1
      ? `Se repite todos los días${limit}.`
      : `Se repite cada ${interval} días${limit}.`;
  }
  if (r.frequency === "weekly") {
    const days = (r.byDay ?? []).map((d) => WEEKDAY_LABELS[d] ?? d).join(", ");
    const cadence = interval === 1 ? "Cada semana" : `Cada ${interval} semanas`;
    return days ? `${cadence} los ${days}${limit}.` : `${cadence}${limit}.`;
  }
  if (r.frequency === "monthly") {
    const day = r.byMonthDay ? ` el día ${r.byMonthDay}` : "";
    const cadence = interval === 1 ? "Cada mes" : `Cada ${interval} meses`;
    return `${cadence}${day}${limit}.`;
  }
  return interval === 1 ? `Cada año${limit}.` : `Cada ${interval} años${limit}.`;
}

const recurrenceSchema = z
  .object({
    frequency: z.enum(["daily", "weekly", "monthly", "yearly"]),
    interval: z.number().int().min(1).nullable().optional(),
    byDay: z
      .array(z.enum(["MO", "TU", "WE", "TH", "FR", "SA", "SU"]))
      .nullable()
      .optional(),
    byMonthDay: z.number().int().min(1).max(31).nullable().optional(),
    count: z.number().int().min(1).nullable().optional(),
    until: z.string().nullable().optional(),
  })
  .nullable()
  .optional();

function normalizeRecurrence(input: z.infer<typeof recurrenceSchema>): Recurrence | undefined {
  if (!input) return undefined;
  const r: Recurrence = { frequency: input.frequency };
  if (input.interval != null) r.interval = input.interval;
  if (input.byDay != null) r.byDay = input.byDay;
  if (input.byMonthDay != null) r.byMonthDay = input.byMonthDay;
  if (input.count != null) r.count = input.count;
  if (input.until != null) r.until = input.until;
  return r;
}

/**
 * Builds the human-readable summary shown on the confirmation card. Only
 * called by `toolExecutorNode` for medium/high risk tools — never by tool
 * code itself (the tool's job is the side-effect, not the wording).
 *
 * `integrationsContext` is needed for the calendar conflict scan; if the
 * scan fails (token expired, network blip), we silently skip it — the
 * summary is best-effort metadata, not a gate.
 */
export async function summariseToolCall(
  toolName: string,
  args: Record<string, unknown>,
  integrationsContext: IntegrationsContext,
): Promise<string> {
  if (toolName === "github_create_issue") {
    return `Crear issue "${String(args.title)}" en ${String(args.owner)}/${String(args.repo)}.`;
  }
  if (toolName === "github_create_repo") {
    const isPrivate = typeof args.private === "boolean" ? (args.private as boolean) : true;
    return `Crear repositorio ${isPrivate ? "privado" : "público"} "${String(args.name)}".`;
  }

  if (toolName === "gcal_create_event") {
    const tz =
      (args.time_zone as string | undefined) ?? integrationsContext.google?.timeZone ?? "Etc/UTC";
    const recurrence = args.recurrence
      ? normalizeRecurrence(args.recurrence as z.infer<typeof recurrenceSchema>)
      : undefined;

    let conflictsLine = "";
    if (recurrence && integrationsContext.google?.accessToken) {
      try {
        const winStart = String(args.start);
        const winEnd = new Date(
          new Date(winStart).getTime() + 8 * 7 * 24 * 60 * 60 * 1000,
        ).toISOString();
        const conflicts = await findConflictsInWindow(integrationsContext.google.accessToken, {
          start: winStart,
          end: winEnd,
          timeZone: tz,
        });
        if (conflicts.length > 0) {
          conflictsLine = ` Atención: hay ${conflicts.length} eventos en las próximas 8 semanas que podrían chocar.`;
        }
      } catch {
        // best-effort
      }
    }

    const recurrenceLine = recurrence ? ` ${describeRecurrence(recurrence)}` : "";
    return `Crear evento «${String(args.summary)}» del ${String(args.start).slice(0, 16).replace("T", " ")} al ${String(args.end).slice(0, 16).replace("T", " ")} (${tz}).${recurrenceLine}${conflictsLine}`;
  }

  if (toolName === "gcal_update_event") {
    const scopeLabel =
      args.scope === "instance"
        ? "Esta acción afectará SOLO a esa ocurrencia."
        : "Esta acción afectará TODA la serie.";
    const changes: string[] = [];
    if (args.summary) changes.push(`título → «${String(args.summary)}»`);
    if (args.start) changes.push(`inicio → ${String(args.start).slice(0, 16).replace("T", " ")}`);
    if (args.end) changes.push(`fin → ${String(args.end).slice(0, 16).replace("T", " ")}`);
    if (args.description !== undefined && args.description !== null) changes.push("descripción");
    const changeLine = changes.length > 0 ? ` Cambios: ${changes.join(", ")}.` : "";
    return `Modificar evento ${String(args.event_id)}.${changeLine} ${scopeLabel}`;
  }

  if (toolName === "gcal_delete_event") {
    const scopeLabel =
      args.scope === "instance"
        ? "Esta acción afectará SOLO a esa ocurrencia."
        : "Esta acción afectará TODA la serie.";
    return `Eliminar evento ${String(args.event_id)}. ${scopeLabel}`;
  }

  return `Ejecutar ${toolName}.`;
}

export function buildLangChainTools(ctx: ToolContext) {
  // Intentionally loose: each `tool()` call produces a structurally-different
  // tool type; widening to a common generic would require a cast on every
  // push. The returned array is only consumed by LangGraph which itself uses
  // `any` at the edges.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools: any[] = [];

  if (isToolAvailable("get_user_preferences", ctx)) {
    tools.push(
      tool(
        async () => {
          const { getProfile } = await import("@agents/db");
          const profile = await getProfile(ctx.db, ctx.userId);
          return JSON.stringify({
            name: profile.name,
            timezone: profile.timezone,
            language: profile.language,
            agent_name: profile.agent_name,
          });
        },
        {
          name: "get_user_preferences",
          description: "Returns the current user preferences and agent configuration.",
          schema: z.object({}),
        },
      ),
    );
  }

  if (isToolAvailable("list_enabled_tools", ctx)) {
    tools.push(
      tool(
        async () => {
          const enabled = ctx.enabledTools.filter((t) => t.enabled).map((t) => t.tool_id);
          return JSON.stringify(enabled);
        },
        {
          name: "list_enabled_tools",
          description: "Lists all tools the user has currently enabled.",
          schema: z.object({}),
        },
      ),
    );
  }

  if (isToolAvailable("github_list_repos", ctx)) {
    tools.push(
      tool(
        async (input) => {
          const token = requireGithubToken(ctx);
          const record = await createToolCall(
            ctx.db,
            ctx.sessionId,
            "github_list_repos",
            input as Record<string, unknown>,
            false,
          );
          try {
            const repos = await listRepositories(token, {
              perPage: input.per_page ?? undefined,
            });
            const trimmed = repos.map((r) => ({
              full_name: r.full_name,
              private: r.private,
              description: r.description,
              default_branch: r.default_branch,
              url: r.html_url,
            }));
            await updateToolCallStatus(ctx.db, record.id, "executed", {
              count: trimmed.length,
            });
            return JSON.stringify({ repos: trimmed });
          } catch (e) {
            await updateToolCallStatus(ctx.db, record.id, "failed", {
              error: e instanceof Error ? e.message : String(e),
            });
            throw e;
          }
        },
        {
          name: "github_list_repos",
          description:
            "Lists the authenticated user's GitHub repositories (up to 30, ordered by most recently updated).",
          schema: z.object({
            per_page: z.number().int().min(1).max(30).nullable().optional().default(10),
          }),
        },
      ),
    );
  }

  if (isToolAvailable("github_list_issues", ctx)) {
    tools.push(
      tool(
        async (input) => {
          const token = requireGithubToken(ctx);
          const record = await createToolCall(
            ctx.db,
            ctx.sessionId,
            "github_list_issues",
            input as Record<string, unknown>,
            false,
          );
          try {
            const issues = await listIssues(token, {
              owner: input.owner,
              repo: input.repo,
              state: input.state ?? undefined,
            });
            await updateToolCallStatus(ctx.db, record.id, "executed", {
              count: issues.length,
            });
            return JSON.stringify({ issues });
          } catch (e) {
            await updateToolCallStatus(ctx.db, record.id, "failed", {
              error: e instanceof Error ? e.message : String(e),
            });
            throw e;
          }
        },
        {
          name: "github_list_issues",
          description: "Lists issues for a given repository (excludes pull requests).",
          schema: z.object({
            owner: z.string(),
            repo: z.string(),
            state: z.enum(["open", "closed", "all"]).nullable().optional().default("open"),
          }),
        },
      ),
    );
  }

  // -------------------------------------------------------------------------
  // medium/high tools: the side-effect runs ONLY when the graph invokes the
  // tool after `interrupt()` was resolved with `approve`. The pending row is
  // owned by `toolExecutorNode`; these tools must not call createToolCall.
  // -------------------------------------------------------------------------

  if (isToolAvailable("github_create_issue", ctx)) {
    tools.push(
      tool(
        async (input) => {
          const token = requireGithubToken(ctx);
          const result = await createIssue(token, {
            owner: input.owner,
            repo: input.repo,
            title: input.title,
            body: input.body ?? "",
          });
          return JSON.stringify({
            number: result.number,
            html_url: result.html_url,
            title: result.title,
          });
        },
        {
          name: "github_create_issue",
          description:
            "Creates a new issue in a GitHub repository. Requires explicit user confirmation before execution (handled by the graph).",
          schema: z.object({
            owner: z.string(),
            repo: z.string(),
            title: z.string(),
            body: z.string().nullable().optional().default(""),
          }),
        },
      ),
    );
  }

  if (isToolAvailable("github_create_repo", ctx)) {
    tools.push(
      tool(
        async (input) => {
          const token = requireGithubToken(ctx);
          const isPrivate = typeof input.private === "boolean" ? input.private : true;
          const result = await createRepository(token, {
            name: input.name,
            description: input.description ?? "",
            private: isPrivate,
          });
          return JSON.stringify({
            full_name: result.full_name,
            html_url: result.html_url,
            private: result.private,
          });
        },
        {
          name: "github_create_repo",
          description:
            "Creates a new repository under the authenticated user. Requires explicit user confirmation before execution (handled by the graph).",
          schema: z.object({
            name: z.string().min(1),
            description: z.string().nullable().optional().default(""),
            private: z.boolean().nullable().optional().default(true),
          }),
        },
      ),
    );
  }

  // -------------------------------------------------------------------------
  // Google Calendar
  // -------------------------------------------------------------------------

  if (isToolAvailable("gcal_list_events", ctx)) {
    tools.push(
      tool(
        async (input) => {
          const token = requireGoogleToken(ctx);
          const tz = ctx.integrationsContext.google?.timeZone;
          const record = await createToolCall(
            ctx.db,
            ctx.sessionId,
            "gcal_list_events",
            input as Record<string, unknown>,
            false,
          );
          try {
            const events = await listEvents(token, {
              timeMin: input.time_min,
              timeMax: input.time_max,
              q: input.q ?? undefined,
              timeZone: tz,
              maxResults: 50,
            });
            const trimmed = events.map((e) => ({
              id: e.id,
              summary: e.summary,
              start: e.start?.dateTime,
              end: e.end?.dateTime,
              recurring_event_id: e.recurringEventId,
            }));
            await updateToolCallStatus(ctx.db, record.id, "executed", {
              count: trimmed.length,
            });
            return JSON.stringify({ events: trimmed });
          } catch (e) {
            await updateToolCallStatus(ctx.db, record.id, "failed", {
              error: e instanceof Error ? e.message : String(e),
            });
            throw e;
          }
        },
        {
          name: "gcal_list_events",
          description:
            "Lists Google Calendar events on the user's primary calendar between time_min and time_max (RFC3339). Recurrences are expanded; each instance has its own id usable with gcal_update_event/gcal_delete_event when scope='instance'.",
          schema: z.object({
            time_min: z.string(),
            time_max: z.string(),
            q: z.string().nullable().optional(),
          }),
        },
      ),
    );
  }

  if (isToolAvailable("gcal_get_event", ctx)) {
    tools.push(
      tool(
        async (input) => {
          const token = requireGoogleToken(ctx);
          const record = await createToolCall(
            ctx.db,
            ctx.sessionId,
            "gcal_get_event",
            input as Record<string, unknown>,
            false,
          );
          try {
            const event = await getEvent(token, { eventId: input.event_id });
            await updateToolCallStatus(ctx.db, record.id, "executed", {
              id: event.id,
            });
            return JSON.stringify(event);
          } catch (e) {
            await updateToolCallStatus(ctx.db, record.id, "failed", {
              error: e instanceof Error ? e.message : String(e),
            });
            throw e;
          }
        },
        {
          name: "gcal_get_event",
          description:
            "Fetches the full details of a single Google Calendar event by id (master or instance), including its recurrence rule if any.",
          schema: z.object({
            event_id: z.string(),
          }),
        },
      ),
    );
  }

  if (isToolAvailable("gcal_create_event", ctx)) {
    tools.push(
      tool(
        async (input) => {
          const token = requireGoogleToken(ctx);
          const tz = input.time_zone ?? ctx.integrationsContext.google?.timeZone ?? "Etc/UTC";
          const recurrence = normalizeRecurrence(input.recurrence);
          const result = await createEvent(token, {
            summary: input.summary,
            description: input.description ?? undefined,
            start: { dateTime: input.start, timeZone: tz },
            end: { dateTime: input.end, timeZone: tz },
            attendees: Array.isArray(input.attendees)
              ? input.attendees.map((email: string) => ({ email }))
              : undefined,
            recurrence,
          });
          return JSON.stringify({
            id: result.id,
            htmlLink: result.htmlLink,
            summary: result.summary,
          });
        },
        {
          name: "gcal_create_event",
          description:
            "Creates an event on the user's primary Google Calendar. Pass `recurrence` to schedule a recurring series. Requires explicit user confirmation before execution (handled by the graph).",
          schema: z.object({
            summary: z.string(),
            description: z.string().nullable().optional(),
            start: z.string().describe("RFC3339 datetime, e.g. 2026-04-28T10:00:00-05:00"),
            end: z.string().describe("RFC3339 datetime"),
            time_zone: z
              .string()
              .nullable()
              .optional()
              .describe("IANA timezone; defaults to user's profile timezone"),
            attendees: z.array(z.string().email()).nullable().optional(),
            recurrence: recurrenceSchema,
          }),
        },
      ),
    );
  }

  if (isToolAvailable("gcal_update_event", ctx)) {
    tools.push(
      tool(
        async (input) => {
          const token = requireGoogleToken(ctx);
          const tz = input.time_zone ?? ctx.integrationsContext.google?.timeZone ?? "Etc/UTC";
          const result = await updateEvent(token, {
            eventId: input.event_id,
            scope: input.scope,
            summary: input.summary ?? undefined,
            description: input.description ?? undefined,
            start: input.start ? { dateTime: input.start, timeZone: tz } : undefined,
            end: input.end ? { dateTime: input.end, timeZone: tz } : undefined,
          });
          return JSON.stringify({
            id: result.id,
            htmlLink: result.htmlLink,
            summary: result.summary,
          });
        },
        {
          name: "gcal_update_event",
          description:
            "Modifies an existing Google Calendar event. For scope='instance' pass the instance id from gcal_list_events; for scope='series' pass the master event id. Requires explicit user confirmation (handled by the graph).",
          schema: z.object({
            event_id: z.string(),
            scope: z.enum(["instance", "series"]),
            summary: z.string().nullable().optional(),
            description: z.string().nullable().optional(),
            start: z.string().nullable().optional(),
            end: z.string().nullable().optional(),
            time_zone: z.string().nullable().optional(),
          }),
        },
      ),
    );
  }

  if (isToolAvailable("gcal_delete_event", ctx)) {
    tools.push(
      tool(
        async (input) => {
          const token = requireGoogleToken(ctx);
          await deleteEvent(token, {
            eventId: input.event_id,
            scope: input.scope,
          });
          return JSON.stringify({
            event_id: input.event_id,
            scope: input.scope,
            deleted: true,
          });
        },
        {
          name: "gcal_delete_event",
          description:
            "Deletes a Google Calendar event. For scope='instance' pass the instance id; for scope='series' pass the master event id. Requires explicit user confirmation (handled by the graph).",
          schema: z.object({
            event_id: z.string(),
            scope: z.enum(["instance", "series"]),
          }),
        },
      ),
    );
  }

  return tools;
}
