# Plan — Memoria a largo plazo (issue #8)

## Contexto y objetivo

Hoy el agente solo tiene **memoria a corto plazo**: el `compaction_node` mantiene
coherente el contexto **dentro** de una sesión, pero ese contexto muere cuando la
sesión termina. Cada conversación nueva arranca como una pizarra en blanco —
amnesia entre sesiones (ver `week-06/04-long-term-memory-fundamentals.md`).

Queremos cerrar el otro extremo: que el conocimiento durable **sobreviva entre
sesiones** del mismo usuario. El ciclo a cubrir es:

```
extraer hechos durables al cerrar la sesión  (memory flush, asíncrono)
        → guardarlos en Supabase con embedding (pgvector)
        → recuperarlos por similitud al iniciar la siguiente sesión (retrieval)
        → inyectarlos en el systemPrompt antes de ejecutar (memory injection)
```

**El identificador que cruza sesiones es `userId`**, no `sessionId`. Las sesiones
siguen siendo aisladas; lo que persiste y se comparte entre ellas es la tabla
`memories`, llaveada por usuario.

### Hallazgo del estado actual (condiciona el diseño)

- **Ninguna sesión se marca `closed` hoy.** `getOrCreateSession` reutiliza
  siempre la sesión `active` del canal; el estado `'closed'` existe en el tipo y
  en el `check` de la tabla pero **nadie lo escribe**. Por tanto **no hay
  disparador de cierre de sesión** del que colgar el flush — hay que crearlo.
- El flush debe correr **fuera del grafo** (post-sesión, asíncrono). El patrón ya
  probado en el repo para trabajo de fondo disparado por tiempo es
  **pg_cron + pg_net → endpoint con service-role** (ver `scheduled-tasks`). Lo
  reutilizamos: un *sweep* de inactividad cierra y flushea las sesiones ociosas.
- La inyección, en cambio, es **síncrona**: un nodo nuevo al inicio del grafo,
  igual que `compaction_node` es un nodo del grafo.

## Decisiones cerradas

