import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  closeSession,
  createServerClient,
  markSessionFlushed,
} from "@agents/db";
import { memoryFlush } from "@agents/agent";

/**
 * POST /api/sessions/close
 *
 * Cierre EXPLÍCITO de la sesión web del usuario ("Nueva conversación"). Reclama
 * la sesión activa (CAS active→closed) y corre el flush de forma SÍNCRONA: en
 * serverless un fire-and-forget se mataría al responder. Si el flush falla, la
 * sesión queda `closed` con `flushed_at IS NULL` y el sweep la reintenta.
 *
 * No crea la sesión nueva: al quedar sin activa, el siguiente mensaje la crea
 * vía getOrCreateSession. Idempotente: responde ok aunque no hubiera sesión.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createServerClient();

  try {
    const closed = await closeSession(db, user.id, "web");
    if (closed) {
      await memoryFlush({ db, userId: user.id, sessionId: closed.id });
      await markSessionFlushed(db, closed.id);
    }
    return NextResponse.json({ ok: true, closed: closed?.id ?? null });
  } catch (error) {
    console.error("[sessions/close] failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
