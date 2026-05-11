import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServerClient } from "@agents/db";
import { runAgent } from "@agents/agent";
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

    const { message } = await request.json();
    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Message required" }, { status: 400 });
    }

    const db = createServerClient();

    let session = await supabase
      .from("agent_sessions")
      .select("*")
      .eq("user_id", user.id)
      .eq("channel", "web")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .single()
      .then((r) => r.data);

    if (!session) {
      const { data } = await supabase
        .from("agent_sessions")
        .insert({
          user_id: user.id,
          channel: "web",
          status: "active",
          budget_tokens_used: 0,
          budget_tokens_limit: 100000,
        })
        .select()
        .single();
      session = data;
    }

    if (!session) {
      return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
    }

    const ctx = await loadAgentContext(db, user.id);

    const result = await runAgent({
      message,
      userId: user.id,
      sessionId: session.id,
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
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