| Decisión | Elegido | Por qué |
|---|---|---|
| **Cierre de sesión** | **Dos vías:** (a) **explícita** — el usuario pulsa "Nueva conversación" → `POST /api/sessions/close`; (b) **automática** — *sweep* de inactividad vía **pg_cron**. Ambas pasan por el mismo `memoryFlush`. | El usuario pide poder cerrar/crear sesiones a voluntad. La vía explícita da control inmediato; el sweep cubre las sesiones que el usuario simplemente abandona. Misma mecánica de flush para ambas. |
| **Nueva sesión** | Cerrar la `active` → el siguiente mensaje crea una nueva vía `getOrCreateSession` (ya existente) | No hay que tocar el alta de sesión: al no haber sesión `active`, el chat route inserta una limpia. La continuidad la da la memoria (key=`userId`), no la fila de sesión. |
| **Disparo del flush automático** | pg_cron → `POST /api/memory/flush-tick` (service-role) | Reutiliza la infra de `scheduled-tasks` (cero infra nueva). Es el equivalente a "la conversación se da por cerrada por inactividad" de la lección. |
| **Señal de inactividad** | `max(agent_messages.created_at)` de la sesión `< now() - INTERVAL idle` | Cada turno inserta mensajes, así que el último mensaje es una marca fiable de actividad sin tener que tocar el path del turno. |
| **Umbral de inactividad** | **Por usuario:** `profiles.memory_flush_idle_minutes` (default 30, rango 5–1440), editable en Ajustes. La env `MEMORY_FLUSH_IDLE_MINUTES` queda como fallback. | Cada usuario tiene su perfil; el umbral es personalización natural. El sweep evalúa cada sesión contra el umbral de su usuario (no hay corte global). **Granularidad:** no puede ser menor que la cadencia del pg_cron, de ahí el mínimo de 5 min. El cierre explícito ignora este valor (es instantáneo). |
| **Idempotencia del flush** | **CAS** sobre `agent_sessions.status`: `update … set status='closed' where id=? and status='active'`, luego `flushed_at=now()` al terminar | Si la vía explícita y el sweep se solapan, solo uno reclama la sesión (active→closed). Mismo patrón que `claimScheduledTask`. `flushed_at` distingue "cerrada y flusheada" de "cerrada pero el flush se cayó", permitiendo reintento. |
| **Dedup antes de insertar** | No insertar un hecho que ya existe: **dos capas** — (1) intra-lote (dedupe entre los hechos que devuelve el LLM); (2) vs. almacenado (cosine similarity ≥ umbral **y** mismo `type` → no inserta). | Evita inflar el baúl con paráfrasis del mismo hecho sesión tras sesión. El match exacto de texto no basta (el LLM reformula); por eso se compara por **embedding**, no por string. Umbral env `MEMORY_DEDUP_THRESHOLD` (default `0.90`). |
| **Qué hacer con el duplicado** | **Reforzar, no descartar en silencio:** al detectar duplicado, incrementa el `retrieval_count` del recuerdo existente y omite el insert | Re-mencionar un hecho es señal de que sigue vigente y es importante → sube en la jerarquía por uso. Alinea el dedup con la filosofía de `retrieval_count`. |
| **Separación de procesos** | Flush y retrieval **no comparten código de orquestación** | Son dos procesos independientes (lección): extracción post-sesión (asíncrona, fuera del grafo) vs. inyección inicio-de-sesión (síncrona, nodo del grafo). Solo comparten `embeddings.ts` y `queries/memories.ts`. |
| **Tipos de memoria** | enum `episodic \| semantic \| procedural`, clasificado por el LLM | Gobierna cómo se inyecta y prioriza. La clasificación es explícita en la salida JSON del flush. |
| **Modelo de extracción** | `createMemoryModel()` → env `OPENROUTER_MEMORY_MODEL` | La lección sugiere Haiku. Restricción del proyecto: usar modelos `:free` de OpenRouter (ver memoria `project_10x_builders_agent_model`). **Default a un modelo `:free` con salida estructurada**; documentar que puede apuntarse a Haiku si se acepta el costo. Mismo patrón que `createCompactionModel`. |
| **Embeddings** | `text-embedding-3-small` (1536 dim) vía OpenRouter | Lo pide el issue explícitamente. **No hay opción `:free` para embeddings** — excepción documentada a la restricción de modelo. Env `OPENROUTER_EMBEDDING_MODEL` (default `openai/text-embedding-3-small`). |
| **Búsqueda** | `pgvector`, **cosine similarity**, función SQL `match_memories` (RPC) | pgvector es nativo en Supabase. La función encapsula el `<=>` y el orden, y corre con RLS/seguridad del lado de Postgres. |
| **Tamaño del retrieval** | **top 5–8** (env `MEMORY_RETRIEVAL_K`, default 6) | Inyectar el baúl entero reintroduce Context Rot. Enfocado, no total. |
| **Desempate** | cosine similarity primero, `retrieval_count` desc como tiebreak | A igualdad de relevancia semántica, gana el más usado (jerarquía por uso de la lección). |
| **Punto de inyección** | Nodo `memory_injection` en `__start__`, **antes** de `compaction` | Corre **una sola vez por turno** (no está en el loop tools→compaction→agent). Enriquece el contexto antes de cualquier ejecución. |
| **Cómo se inyecta** | Reemplaza el `SystemMessage` líder en `state.messages` (mismo `id` vía `messagesStateReducer`) + actualiza `state.systemPrompt` | El `agent_node` lee de `state.messages`, no de `state.systemPrompt`. Tocar solo `systemPrompt` no tendría efecto. El reducer permite sustituir por id. |
| **Archivado por desuso** | **Fuera de alcance del MVP**, documentado como follow-up | La lección lo menciona ("solo lo útil sobrevive") pero el issue lo deja para "eventualmente". Guardamos `retrieval_count` y `last_retrieved_at` para soportarlo sin migración futura. |

## Diagrama de flujo

