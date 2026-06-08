import type { DbClient } from "../client";
import type { AgentSession, Memory, MemoryType } from "@agents/types";

export interface SaveMemoryRow {
  type: MemoryType;
  content: string;
  embedding: number[];
}

/** Inserta un recuerdo. El flush la llama por cada hecho nuevo. */
export async function saveMemory(
  db: DbClient,
  userId: string,
  row: SaveMemoryRow,
) {
  const { data, error } = await db
    .from("memories")
    .insert({
      user_id: userId,
      type: row.type,
      content: row.content,
      embedding: row.embedding,
    })
    .select()
    .single();
  if (error) throw error;
  return data as Memory;
}

/**
 * Lista los recuerdos más recientes del usuario (sin el embedding, que es
 * pesado). El flush los pasa al prompt como contexto de "ya lo sé, no lo
 * repitas" — refuerzo barato; el gate autoritativo del dedup es por embedding.
 */
export async function listMemories(
  db: DbClient,
  userId: string,
  limit = 50,
): Promise<Pick<Memory, "id" | "type" | "content">[]> {
  const { data, error } = await db
    .from("memories")
    .select("id, type, content")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as Pick<Memory, "id" | "type" | "content">[];
}

export interface MatchedMemory {
  id: string;
  type: MemoryType;
  content: string;
  retrieval_count: number;
  similarity: number;
}

/**
 * Retrieval enfocado: top-K recuerdos del usuario por cosine similarity al
 * embedding del input actual (desempate por retrieval_count). Vía RPC
 * `match_memories` para que el `<=>` y el orden vivan en Postgres.
 */
export async function matchMemories(
  db: DbClient,
  userId: string,
  embedding: number[],
  k = 6,
): Promise<MatchedMemory[]> {
  const { data, error } = await db.rpc("match_memories", {
    query_embedding: embedding,
    match_user_id: userId,
    match_count: k,
  });
  if (error) throw error;
  return (data ?? []) as MatchedMemory[];
}

/**
 * Dedup del flush: devuelve el recuerdo del mismo `type` más parecido por
 * encima de `minSimilarity`, o `null` si no hay ninguno. El flush la usa por
 * cada hecho candidato para decidir insertar vs. reforzar.
 */
export async function findSimilarMemory(
  db: DbClient,
  userId: string,
  embedding: number[],
  type: MemoryType,
  minSimilarity = 0.9,
): Promise<{ id: string; similarity: number } | null> {
  const { data, error } = await db.rpc("find_similar_memory", {
    query_embedding: embedding,
    match_user_id: userId,
    match_type: type,
    min_similarity: minSimilarity,
  });
  if (error) throw error;
  const rows = (data ?? []) as { id: string; similarity: number }[];
  return rows[0] ?? null;
}

/**
 * Incremento atómico del contador (+ refresca last_retrieved_at). Lo usan el
 * retrieval (recuerdos recuperados) y el dedup (refuerzo de un duplicado).
 */
export async function bumpRetrievalCount(
  db: DbClient,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await db.rpc("bump_retrieval_count", { ids });
  if (error) throw error;
}

/** Acota el umbral de inactividad al rango soportado (igual que el check de la BD). */
function clampIdleMinutes(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1440, Math.max(5, Math.floor(n)));
}

/**
 * Sesiones a flushear: `active` cuyo último mensaje es anterior al umbral de
 * inactividad DE SU USUARIO (preferencia `profiles.memory_flush_idle_minutes`,
 * cae a `defaultIdleMinutes`), MÁS `closed` con `flushed_at IS NULL` (reintento
 * de un flush que se cayó). Devuelve filas de agent_sessions.
 *
 * El umbral es por usuario, así que no hay un corte global: se evalúa sesión a
 * sesión contra el de su perfil. supabase-js no permite un OR sobre subconsulta
 * agregada limpiamente, así que resolvemos las ramas por separado y unimos en JS.
 */
