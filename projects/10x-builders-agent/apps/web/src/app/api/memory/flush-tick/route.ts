import { NextResponse } from "next/server";
import {
  claimSessionForFlush,
  createServerClient,
  getIdleSessions,
  markSessionFlushed,
} from "@agents/db";
import { memoryFlush } from "@agents/agent";

/**
 * POST /api/memory/flush-tick
 *
 * Llamado por pg_cron cada N minutos (vía pg_net.http_post). Barre las sesiones
 * inactivas (último mensaje hace más de MEMORY_FLUSH_IDLE_MINUTES) y las
 * cerradas sin flushear (reintento), las reclama con CAS (active→closed) y por
 * cada una corre `memoryFlush` para destilar recuerdos durables.
 *
 * Auth: header `x-cron-secret` con el valor de CRON_SECRET. Usa el service-role
 * de Supabase para saltarse RLS — la única protección es el secret.
 */
function idleMinutes(): number {
  const raw = Number(process.env.MEMORY_FLUSH_IDLE_MINUTES);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 30;
}

export async function POST(request: Request) {
  const secret = request.headers.get("x-cron-secret");
  const expected = process.env.CRON_SECRET;
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createServerClient();
  const startedAt = new Date();

  // El umbral es por usuario (profiles.memory_flush_idle_minutes); aquí pasamos
  // solo el default/fallback para perfiles sin valor propio.
  const sessions = await getIdleSessions(
    db,
    startedAt.toISOString(),
    idleMinutes(),
  );

  const results: Array<{
    id: string;
    ok: boolean;
    skipped?: boolean;
    extracted?: number;
    error?: string;
  }> = [];

  for (const session of sessions) {
    // Reclamar con CAS. Si ya está closed (reintento) el claim no aplica, pero
    // aún así debemos flushearla; solo saltamos si otra vía activa la reclamó.
    if (session.status === "active") {
      const claimed = await claimSessionForFlush(db, session.id);
      if (!claimed) {
        results.push({ id: session.id, ok: true, skipped: true });
        continue;
      }
    }

    try {
      const { extracted } = await memoryFlush({
        db,
        userId: session.user_id,
        sessionId: session.id,
      });
      await markSessionFlushed(db, session.id);
      results.push({ id: session.id, ok: true, extracted });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[memory/flush-tick] session ${session.id} failed:`, err);
      results.push({ id: session.id, ok: false, error: msg });
    }
  }

  return NextResponse.json({
    processed: results.length,
    results,
    started_at: startedAt.toISOString(),
  });
}