```
─── CIERRE DE SESIÓN (dos disparadores) ──────────────────────────────
(a) EXPLÍCITO: usuario pulsa "Nueva conversación"
        → POST /api/sessions/close  (sesión web del usuario autenticado)
(b) AUTOMÁTICO: pg_cron (cada N min)
        → net.http_post(/api/memory/flush-tick, x-cron-secret)  [service-role]
            → getIdleSessions()  active sin mensajes hace > idle
                                 (o closed con flushed_at NULL → reintento)
   │
   ▼  ambas vías, por cada sesión:
claimSessionForFlush (CAS: status active→closed)
   │ (si no reclama → otra vía se adelantó, skip)
   ▼
─── EXTRACCIÓN (asíncrona, fuera del grafo) ──────────────────────────
memoryFlush(historial completo de la sesión)
   │ 1. guard: si la sesión es trivial (< N turnos de usuario) → no extrae
   │ 2. LLM (Haiku/:free) extrae hechos durables → { type, content }[]
   │    (recibe los recuerdos ya conocidos para no repetirlos)
   │ 3. si [] → no escribe nada (extracción conservadora)
   │ 4. embedding por cada hecho (text-embedding-3-small)
   │ 5. DEDUP: descarta paráfrasis dentro del lote y contra lo almacenado
   │    (cosine ≥ umbral y mismo type → refuerza el existente, no inserta)
   ▼
INSERT en memories (solo los hechos nuevos)
   │ y al final: marcar sesión flushed_at = now()

─── RECUPERACIÓN + INYECCIÓN (síncrona, en el grafo) ──────────────────
__start__ → memory_injection → compaction → agent → (cond) → tools
                  │                                              │
                  │                                              ▼
                  │                                          compaction ─┐
                  │                                              ▲        │
                  │                                              └────────┘
                  │                                            (loop, NO re-inyecta)
                  ▼
memory_injection_node:
   1. extrae el último HumanMessage (userInput) de state.messages
   2. embedding del input
   3. match_memories(embedding, userId, K)  → top 5–8 por cosine
   4. incrementa retrieval_count + last_retrieved_at de los encontrados
   5. reescribe el SystemMessage con bloque [MEMORIA DEL USUARIO]
   6. return Partial<GraphState> { messages:[systemReemplazado], systemPrompt }
```

## Schema de la tabla — migración `00006_long_term_memory.sql`

```sql
-- pgvector nativo de Supabase
create extension if not exists vector;

create table public.memories (
  id                uuid primary key default uuid_generate_v4(),
  user_id           uuid not null references public.profiles(id) on delete cascade,
  type              text not null check (type in ('episodic','semantic','procedural')),
  content           text not null,
  embedding         vector(1536) not null,        -- text-embedding-3-small
  retrieval_count   integer not null default 0,
  created_at        timestamptz not null default now(),
  last_retrieved_at timestamptz
);

alter table public.memories enable row level security;

-- El usuario solo ve/gestiona sus recuerdos (chat web autenticado).
create policy "Users can manage own memories"
  on public.memories for all
  using (auth.uid() = user_id);

-- Índice vectorial para cosine similarity. ivfflat es suficiente para el
-- volumen esperado; HNSW es alternativa si el recall lo exige más adelante.
create index memories_embedding_idx
  on public.memories
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

create index memories_user_idx on public.memories (user_id);

-- Función de matching: cosine similarity, desempate por retrieval_count.
-- SECURITY DEFINER + filtro explícito por user_id para que el RPC sea seguro
-- aun cuando lo invoque el service-role del flush/retrieval.
create or replace function public.match_memories(
  query_embedding vector(1536),
  match_user_id   uuid,
  match_count     int default 6
)
returns table (
  id uuid, type text, content text,
  retrieval_count int, similarity float
)
language sql stable
as $$
  select m.id, m.type, m.content, m.retrieval_count,
         1 - (m.embedding <=> query_embedding) as similarity
  from public.memories m
  where m.user_id = match_user_id
  order by m.embedding <=> query_embedding asc,   -- cosine distance ↑ = más cerca
           m.retrieval_count desc                  -- tiebreak por uso
  limit match_count;
$$;

-- Dedup en el flush: ¿existe ya un recuerdo del MISMO tipo lo bastante parecido?
-- Devuelve el más cercano por encima del umbral, o nada. El flush lo usa por
-- cada hecho candidato para decidir insertar vs. reforzar.
create or replace function public.find_similar_memory(
  query_embedding vector(1536),
  match_user_id   uuid,
  match_type      text,
  min_similarity  float default 0.90
)
returns table (id uuid, similarity float)
language sql stable
as $$
  select m.id, 1 - (m.embedding <=> query_embedding) as similarity
  from public.memories m
  where m.user_id = match_user_id
    and m.type = match_type
    and 1 - (m.embedding <=> query_embedding) >= min_similarity
  order by m.embedding <=> query_embedding asc
  limit 1;
$$;

-- Incremento atómico del contador (lo usan tanto el retrieval como el dedup).
create or replace function public.bump_retrieval_count(ids uuid[])
returns void
language sql
as $$
  update public.memories
  set retrieval_count = retrieval_count + 1,
      last_retrieved_at = now()
  where id = any(ids);
$$;

-- agent_sessions: marca de flush para distinguir "cerrada y flusheada" de
-- "cerrada pero el flush se cayó" (permite reintento desde el sweep).
alter table public.agent_sessions
  add column if not exists flushed_at timestamptz;
```

