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

/**
 * Thrown by any tool whose action is gated by user approval (e.g. creating a
 * GitHub issue). The graph's tool executor catches this, persists the pending
 * tool_call, and short-circuits without asking the model again — so it never
 * sees a fabricated "I'm waiting for your approval" string it could hallucinate
 * around.
 */
export class ConfirmationRequiredError extends Error {
  readonly toolName: string;
  readonly args: Record<string, unknown>;
  readonly summary: string;
  constructor(toolName: string, args: Record<string, unknown>, summary: string) {
    super(`Tool "${toolName}" requires user confirmation`);
    this.name = "ConfirmationRequiredError";
    this.toolName = toolName;
    this.args = args;
    this.summary = summary;
  }
}

function isToolAvailable(toolId: string, ctx: ToolContext): boolean {
  const setting = ctx.enabledTools.find((t) => t.tool_id === toolId);
  if (!setting?.enabled) return false;

  const def = TOOL_CATALOG.find((t) => t.id === toolId);
  if (def?.requires_integration) {
    const hasIntegration = ctx.integrations.some(
      (i) => i.provider === def.requires_integration && i.status === "active"
    );
    if (!hasIntegration) return false;
  }
  return true;
}

function requireGithubToken(ctx: ToolContext): string {
  const token = ctx.integrationsContext.github?.accessToken;
  if (!token) {
    // This surfaces as a normal tool error the model can read and explain. It
    // should rarely fire because `isToolAvailable` also gates on integration
    // presence, but it's a defence-in-depth guard for the case where the DB
    // row says "active" but the ciphertext can't be decrypted.
    throw new Error(
      "No active GitHub access token available. Ask the user to reconnect GitHub in Settings."
    );
  }
  return token;
}

