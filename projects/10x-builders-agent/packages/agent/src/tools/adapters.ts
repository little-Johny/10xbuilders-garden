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
            const repos = await listRepositories(token, { perPage: input.per_page });
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
              state: input.state,
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

  throw new Error(`Unknown tool "${toolName}" for approval execution.`);
}