**Por qué cada columna:**

- `type` — enum que gobierna inyección/prioridad; clasificación explícita del flush.
- `content` — el hecho destilado en texto (lo que produjo la extracción).
- `embedding vector(1536)` — representación para la búsqueda por coseno; 1536 = dim de `text-embedding-3-small`.
- `retrieval_count` — jerarquía por uso; sube en cada recuperación. Desempate del retrieval y base del futuro archivado.
- `created_at` / `last_retrieved_at` — soportan memoria episódica (cuándo) y la política de archivado por desuso (follow-up).

> **Nota:** la migración 00001 hace `create extension uuid-ossp`. La 00006 añade
> `vector`. En Supabase managed las extensiones suelen habilitarse desde el
> Dashboard; el `create extension if not exists` cubre entornos con privilegios.

## Módulos a construir

Módulos nuevos (planos en `packages/agent/src/`, siguiendo el naming del issue:
`embeddings.ts`, `memory_flush.ts`, `memory_injection_node.ts`) + queries en
`packages/db`.

### `packages/db/src/queries/memories.ts`

- `saveMemory(db, userId, row: { type, content, embedding })` — inserta un recuerdo.
  El flush la llama por cada hecho nuevo.
- `matchMemories(db, userId, embedding, k)` — `rpc('match_memories', …)`.
- `findSimilarMemory(db, userId, embedding, type, minSim)` — `rpc('find_similar_memory', …)`;
  devuelve `{ id, similarity }` o `null`. Lo usa el dedup del flush.
- `bumpRetrievalCount(db, ids: string[])` — `rpc('bump_retrieval_count', …)`;
  sube `retrieval_count` y refresca `last_retrieved_at`. Lo usan tanto el
  retrieval (recuerdos recuperados) como el dedup (refuerzo del duplicado).
- `getIdleSessions(db, idleBeforeIso)` — sesiones a flushear: `active` cuyo último
  `agent_messages.created_at` es anterior al corte (o sin mensajes y creadas antes
  del corte), **más** las `closed` con `flushed_at IS NULL` (reintento de flush caído).
- `claimSessionForFlush(db, sessionId)` — CAS `status active→closed`, devuelve la
  fila o `null` si ya fue reclamada. Idempotente para ambos disparadores.
- `markSessionFlushed(db, sessionId)` — setea `flushed_at = now()` al terminar el flush.
- `closeSession(db, userId, channel)` — cierre **explícito**: CAS sobre la sesión
  `active` del usuario en ese canal (`active→closed`), devuelve la fila reclamada o
  `null` si no había activa. Reutiliza el mismo CAS que `claimSessionForFlush` pero
  resolviendo la sesión por `(userId, channel)` en vez de por id.

Exportar todo desde `packages/db/src/index.ts`.

### `packages/agent/src/embeddings.ts`

```ts
// Genera embeddings vía OpenRouter con fetch directo (sin SDK). Usa
// OPENROUTER_API_KEY + OPENROUTER_EMBEDDING_MODEL (default
// 'openai/text-embedding-3-small'). Vector de 1536 dims.
export async function generateEmbedding(text: string): Promise<number[]>
```