function requireGoogleToken(ctx: ToolContext): string {
  const token = ctx.integrationsContext.google?.accessToken;
  if (!token) {
    throw new Error(
      "No active Google access token available. Ask the user to reconnect Google in Settings."
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
  const limit = r.count
    ? ` (${r.count} veces)`
    : r.until
      ? ` hasta ${r.until.slice(0, 10)}`
      : "";
  if (r.frequency === "daily") {
    return interval === 1 ? `Se repite todos los días${limit}.` : `Se repite cada ${interval} días${limit}.`;
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
    byDay: z.array(z.enum(["MO", "TU", "WE", "TH", "FR", "SA", "SU"])).nullable().optional(),
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
        }
      )
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
        }
      )
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
            false
          );
          try {
            const repos = await listRepositories(token, { perPage: input.per_page ?? undefined });
            const trimmed = repos.map((r) => ({
              full_name: r.full_name,
              private: r.private,
              description: r.description,
              default_branch: r.default_branch,
              url: r.html_url,
            }));
            await updateToolCallStatus(ctx.db, record.id, "executed", { count: trimmed.length });
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
        }
      )
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
            false
          );
          try {
            const issues = await listIssues(token, {
              owner: input.owner,
              repo: input.repo,
              state: input.state ?? undefined,
            });
            await updateToolCallStatus(ctx.db, record.id, "executed", { count: issues.length });
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
        }
      )
    );
  }

  if (isToolAvailable("github_create_issue", ctx)) {
    tools.push(
      tool(
        async (input) => {
          requireGithubToken(ctx);
          throw new ConfirmationRequiredError(
            "github_create_issue",
            input as Record<string, unknown>,
            `Crear issue "${input.title}" en ${input.owner}/${input.repo}.`
          );
        },
        {
          name: "github_create_issue",
          description:
            "Creates a new issue in a GitHub repository. Requires explicit user confirmation before execution.",
          schema: z.object({
            owner: z.string(),
            repo: z.string(),
            title: z.string(),
            body: z.string().nullable().optional().default(""),
          }),
        }
      )
    );
  }

  if (isToolAvailable("github_create_repo", ctx)) {
    tools.push(
      tool(
        async (input) => {
          requireGithubToken(ctx);
          throw new ConfirmationRequiredError(
            "github_create_repo",
            input as Record<string, unknown>,
            `Crear repositorio ${input.private ? "privado" : "público"} "${input.name}".`
          );
        },
        {
          name: "github_create_repo",
          description:
            "Creates a new repository under the authenticated user. Requires explicit user confirmation before execution.",
          schema: z.object({
            name: z.string().min(1),
            description: z.string().nullable().optional().default(""),
            private: z.boolean().nullable().optional().default(true),
          }),
        }
      )
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
            false
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
            await updateToolCallStatus(ctx.db, record.id, "executed", { count: trimmed.length });
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
        }
      )
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
            false
          );
          try {
            const event = await getEvent(token, { eventId: input.event_id });
            await updateToolCallStatus(ctx.db, record.id, "executed", { id: event.id });
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
        }
      )
    );
  }

  if (isToolAvailable("gcal_create_event", ctx)) {
    tools.push(
      tool(
        async (input) => {
          const token = requireGoogleToken(ctx);
          const tz = input.time_zone ?? ctx.integrationsContext.google?.timeZone ?? "Etc/UTC";
          const recurrence = normalizeRecurrence(input.recurrence);

          // For recurring events, look ahead 8 weeks for conflicts with the
          // first occurrence's hour-of-day; surface them in the summary so the
          // user sees them on the confirmation card.
          let conflictsLine = "";
          if (recurrence) {
            try {
              const winStart = input.start;
              const winEnd = new Date(
                new Date(input.start).getTime() + 8 * 7 * 24 * 60 * 60 * 1000
              ).toISOString();
              const conflicts = await findConflictsInWindow(token, {
                start: winStart,
                end: winEnd,
                timeZone: tz,
              });
              if (conflicts.length > 0) {
                conflictsLine = ` Atención: hay ${conflicts.length} eventos en las próximas 8 semanas que podrían chocar.`;
              }
            } catch {
              // Conflict scan is best-effort; never block creation on it.
            }
          }

          const recurrenceLine = recurrence ? ` ${describeRecurrence(recurrence)}` : "";
          const summary = `Crear evento «${input.summary}» del ${input.start.slice(0, 16).replace("T", " ")} al ${input.end.slice(0, 16).replace("T", " ")} (${tz}).${recurrenceLine}${conflictsLine}`;

          throw new ConfirmationRequiredError(
            "gcal_create_event",
            { ...(input as Record<string, unknown>), time_zone: tz },
            summary
          );
        },
        {
          name: "gcal_create_event",
          description:
            "Creates an event on the user's primary Google Calendar. Pass `recurrence` to schedule a recurring series. Requires explicit user confirmation before execution.",
          schema: z.object({
            summary: z.string(),
            description: z.string().nullable().optional(),
            start: z.string().describe("RFC3339 datetime, e.g. 2026-04-28T10:00:00-05:00"),
            end: z.string().describe("RFC3339 datetime"),
            time_zone: z.string().nullable().optional().describe("IANA timezone; defaults to user's profile timezone"),
            attendees: z.array(z.string().email()).nullable().optional(),
            recurrence: recurrenceSchema,
          }),
        }
      )
    );
  }

  if (isToolAvailable("gcal_update_event", ctx)) {
    tools.push(
      tool(
        async (input) => {
          requireGoogleToken(ctx);
          const scopeLabel =
            input.scope === "instance"
              ? "Esta acción afectará SOLO a esa ocurrencia."
              : "Esta acción afectará TODA la serie.";
          const changes: string[] = [];
          if (input.summary) changes.push(`título → «${input.summary}»`);
          if (input.start) changes.push(`inicio → ${input.start.slice(0, 16).replace("T", " ")}`);
          if (input.end) changes.push(`fin → ${input.end.slice(0, 16).replace("T", " ")}`);
          if (input.description !== undefined && input.description !== null)
            changes.push("descripción");
          const changeLine = changes.length > 0 ? ` Cambios: ${changes.join(", ")}.` : "";
          const summary = `Modificar evento ${input.event_id}.${changeLine} ${scopeLabel}`;
          throw new ConfirmationRequiredError(
            "gcal_update_event",
            input as Record<string, unknown>,
            summary
          );
        },
        {
          name: "gcal_update_event",
          description:
            "Modifies an existing Google Calendar event. For scope='instance' pass the instance id from gcal_list_events; for scope='series' pass the master event id. Requires explicit user confirmation.",
          schema: z.object({
            event_id: z.string(),
            scope: z.enum(["instance", "series"]),
            summary: z.string().nullable().optional(),
            description: z.string().nullable().optional(),
            start: z.string().nullable().optional(),
            end: z.string().nullable().optional(),
            time_zone: z.string().nullable().optional(),
          }),
        }
      )
    );
  }

  if (isToolAvailable("gcal_delete_event", ctx)) {
    tools.push(
      tool(
        async (input) => {
          requireGoogleToken(ctx);
          const scopeLabel =
            input.scope === "instance"
              ? "Esta acción afectará SOLO a esa ocurrencia."
              : "Esta acción afectará TODA la serie.";
          const summary = `Eliminar evento ${input.event_id}. ${scopeLabel}`;
          throw new ConfirmationRequiredError(
            "gcal_delete_event",
            input as Record<string, unknown>,
            summary
          );
        },
        {
          name: "gcal_delete_event",
          description:
            "Deletes a Google Calendar event. For scope='instance' pass the instance id; for scope='series' pass the master event id. Requires explicit user confirmation.",
          schema: z.object({
            event_id: z.string(),
            scope: z.enum(["instance", "series"]),
          }),
        }
      )
    );
  }

  return tools;
}

