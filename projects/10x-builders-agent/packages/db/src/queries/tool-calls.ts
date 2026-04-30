import type { DbClient } from "../client";
import type { ToolCall } from "@agents/types";

export async function createToolCall(
  db: DbClient,
  sessionId: string,
  toolName: string,
  args: Record<string, unknown>,
  requiresConfirmation: boolean,
  threadId?: string,
) {
  const insert: Record<string, unknown> = {
    session_id: sessionId,
    tool_name: toolName,
    arguments_json: args,
    status: requiresConfirmation ? "pending_confirmation" : "approved",
    requires_confirmation: requiresConfirmation,
  };
  if (threadId) insert.thread_id = threadId;
  const { data, error } = await db
    .from("tool_calls")
    .insert(insert)
    .select()
    .single();
  if (error) throw error;
  return data as ToolCall;
}

export async function updateToolCallStatus(
  db: DbClient,
  toolCallId: string,
  status: ToolCall["status"],
  resultJson?: Record<string, unknown>
) {
  const update: Record<string, unknown> = { status };
  if (resultJson) update.result_json = resultJson;
  if (status === "executed" || status === "failed") {
    update.finished_at = new Date().toISOString();
  }
  const { error } = await db
    .from("tool_calls")
    .update(update)
    .eq("id", toolCallId);
  if (error) throw error;
}

export async function getPendingToolCall(db: DbClient, toolCallId: string) {
  const { data } = await db
    .from("tool_calls")
    .select("*")
    .eq("id", toolCallId)
    .eq("status", "pending_confirmation")
    .single();
  return data as ToolCall | null;
}

/**
 * Returns the most recent `pending_confirmation` row for (sessionId, toolName,
 * threadId), or null. The HITL graph node calls this BEFORE `createToolCall`
 * because LangGraph re-runs the entire node from the start when resuming
 * after an `interrupt()` — without this lookup the second pass would insert
 * a duplicate row. The lookup is scoped by `threadId` so that pendings from
 * a previous turn (different thread) are never reused.
 */
export async function findExistingPendingToolCall(
  db: DbClient,
  sessionId: string,
  toolName: string,
  threadId?: string,
) {
  let query = db
    .from("tool_calls")
    .select("*")
    .eq("session_id", sessionId)
    .eq("tool_name", toolName)
    .eq("status", "pending_confirmation");
  if (threadId) query = query.eq("thread_id", threadId);
  const { data } = await query
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as ToolCall | null) ?? null;
}