Implementación con **`fetch` directo** al endpoint OpenAI-compatible de
OpenRouter (decisión confirmada — no usamos `@openrouter/sdk`):

```ts
const res = await fetch("https://openrouter.ai/api/v1/embeddings", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    "Content-Type": "application/json",
    "HTTP-Referer": "https://agents.local", // mismo header que model.ts
  },
  body: JSON.stringify({ model: EMBEDDING_MODEL, input: text }),
});
// res.data[0].embedding  → number[]
```

Notas:
- Una sola función `generateEmbedding(text)`. El flush la llama por cada hecho
  (no hay batch endpoint propio; si hiciera falta, se pasa `input: string[]` y se
  leen `data[i].embedding`, pero el MVP va de a uno por simplicidad).
- Lanza si la respuesta no trae `data[0].embedding` o el status no es 2xx; los
  callers (flush / injection) deciden si degradan o reintentan.

### `packages/agent/src/memory_flush.ts` — extracción post-sesión

```ts
export async function memoryFlush(input: {
  db: DbClient;
  userId: string;
  sessionId: string;
}): Promise<{ extracted: number }>
```

1. Lee el historial completo de la sesión (`getSessionMessages`, sin límite bajo).
2. **Guard de sesión trivial:** si la sesión tiene menos de `MEMORY_FLUSH_MIN_TURNS`
   (default 2) turnos de usuario → no extrae nada, retorna `{ extracted: 0 }`.
   Evita gastar LLM/embeddings y ensuciar el baúl con sesiones de un "hola".
3. Recupera los recuerdos ya conocidos del usuario (un top por tipo) para
   pasárselos al prompt como contexto de "ya lo sé, no lo repitas".
4. Llama a `createMemoryModel()` con prompt estructurado **conservador** (abajo).
5. Parsea la salida JSON `{ type, content }[]`. Si `[]` → no escribe nada y
   retorna `{ extracted: 0 }`.
6. **Dedup intra-lote:** colapsa hechos casi idénticos que el propio LLM repitió
   (normaliza texto; si dos comparten `type` y embedding muy cercano, deja uno).
7. `generateEmbedding(content)` por cada candidato restante.
8. **Dedup vs. almacenado:** por cada candidato, `findSimilarMemory(userId,
   embedding, type, MEMORY_DEDUP_THRESHOLD)`.
   - Si hay match → **no inserta**; `bumpRetrievalCount([existingId])` (refuerzo).
   - Si no hay match → entra a la lista de inserción.
9. `saveMemory(db, userId, row)` por cada hecho realmente nuevo (los demás se
   descartaron o reforzaron en el paso 8).

Nunca lanza hacia el caller del tick salvo error irrecuperable; los fallos se
loguean (el flush es best-effort, no debe tumbar el barrido). El caller marca
`markSessionFlushed` al volver `memoryFlush` sin error.

**Prompt de extracción (conservador):**

> Eres un extractor de memoria a largo plazo. Lee la conversación y extrae
> **solo** hechos que **seguirán siendo verdad en la próxima sesión**.
> Clasifica cada hecho en `episodic` (qué hizo el usuario y cuándo),
> `semantic` (preferencias y conocimiento durable) o `procedural` (cómo prefiere
> que se hagan las cosas). **No extraigas** trivialidades, conversación de
> relleno, ni datos efímeros. Si no hay nada durable, devuelve `[]`.
> Ya conoces estos hechos del usuario; **no los repitas ni los reformules**:
> {recuerdos_conocidos}.
> Salida: **solo** un array JSON `[{ "type": "...", "content": "..." }]`,
> sin prosa ni bloques `<analysis>`.

> **Nota — dedup en dos frentes:** pasar los recuerdos conocidos al prompt reduce
> duplicados en origen, pero **no es la garantía**: el LLM puede reformular igual.
> El gate autoritativo es el **dedup por embedding** (paso 8), que sí captura
> paráfrasis. El prompt es refuerzo barato, no sustituto.

### `packages/agent/src/memory_injection_node.ts` — nodo del grafo

```ts
export async function memoryInjectionNode(
  state: GraphStateType,
): Promise<Partial<GraphStateType>>
```

