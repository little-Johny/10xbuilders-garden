import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  addMessage,
  createServerClient,
  getPendingToolCall,
  updateToolCallStatus,
} from "@agents/db";
import { executeApprovedToolCall, runAgent } from "@agents/agent";
import { loadIntegrationsContext } from "@/lib/agent/integrations-context";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { toolCallId, decision } = await request.json();
    if (typeof toolCallId !== "string" || !["approve", "reject"].includes(decision)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const db = createServerClient();
    const pending = await getPendingToolCall(db, toolCallId);
    if (!pending) {
      return NextResponse.json({ error: "Tool call not pending" }, { status: 404 });
    }

    // Authorisation: the tool_call must belong to a session owned by this
    // user. We rely on the RLS-scoped `supabase` client here instead of the
    // service-role `db` so an attacker can't confirm someone else's pending
    // action by guessing ids.
    const { data: session } = await supabase
      .from("agent_sessions")
      .select("id, user_id, channel")
      .eq("id", pending.session_id)
      .single();
    if (!session || session.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (decision === "reject") {
      await updateToolCallStatus(db, pending.id, "rejected");
      await addMessage(
        db,
        pending.session_id,
        "assistant",
        "Acción cancelada a petición del usuario."
      );
      return NextResponse.json({
        response: "Acción cancelada a petición del usuario.",
        pendingConfirmation: null,
        toolCalls: [],
      });
    }

    // Approve: execute the tool with the stored args using the decrypted token.
    const integrationsContext = await loadIntegrationsContext(db, user.id);
    let execution: { summary: string; result: Record<string, unknown> };
    try {
      execution = await executeApprovedToolCall({
        toolName: pending.tool_name,
        args: pending.arguments_json ?? {},
        integrationsContext,
      });
    } catch (err) {
      await updateToolCallStatus(db, pending.id, "failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      return NextResponse.json(
        { error: "execution_failed", detail: err instanceof Error ? err.message : "unknown" },
        { status: 500 }
      );
    }
    await updateToolCallStatus(db, pending.id, "executed", execution.result);

    // Re-invoke the agent with a synthetic user turn describing the outcome,
    // so it can summarise in its own voice. This is the "reinvoke" branch we
    // agreed on: one extra LLM call, better UX.
    const { data: profile } = await supabase
      .from("profiles")
      .select("agent_system_prompt")
      .eq("id", user.id)
      .single();

    const { data: toolSettings } = await supabase
      .from("user_tool_settings")
      .select("*")
      .eq("user_id", user.id);

    const { data: integrations } = await supabase
      .from("user_integrations")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "active");

    const followUp = `Acabo de aprobar y el sistema ejecutó "${pending.tool_name}" con éxito. Resultado: ${execution.summary}. Resume brevemente al usuario lo que ocurrió.`;

    const result = await runAgent({
      message: followUp,
      userId: user.id,
      sessionId: pending.session_id,
      systemPrompt: (profile?.agent_system_prompt as string) ?? "Eres un asistente útil.",
      db,
      enabledTools: (toolSettings ?? []).map((t: Record<string, unknown>) => ({
        id: t.id as string,
        user_id: t.user_id as string,
        tool_id: t.tool_id as string,
        enabled: t.enabled as boolean,
        config_json: (t.config_json as Record<string, unknown>) ?? {},
      })),
      integrations: (integrations ?? []).map((i: Record<string, unknown>) => ({
        id: i.id as string,
        user_id: i.user_id as string,
        provider: i.provider as string,
        scopes: (i.scopes as string[]) ?? [],
        status: i.status as "active" | "revoked" | "expired",
        created_at: i.created_at as string,
      })),
      integrationsContext,
    });

    return NextResponse.json({
      response: result.response ?? execution.summary,
      pendingConfirmation: result.pendingConfirmation,
      toolCalls: result.toolCalls,
      executed: { summary: execution.summary },
    });
  } catch (error) {
    console.error("Confirm API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