/**
 * Executes a previously-pending tool call after the user approves it. Called
 * from the confirmation endpoints (web + Telegram). Returns a human-readable
 * summary suitable to show in chat.
 */
export async function executeApprovedToolCall(params: {
  toolName: string;
  args: Record<string, unknown>;
  integrationsContext: IntegrationsContext;
}): Promise<{ summary: string; result: Record<string, unknown> }> {
  const { toolName, args, integrationsContext } = params;

  if (toolName === "github_create_issue") {
    const token = integrationsContext.github?.accessToken;
    if (!token) throw new Error("GitHub no está conectado.");
    const result = await createIssue(token, {
      owner: String(args.owner),
      repo: String(args.repo),
      title: String(args.title),
      body: args.body ? String(args.body) : "",
    });
    return {
      summary: `Issue #${result.number} creado: ${result.html_url}`,
      result: { ...result },
    };
  }

  if (toolName === "github_create_repo") {
    const token = integrationsContext.github?.accessToken;
    if (!token) throw new Error("GitHub no está conectado.");
    const result = await createRepository(token, {
      name: String(args.name),
      description: args.description ? String(args.description) : "",
      private: typeof args.private === "boolean" ? args.private : true,
    });
    return {
      summary: `Repositorio creado: ${result.html_url}`,
      result: { ...result },
    };
  }

  if (toolName === "gcal_create_event") {
    const token = integrationsContext.google?.accessToken;
    if (!token) throw new Error("Google no está conectado.");
    const tz = (args.time_zone as string | undefined) ?? integrationsContext.google?.timeZone ?? "Etc/UTC";
    const recurrence = args.recurrence as Recurrence | undefined;
    const result = await createEvent(token, {
      summary: String(args.summary),
      description: args.description ? String(args.description) : undefined,
      start: { dateTime: String(args.start), timeZone: tz },
      end: { dateTime: String(args.end), timeZone: tz },
      attendees: Array.isArray(args.attendees)
        ? (args.attendees as string[]).map((email) => ({ email }))
        : undefined,
      recurrence,
    });
    return {
      summary: `Evento creado: ${result.htmlLink ?? result.id}`,
      result: { id: result.id, htmlLink: result.htmlLink },
    };
  }

  if (toolName === "gcal_update_event") {
    const token = integrationsContext.google?.accessToken;
    if (!token) throw new Error("Google no está conectado.");
    const tz = (args.time_zone as string | undefined) ?? integrationsContext.google?.timeZone ?? "Etc/UTC";
    const result = await updateEvent(token, {
      eventId: String(args.event_id),
      scope: args.scope as "instance" | "series",
      summary: args.summary ? String(args.summary) : undefined,
      description: args.description ? String(args.description) : undefined,
      start: args.start ? { dateTime: String(args.start), timeZone: tz } : undefined,
      end: args.end ? { dateTime: String(args.end), timeZone: tz } : undefined,
    });
    return {
      summary: `Evento actualizado: ${result.htmlLink ?? result.id}`,
      result: { id: result.id, htmlLink: result.htmlLink },
    };
  }

  if (toolName === "gcal_delete_event") {
    const token = integrationsContext.google?.accessToken;
    if (!token) throw new Error("Google no está conectado.");
    await deleteEvent(token, {
      eventId: String(args.event_id),
      scope: args.scope as "instance" | "series",
    });
    return {
      summary: `Evento eliminado.`,
      result: { event_id: String(args.event_id), scope: String(args.scope) },
    };
  }

  throw new Error(`Unknown tool "${toolName}" for approval execution.`);
}
