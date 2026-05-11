import type { DbClient } from "../client";
import type { NotificationChannel, ScheduledTask, ScheduledTaskStatus } from "@agents/types";

const FAILURE_THRESHOLD = 5;

export interface CreateScheduledTaskInput {
  name: string;
  description: string;
  cron_expression: string;
  timezone?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  autonomous?: boolean;
  notification_channels?: NotificationChannel[];
  next_execution: string;
}

export async function createScheduledTask(
  db: DbClient,
  userId: string,
  input: CreateScheduledTaskInput,
) {
  const insert = {
    user_id: userId,
    name: input.name,
    description: input.description,
    cron_expression: input.cron_expression,
    timezone: input.timezone ?? null,
    start_at: input.start_at ?? null,
    end_at: input.end_at ?? null,
    next_execution: input.next_execution,
    autonomous: input.autonomous ?? false,
    notification_channels:
      input.notification_channels && input.notification_channels.length > 0
        ? input.notification_channels
        : (["telegram"] as NotificationChannel[]),
  };
  const { data, error } = await db
    .from("scheduled_tasks")
    .insert(insert)
    .select()
    .single();
  if (error) throw error;
  return data as ScheduledTask;
}

export async function listScheduledTasks(
  db: DbClient,
  userId: string,
  opts: { status?: ScheduledTaskStatus } = {},
) {
  let query = db
    .from("scheduled_tasks")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (opts.status) query = query.eq("status", opts.status);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as ScheduledTask[];
}

export async function getScheduledTask(db: DbClient, taskId: string) {
  const { data } = await db
    .from("scheduled_tasks")
    .select("*")
    .eq("id", taskId)
    .maybeSingle();
  return (data as ScheduledTask | null) ?? null;
}

/**
 * Cambia el flag `enabled` sin tocar nada más. Lo usa el tool
 * `update_scheduled_task` para pausar/reanudar tareas sin perder su histórico
 * (last_execution, failure_count, etc.). Filtra por user_id como defensa en
 * profundidad.
 */
export async function setScheduledTaskEnabled(
  db: DbClient,
  taskId: string,
  userId: string,
  enabled: boolean,
) {
  const { error } = await db
    .from("scheduled_tasks")
    .update({ enabled, updated_at: new Date().toISOString() })
    .eq("id", taskId)
    .eq("user_id", userId);
  if (error) throw error;
}

export async function deleteScheduledTask(db: DbClient, taskId: string, userId: string) {
  // user_id en el WHERE evita borrar de otro usuario aunque el endpoint use
  // service role: el agente nunca debería borrar tareas ajenas.
  const { error } = await db
    .from("scheduled_tasks")
    .delete()
    .eq("id", taskId)
    .eq("user_id", userId);
  if (error) throw error;
}

/**
 * Tareas elegibles para disparo en este momento. Filtros: enabled, status,
 * ventana [start_at, end_at], y next_execution <= now. El índice parcial
 * `scheduled_tasks_due_idx` cubre las dos primeras condiciones.
 */
export async function getDueTasks(db: DbClient, nowIso: string) {
  const { data, error } = await db
    .from("scheduled_tasks")
    .select("*")
    .eq("enabled", true)
    .eq("status", "active")
    .lte("next_execution", nowIso)
    .or(`start_at.is.null,start_at.lte.${nowIso}`)
    .or(`end_at.is.null,end_at.gt.${nowIso}`)
    .limit(50);
  if (error) throw error;
  return (data ?? []) as ScheduledTask[];
}

/**
 * CAS optimista para "reclamar" una tarea antes de ejecutarla. Si dos workers
 * llegan al mismo tiempo, solo uno consigue actualizar la fila (el WHERE
 * incluye el `last_execution` previo, que el segundo ya no encontrará).
 *
 * Devuelve true si esta llamada reclamó la tarea, false si otro worker se
 * adelantó (en cuyo caso el caller debe saltarla).
 */
export async function claimScheduledTask(
  db: DbClient,
  taskId: string,
  previousLastExecution: string | null,
  newLastExecution: string,
  newNextExecution: string,
): Promise<boolean> {
  let query = db
    .from("scheduled_tasks")
    .update({
      last_execution: newLastExecution,
      next_execution: newNextExecution,
      updated_at: newLastExecution,
    })
    .eq("id", taskId);
  if (previousLastExecution === null) {
    query = query.is("last_execution", null);
  } else {
    query = query.eq("last_execution", previousLastExecution);
  }
  const { data, error } = await query.select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

export async function markScheduledTaskSuccess(db: DbClient, taskId: string) {
  const { error } = await db
    .from("scheduled_tasks")
    .update({ failure_count: 0, updated_at: new Date().toISOString() })
    .eq("id", taskId);
  if (error) throw error;
}

export async function markScheduledTaskFailed(
  db: DbClient,
  taskId: string,
  failureCount: number,
) {
  const next = failureCount + 1;
  const fields: Record<string, unknown> = {
    failure_count: next,
    updated_at: new Date().toISOString(),
  };
  if (next >= FAILURE_THRESHOLD) fields.status = "failed";
  const { error } = await db.from("scheduled_tasks").update(fields).eq("id", taskId);
  if (error) throw error;
}

export async function setScheduledTaskNextExecution(
  db: DbClient,
  taskId: string,
  nextIso: string,
) {
  const { error } = await db
    .from("scheduled_tasks")
    .update({ next_execution: nextIso, updated_at: new Date().toISOString() })
    .eq("id", taskId);
  if (error) throw error;
}
