import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServerClient, getPendingToolCall } from "@agents/db";
import { AlreadyResolvedError, runAgent } from "@agents/agent";
import { loadAgentContext } from "@/lib/agent/load-context";

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

    if (!pending.thread_id) {
      // Legacy pending row from before per-turn thread_ids landed. Cannot be
      // resumed via LangGraph; surface the same 409 the UI already handles.
      return NextResponse.json(
        { error: "already_resolved" },
        { status: 409 },
      );
    }

    const ctx = await loadAgentContext(db, user.id);

    try {
      const result = await runAgent({
        resumeDecision: decision === "approve" ? "approve" : "reject",
        threadId: pending.thread_id,
        userId: user.id,
        sessionId: pending.session_id,
        systemPrompt: ctx.systemPrompt,
        db,
        enabledTools: ctx.toolSettings,
        integrations: ctx.integrations,
        integrationsContext: ctx.integrationsContext,
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
