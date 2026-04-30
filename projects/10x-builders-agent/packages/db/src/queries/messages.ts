import type { DbClient } from "../client";
import type { AgentMessage, MessageRole } from "@agents/types";

export async function addMessage(
  db: DbClient,
  sessionId: string,
  role: MessageRole,
  content: string,
  extra?: { tool_call_id?: string; structured_payload?: Record<string, unknown> }
) {
  const { data, error } = await db
    .from("agent_messages")
    .insert({ session_id: sessionId, role, content, ...extra })
    .select()
    .single();
  if (error) throw error;
  return data as AgentMessage;
}

export async function getSessionMessages(
  db: DbClient,
  sessionId: string,
  limit = 50
) {
  // Fetch the LATEST `limit` rows (descending), then reverse to chronological
  // order. Ascending+limit silently drops the most recent rows once the
  // session grows past `limit`, which hides the very turns the agent needs
  // to stay coherent.
  const { data, error } = await db
    .from("agent_messages")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as AgentMessage[]).slice().reverse();
}

/**
 * Shallow-merges `patch` into the `structured_payload` of a single message.
 * Used by `runAgent` to mark a pending-confirmation card as resolved (e.g.
 * `{ resolved: true, decision: 'approve' }`) so a refresh of the chat UI does
 * not show a stale active card after the user already approved/rejected.
 *
 * Reads → merges → writes. Not concurrency-safe across simultaneous resolvers
 * of the same message; the HITL flow only resolves once (the second one hits
 * the 409 in the API layer), so a race is not expected here.
 */
export async function updateMessageStructuredPayload(
  db: DbClient,
  messageId: string,
  patch: Record<string, unknown>
) {
  const { data: current, error: readErr } = await db
    .from("agent_messages")
    .select("structured_payload")
    .eq("id", messageId)
    .maybeSingle();
  if (readErr) throw readErr;
  const merged = {
    ...((current?.structured_payload as Record<string, unknown> | null) ?? {}),
    ...patch,
  };
  const { error: writeErr } = await db
    .from("agent_messages")
    .update({ structured_payload: merged })
    .eq("id", messageId);
  if (writeErr) throw writeErr;
}
