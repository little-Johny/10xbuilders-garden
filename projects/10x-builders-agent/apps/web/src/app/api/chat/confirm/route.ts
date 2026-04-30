import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServerClient, getPendingToolCall } from "@agents/db";
import { AlreadyResolvedError, runAgent } from "@agents/agent";
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
      // Either never existed or was already resolved by another client.
      return NextResponse.json(
        { error: "already_resolved" },
        { status: 409 },
      );
    }

    // Authorisation: the tool_call must belong to a session owned by this user.
    const { data: session } = await supabase
      .from("agent_sessions")
      .select("id, user_id, channel")
      .eq("id", pending.session_id)
      .single();
    if (!session || session.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const integrationsContext = await loadIntegrationsContext(db, user.id);

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

    if (!pending.thread_id) {
      // Legacy pending row from before per-turn thread_ids landed. Cannot be
      // resumed via LangGraph; surface the same 409 the UI already handles.
      return NextResponse.json(
        { error: "already_resolved" },
        { status: 409 },
      );
    }

    try {
      const result = await runAgent({
        resumeDecision: decision === "approve" ? "approve" : "reject",
        threadId: pending.thread_id,
        userId: user.id,
        sessionId: pending.session_id,
        systemPrompt:
          (profile?.agent_system_prompt as string) ?? "Eres un asistente útil.",
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
        response: result.response,
        pendingConfirmation: result.pendingConfirmation,
        toolCalls: result.toolCalls,
      });
    } catch (err) {
      if (err instanceof AlreadyResolvedError) {
        return NextResponse.json(
          { error: "already_resolved" },
          { status: 409 },
        );
      }
      throw err;
    }
  } catch (error) {
    console.error("Confirm API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