1. Encuentra el último `HumanMessage` de `state.messages` → `userInput`.
   Si no hay (p.ej. resume sin mensaje nuevo) → `return {}` (passthrough).
2. `generateEmbedding(userInput)`.
3. `matchMemories(db, state.userId, embedding, K)`.
   - El nodo necesita `db`. Como `runAgent` ya tiene `db` en closure, se inyecta
     vía una **factory** `makeMemoryInjectionNode(db)` (igual idea que los nodos
     que cierran sobre dependencias), o se añade `db` al estado. Preferencia:
     factory, para no meter el cliente en el `GraphState` serializable.
4. Si no hay recuerdos → `return {}` (passthrough silencioso).
5. `incrementRetrievalCount(ids)`.
6. Construye el bloque y reescribe el SystemMessage líder:

```
[MEMORIA DEL USUARIO]
Lo que recuerdas de sesiones anteriores con este usuario (no lo menciones salvo
que sea pertinente):
- (semantic) Prefiere TypeScript y usa Supabase.
- (procedural) Antes de codear, pide siempre un diagrama.
- (episodic) El martes tuvo un error de CORS.
[/MEMORIA DEL USUARIO]
```

7. Retorna:
```ts
return {
  messages: [ new SystemMessage({ id: systemMsg.id, content: enriched }) ],
  systemPrompt: enriched,
};
```
El `messagesStateReducer` sustituye por `id` el SystemMessage existente (los
mensajes ya llevan `id` explícito desde `runAgent`).

### `packages/agent/src/model.ts`

Añadir `createMemoryModel()` (mismo molde que `createCompactionModel`, leyendo
`OPENROUTER_MEMORY_MODEL`, temperatura baja ~0.1 para extracción determinista).

## Cambios en el grafo (`graph.ts`)

```ts
const injectionNode = makeMemoryInjectionNode(db); // closure con db

const graph = new StateGraph(GraphState)
  .addNode("memory_injection", injectionNode)   // NUEVO
  .addNode("compaction", compactionNode)
  .addNode("agent", agentNode)
  .addNode("tools", toolExecutorNode)
  .addEdge("__start__", "memory_injection")      // CAMBIA: antes iba a compaction
  .addEdge("memory_injection", "compaction")     // NUEVO
  .addConditionalEdges("agent", shouldContinueAfterAgent, {
    tools: "tools",
    end: "__end__",
  })
  .addEdge("tools", "compaction");               // sin cambios: el loop NO re-inyecta
```

Flujo resultante:
```
__start__ → memory_injection → compaction → agent → tools → compaction → … → __end__
```

`memory_injection` corre **una vez por turno**. El loop de herramientas vuelve a
`compaction`, nunca a `memory_injection` → no se recuperan recuerdos en cada
iteración (eficiente y evita inflar el contexto).

**Resume (HITL):** en la rama `resumeDecision`, `runAgent` hace
`Command(resume)` sobre el thread interrumpido; el grafo retoma en el nodo
interrumpido (`tools`), **no** desde `__start__`, así que `memory_injection` no
se re-ejecuta en un resume. Correcto: ya se inyectó en el turno original.

## Endpoint del flush — `apps/web/src/app/api/memory/flush-tick/route.ts`

Calcado de `scheduled-tasks/tick`:

```ts
export async function POST(request: Request) {
  // 1. Auth por header x-cron-secret == CRON_SECRET (reutilizamos el secret).
  // 2. db = createServerClient()  (service-role, salta RLS)
  // 3. const idle = getIdleSessions(db, now - IDLE_MINUTES)
  // 4. por cada sesión:
  //      claimed = claimSessionForFlush(db, s.id)   // CAS active→closed
  //      if (!claimed) continue                      // otra vía se adelantó
  //      await memoryFlush({ db, userId: s.user_id, sessionId: s.id })
  //      await markSessionFlushed(db, s.id)
  // 5. return { processed, results }
}
```

Registro de pg_cron (Dashboard Supabase), p.ej. cada 5 min:
```sql
select cron.schedule(
  'memory-flush-tick', '*/5 * * * *',
  $$ select net.http_post(
       url := '<APP_URL>/api/memory/flush-tick',
       headers := jsonb_build_object('x-cron-secret','<CRON_SECRET>')
     ); $$
);
```

