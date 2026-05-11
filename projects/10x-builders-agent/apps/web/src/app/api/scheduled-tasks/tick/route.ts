import { NextResponse } from "next/server";
import {
  claimScheduledTask,
  createServerClient,
  getDueTasks,
  markScheduledTaskFailed,
  markScheduledTaskSuccess,
} from "@agents/db";
import {
  dispatchNotification,
  evaluateCron,
  runAgent,
} from "@agents/agent";
import { loadAgentContext } from "@/lib/agent/load-context";

/**
 * POST /api/scheduled-tasks/tick
 *
 * Llamado por pg_cron cada minuto (vía pg_net.http_post). Lee tareas due,
 * intenta reclamarlas con CAS y por cada reclamada arranca runAgent en una
 * sesión nueva (channel='scheduled'), notificando al usuario por sus canales
 * configurados.
 *
 * Auth: header `x-cron-secret` con el valor de CRON_SECRET. El endpoint usa
 * el service-role del cliente de Supabase para saltarse RLS — la única
 * protección es el secret, que debe rotarse si se sospecha leak.
 */
export async function POST(request: Request) {
  const secret = request.headers.get("x-cron-secret");
  const expected = process.env.CRON_SECRET;
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createServerClient();
  const startedAt = new Date();
  const due = await getDueTasks(db, startedAt.toISOString());

  const results: Array<{
    id: string;
    ok: boolean;
    skipped?: boolean;
    pending?: boolean;
    error?: string;
  }> = [];

  for (const task of due) {
    let nextIso: string;
    try {
      const ev = evaluateCron(task.cron_expression, {
        from: startedAt,
        timezone: task.timezone ?? undefined,
      });
      nextIso = ev.nextIso;
    } catch (err) {
      // Cron inválida: marcar fallida y notificar (la corregirá el usuario).
      await markScheduledTaskFailed(db, task.id, task.failure_count);
      await dispatchNotification(task.notification_channels, task.user_id, db, {
        kind: "scheduled_failed",
        taskName: task.name,
        error: `cron_expression inválida: ${err instanceof Error ? err.message : String(err)}`,
      });
      results.push({
        id: task.id,
        ok: false,
        error: "invalid_cron",
      });
      continue;
    }

    const claimed = await claimScheduledTask(
      db,
      task.id,
      task.last_execution,
      startedAt.toISOString(),
      nextIso,
    );
    if (!claimed) {
      // Otro worker se adelantó — comportamiento esperado en CAS.
      results.push({ id: task.id, ok: true, skipped: true });
      continue;
    }

    const { data: session } = await db
      .from("agent_sessions")
      .insert({
        user_id: task.user_id,
        channel: "scheduled",
        status: "active",
        budget_tokens_used: 0,
        budget_tokens_limit: 100000,
      })
      .select()
      .single();
    if (!session) {
      await markScheduledTaskFailed(db, task.id, task.failure_count);
      results.push({ id: task.id, ok: false, error: "session_create_failed" });
      continue;
    }

    try {
      // Cargar contexto del usuario en el momento del DISPARO (el preámbulo
      // temporal del system prompt reflejará "ahora", no la creación de la
      // tarea — esto es lo que el plan llama "edge case del canal scheduled").
      const ctx = await loadAgentContext(db, task.user_id, { now: startedAt });

      await dispatchNotification(task.notification_channels, task.user_id, db, {
        kind: "scheduled_started",
        taskName: task.name,
      });

      const result = await runAgent({
        message: task.description,
        userId: task.user_id,
        sessionId: (session as { id: string }).id,
        systemPrompt: ctx.systemPrompt,
        db,
        enabledTools: ctx.toolSettings,
        integrations: ctx.integrations,
        integrationsContext: ctx.integrationsContext,
        autonomous: task.autonomous,
      });

      if (result.pendingConfirmation && !task.autonomous) {
        // El grafo se interrumpió y el flujo HITL queda pendiente del usuario.
        // Enviamos la tarjeta de aprobación incluyendo el nombre de la tarea
        // para que el usuario sepa qué disparo es.
        await dispatchNotification(task.notification_channels, task.user_id, db, {
          kind: "pending_confirmation",
          toolCallId: result.pendingConfirmation.toolCallId,
          toolName: result.pendingConfirmation.toolName,
          summary: result.pendingConfirmation.summary,
          taskName: task.name,
        });
        await markScheduledTaskSuccess(db, task.id);
        results.push({ id: task.id, ok: true, pending: true });
      } else {
        await dispatchNotification(task.notification_channels, task.user_id, db, {
          kind: "scheduled_completed",
          taskName: task.name,
          reply: result.response ?? "(sin respuesta)",
        });
        await markScheduledTaskSuccess(db, task.id);
        results.push({ id: task.id, ok: true });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[scheduled-tasks/tick] task ${task.id} failed:`, err);
      await markScheduledTaskFailed(db, task.id, task.failure_count);
      await dispatchNotification(task.notification_channels, task.user_id, db, {
        kind: "scheduled_failed",
        taskName: task.name,
        error: msg,
      });
      results.push({ id: task.id, ok: false, error: msg });
    }
  }

  return NextResponse.json({
    processed: results.length,
    results,
    started_at: startedAt.toISOString(),
  });
}