export async function getIdleSessions(
  db: DbClient,
  nowIso: string,
  defaultIdleMinutes: number,
): Promise<AgentSession[]> {
  // Rama A: sesiones cerradas sin flushear (reintento). Barato y directo.
  const { data: retryRows, error: retryErr } = await db
    .from("agent_sessions")
    .select("*")
    .eq("status", "closed")
    .is("flushed_at", null)
    .limit(50);
  if (retryErr) throw retryErr;

  // Rama B: sesiones activas creadas antes del corte MÁS LAXO posible (el mínimo
  // del rango = 5 min); descarta las demasiado nuevas sin pedir su perfil.
  const widestCutoff = new Date(
    new Date(nowIso).getTime() - 5 * 60_000,
  ).toISOString();
  const { data: activeRows, error: activeErr } = await db
    .from("agent_sessions")
    .select("*")
    .eq("status", "active")
    .lte("created_at", widestCutoff)
    .limit(200);
  if (activeErr) throw activeErr;

  const active = (activeRows ?? []) as AgentSession[];

  // Umbral por usuario en un solo round-trip a profiles.
  const userIds = [...new Set(active.map((s) => s.user_id))];
  const thresholdByUser = new Map<string, number>();
  if (userIds.length > 0) {
    const { data: profiles } = await db
      .from("profiles")
      .select("id, memory_flush_idle_minutes")
      .in("id", userIds);
    for (const p of (profiles ?? []) as Record<string, unknown>[]) {
      thresholdByUser.set(
        p.id as string,
        clampIdleMinutes(p.memory_flush_idle_minutes, defaultIdleMinutes),
      );
    }
  }

  const nowMs = new Date(nowIso).getTime();
  const idleActive: AgentSession[] = [];
  for (const s of active) {
    const minutes = thresholdByUser.get(s.user_id) ?? defaultIdleMinutes;
    const cutoffIso = new Date(nowMs - minutes * 60_000).toISOString();

    const { data: lastMsg } = await db
      .from("agent_messages")
      .select("created_at")
      .eq("session_id", s.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const lastActivity = (lastMsg?.created_at as string | undefined) ?? s.created_at;
    if (lastActivity < cutoffIso) idleActive.push(s);
  }

  return [...((retryRows ?? []) as AgentSession[]), ...idleActive];
}

/**
 * CAS para reclamar una sesión por id antes de flushearla: solo el primero que
 * la pase de `active`→`closed` la procesa. Devuelve la fila reclamada o `null`
 * si otra vía (sweep o cierre explícito) se adelantó.
 */
export async function claimSessionForFlush(
  db: DbClient,
  sessionId: string,
): Promise<AgentSession | null> {
  const { data, error } = await db
    .from("agent_sessions")
    .update({ status: "closed", updated_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("status", "active")
    .select()
    .maybeSingle();
  if (error) throw error;
  return (data as AgentSession | null) ?? null;
}

/**
 * Cierre EXPLÍCITO: reclama la sesión `active` del usuario en ese canal
 * (`active`→`closed`) vía el mismo CAS, resolviéndola por (userId, channel).
 * Devuelve la fila reclamada o `null` si no había sesión activa.
 */
export async function closeSession(
  db: DbClient,
  userId: string,
  channel: string,
): Promise<AgentSession | null> {
  const { data, error } = await db
    .from("agent_sessions")
    .update({ status: "closed", updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("channel", channel)
    .eq("status", "active")
    .select()
    .maybeSingle();
  if (error) throw error;
  return (data as AgentSession | null) ?? null;
}

/** Marca el flush como terminado (idempotente para el reintento del sweep). */
export async function markSessionFlushed(
  db: DbClient,
  sessionId: string,
): Promise<void> {
  const { error } = await db
    .from("agent_sessions")
    .update({ flushed_at: new Date().toISOString() })
    .eq("id", sessionId);
  if (error) throw error;
}