## Cierre explícito + nueva sesión

### Endpoint — `apps/web/src/app/api/sessions/close/route.ts`

```ts
export async function POST() {
  // 1. Auth normal (supabase.auth.getUser) — NO service-role: el usuario cierra
  //    SU sesión, RLS aplica.
  // 2. const closed = await closeSession(db, user.id, "web")  // CAS active→closed
  // 3. if (closed) {
  //      await memoryFlush({ db, userId: user.id, sessionId: closed.id })
  //      await markSessionFlushed(db, closed.id)
  //    }
  // 4. return { ok: true }   // haya o no sesión que cerrar (idempotente)
}
```

- **Flush síncrono aquí** (se espera a `memoryFlush`): en serverless un
  fire-and-forget se mataría al responder. Son ~1–3 s; aceptable para un click de
  "Nueva conversación". Si falla el flush, la sesión queda `closed` con
  `flushed_at IS NULL` → el sweep la reintenta. Nunca se pierde el flush.
- No crea la sesión nueva: al quedar sin sesión `active`, el **siguiente mensaje**
  la crea vía `getOrCreateSession` (chat route, sin cambios). La continuidad la da
  la memoria, no la sesión.

### UI — botón "Nueva conversación"

En el header de `apps/web/src/app/chat/page.tsx` (junto a "Ajustes"/"Salir"), un
botón que `POST /api/sessions/close` y luego refresca (`router.refresh()` /
recarga). Al recargar, `chat/page.tsx` no encuentra sesión `active` → hidrata el
chat vacío. El usuario ve una conversación limpia; su memoria ya quedó guardada.

> La acción es **destructiva en lo conversacional** (cierra el hilo visible), así
> que el botón confirma antes ("¿Iniciar una conversación nueva? Se guardará lo
> aprendido de la actual."). No borra mensajes: la sesión `closed` y sus
> `agent_messages` siguen en la BD, solo dejan de mostrarse.

## Lo que NO se toca

`compaction_node`, `agent_node`, `toolExecutorNode`, el flujo HITL, el
checkpointer y el conteo de iteraciones (`MAX_TOOL_ITERATIONS` /
`shouldContinueAfterAgent`). El único cambio en el grafo es **añadir un nodo y
dos aristas**; todo lo demás queda igual.

## Edge cases y riesgos

- **Sesión `scheduled`:** el barrido también las cerraría/flushearía. El tick de
  `scheduled-tasks` ya crea una sesión nueva por disparo y nunca la reutiliza, así
  que cerrarla por inactividad es inocuo. La inyección también aplica (key=userId)
  — el disparo programado arranca con la memoria del usuario, lo cual es deseable.
- **Doble flush (sweep vs. cierre explícito):** mitigado por el CAS `active→closed`.
  Solo una vía reclama la sesión; la otra ve `status≠active` y la salta. Una sesión
  flusheada no se reabre (el siguiente mensaje crea sesión nueva).
- **Flush caído a mitad:** la sesión queda `closed` con `flushed_at IS NULL`. El
  sweep incluye ese caso en `getIdleSessions` y lo **reintenta**. El dedup hace que
  el reintento no duplique lo que sí llegó a insertarse antes del fallo.
- **Dedup — falsos positivos / hechos que cambian:** el dedup por similitud asume
  que "muy parecido = lo mismo". Un hecho que **contradice** uno previo (p.ej.
  «antes usaba JS, ahora TS») puede ser semánticamente cercano y quedar omitido,
  dejando el dato viejo. La **reconciliación/invalidación de memorias** (detectar
  contradicción y actualizar en vez de saltar) queda **fuera de alcance** del MVP;
  documentada como follow-up. El umbral `0.90` es conservador para minimizar
  falsos positivos; ajustarlo con datos reales del smoke test.
- **Embeddings caen:** si `generateEmbedding` falla en el nodo de inyección, el nodo hace
  passthrough (`return {}`) y el turno corre sin memoria — degradación elegante,
  nunca tumba el chat. En el flush, un fallo de embeddings se loguea, la sesión
  queda `closed` con `flushed_at IS NULL` y el sweep la **reintenta** (ya no se
  pierde el flush, a diferencia del diseño inicial).
- **Coste de embeddings:** `text-embedding-3-small` es de pago (no hay `:free`).
  Excepción explícita a la restricción de modelo del proyecto, pedida por el issue.
- **Crecimiento del baúl / archivado:** sin política de archivado en el MVP, la
  tabla crece. `retrieval_count` + `last_retrieved_at` ya están para soportar un
  job de archivado futuro (low count + antiguo → archivar). Follow-up.
- **Ruido en la extracción:** el prompt conservador + `[]`-cuando-no-hay-nada es la
  defensa principal contra llenar el baúl de basura. Revisar la calidad real con
  un smoke test antes de subir el idle/bajar el umbral.
- **Privacidad RLS vs service-role:** el flush corre con service-role (salta RLS);
  `match_memories` filtra por `user_id` explícito para que ni el RPC ni el
  service-role crucen recuerdos entre usuarios.

## Variables de entorno nuevas

| Var | Default | Uso |
|---|---|---|
| `OPENROUTER_MEMORY_MODEL` | (modelo `:free` con JSON) | LLM de extracción del flush |
| `OPENROUTER_EMBEDDING_MODEL` | `openai/text-embedding-3-small` | Embeddings |
| `MEMORY_FLUSH_IDLE_MINUTES` | `30` | Fallback del umbral de inactividad cuando el perfil del usuario no tiene `memory_flush_idle_minutes` (la preferencia por usuario manda) |
| `MEMORY_FLUSH_MIN_TURNS` | `2` | Mínimo de turnos de usuario para que valga la pena flushear |
| `MEMORY_RETRIEVAL_K` | `6` | Top-K de recuerdos a inyectar (5–8) |
| `MEMORY_DEDUP_THRESHOLD` | `0.90` | Cosine mínima para considerar un hecho duplicado |
| `CRON_SECRET` | (ya existe) | Auth del `flush-tick` |

## Plan de rollout por fases

1. **F1 — Fundación de datos + embeddings.** Migración `00006` (tabla, índices,
   `match_memories`, `find_similar_memory`, `bump_retrieval_count`, `flushed_at`),
   tipos (`Memory`, `MemoryType`), `queries/memories.ts`, y `embeddings.ts`
   con su fallback verificado. Sin tocar el grafo.
   *Verificable:* insertar recuerdos a mano y consultar `match_memories` /
   `find_similar_memory` por RPC.
2. **F2 — Inyección (síncrona).** `createMemoryModel`, `injection_node.ts`,
   `makeMemoryInjectionNode(db)`, y el cableado del nodo en `graph.ts`.
   *Verificable:* sembrar 2–3 recuerdos y comprobar que un turno de chat los
   inyecta como `[MEMORIA DEL USUARIO]` (revisar `compaction.log` / system prompt).
3. **F3 — Flush + dedup (asíncrono).** `flush.ts` (con guard de sesión trivial y
   dedup en dos capas), `getIdleSessions`, `claimSessionForFlush`,
   `markSessionFlushed`, endpoint `/api/memory/flush-tick`.
   *Verificable:* `curl` al endpoint sobre una sesión envejecida → confirma INSERTs
   en `memories`, `status='closed'`, `flushed_at` set; re-ejecutar el flush sobre la
   misma conversación **no duplica** (dedup OK).
4. **F4 — Cierre explícito + nueva sesión (UI).** `closeSession` query, endpoint
   `/api/sessions/close`, botón "Nueva conversación" en el header del chat.
   *Verificable:* conversar → pulsar "Nueva conversación" → el chat queda limpio,
   la sesión previa pasa a `closed` y sus hechos aparecen en `memories`.
5. **F5 — pg_cron.** Registrar `memory-flush-tick` en Supabase. Validar end-to-end
   por inactividad: conversar → esperar idle → siguiente sesión arranca con memoria.
6. **F6 — Docs + CHANGELOG + README.** Sincronizar `docs/architecture.md`.

El feature funciona end-to-end cuando F1–F5 están dentro. F2 (inyección) y F3
(flush) son procesos separados y pueden desarrollarse en paralelo; F4 depende de
F3 (reutiliza `memoryFlush`).
