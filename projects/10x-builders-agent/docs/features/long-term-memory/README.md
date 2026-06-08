# Memoria a largo plazo

El agente recuerda al usuario entre sesiones: destila hechos durables al **cerrar**
una conversación (memory flush) y los recupera por similitud al **iniciar** la
siguiente (memory injection). Todo se llavea por `user_id`, así que la memoria
sobrevive aunque cambie la sesión, el canal o se reinicie el proceso.

Documento hermano: `plan.md` (decisiones de diseño y trade-offs).

## Los dos procesos (separados)

| | Memory injection | Memory flush |
|---|---|---|
| **Cuándo** | Inicio de cada turno (nodo del grafo) | Al cerrar la sesión (fuera del grafo) |
| **Síncrono** | Sí | No |
| **Qué hace** | Recupera top-K recuerdos relevantes al input e inyecta en el system prompt | Extrae hechos durables del historial y los guarda |
| **Dónde** | `packages/agent/src/memory_injection_node.ts` | `packages/agent/src/memory_flush.ts` |

## Tipos de memoria

Cada recuerdo se clasifica al extraerse:

- **`episodic`** — qué hizo el usuario y cuándo (eventos fechados). *"El martes tuvo un error de CORS."*
- **`semantic`** — preferencias y conocimiento durable. *"Prefiere TypeScript y usa Supabase."*
- **`procedural`** — cómo prefiere que se hagan las cosas. *"Antes de codear, pide un diagrama."*

## El ciclo completo

```
SESIÓN ACTIVA ──(se cierra)──► memory_flush ──► tabla memories ◄── memory_injection ◄──(nueva sesión)
   (compaction = corto plazo)   extrae+deduplica   (pgvector)      recupera top-K + sube retrieval_count
```

### memory_injection (inicio de turno)

Nodo `memory_injection`, primer nodo del grafo (`__start__ → memory_injection → compaction → agent → …`):

1. Toma el último mensaje del usuario como `userInput`.
2. `generateEmbedding(userInput)`.
3. `match_memories(embedding, userId, K)` → top-K por cosine similarity (desempate por `retrieval_count`).
4. `bump_retrieval_count` de los recuperados.
5. Inyecta en el `SystemMessage` líder un bloque `[MEMORIA DEL USUARIO]`.

Corre **una vez por turno** (el loop `tools → compaction` no vuelve a este nodo) y **no** se re-ejecuta en un resume de HITL. Si algo falla (sin input, sin recuerdos, embeddings caídos) hace passthrough: el turno corre sin memoria, nunca rompe el chat.

### memory_flush (cierre de sesión)

1. **Guard de sesión trivial**: si la sesión tiene menos de `MEMORY_FLUSH_MIN_TURNS` turnos de usuario, no extrae nada.
2. LLM de extracción (`createMemoryModel`, prompt conservador) → array JSON `{ type, content }[]`. Si no hay nada durable, `[]`.
3. **Dedup intra-lote**: colapsa hechos casi idénticos del propio LLM.
4. Por cada candidato: `generateEmbedding` → `find_similar_memory` del mismo `type`. Si hay match ≥ `MEMORY_DEDUP_THRESHOLD` → **refuerza** el existente (`bump_retrieval_count`) y no inserta. Si no → `saveMemory`.

Es best-effort: nunca lanza hacia el caller; los fallos se loguean.

## Cierre de sesión: dos disparadores

| Vía | Cómo | Latencia |
|---|---|---|
| **Explícita (web)** | Botón "Nueva conversación" → `POST /api/sessions/close` | Flush síncrono, al instante |
| **Explícita (Telegram)** | Comando `/reset` en el chat del bot (cierra + flushea desde el webhook) | Flush síncrono, al instante |
| **Automática** | pg_cron → `POST /api/memory/flush-tick` (sweep de inactividad) | Tras el umbral del usuario |

Ambas reclaman la sesión con CAS (`active→closed`) y llaman a la misma `memoryFlush`. El cierre explícito **no** crea la sesión nueva: al quedar sin sesión activa, el siguiente mensaje la crea vía `getOrCreateSession`. No se borran mensajes; la sesión `closed` y su historial quedan en la BD.

### Umbral de inactividad (por usuario)

`profiles.memory_flush_idle_minutes` (default 30, rango 5–1440), editable en **Ajustes → Agente**. El sweep evalúa cada sesión activa contra el umbral de **su** usuario (no hay corte global). `MEMORY_FLUSH_IDLE_MINUTES` es el fallback para perfiles sin valor propio.

> **Granularidad:** el umbral efectivo no puede ser menor que la cadencia del pg_cron. Si registras el job cada 5 min, un umbral de 5 min se cumple con ~5 min de margen. De ahí el mínimo de 5.

## Schema de la tabla `memories` (migration 00006)

| Columna | Tipo | Default | Descripción |
|---|---|---|---|
| `id` | uuid | `uuid_generate_v4()` | PK. |
| `user_id` | uuid | — | FK a `profiles.id`, on delete cascade. |
| `type` | text | — | `episodic` / `semantic` / `procedural`. |
| `content` | text | — | El hecho destilado. |
| `embedding` | vector(1536) | — | Embedding de `content` (`text-embedding-3-small`). |
| `retrieval_count` | integer | 0 | Sube en cada recuperación/refuerzo. Jerarquía por uso. |
| `created_at` | timestamptz | now() | — |
| `last_retrieved_at` | timestamptz | null | Última recuperación. Base del archivado futuro. |

RLS: solo el dueño (`auth.uid() = user_id`). Los endpoints de flush usan service-role; las funciones SQL filtran por `user_id` explícito para no cruzar recuerdos entre usuarios.

Funciones SQL: `match_memories` (retrieval), `find_similar_memory` (dedup), `bump_retrieval_count` (contador atómico). Migration 00007 añade `profiles.memory_flush_idle_minutes`; la 00006 añade `agent_sessions.flushed_at`.

## Variables de entorno

| Variable | Default | Uso |
|---|---|---|
| `OPENROUTER_MEMORY_MODEL` | (cae a `OPENROUTER_COMPACTION_MODEL`) | LLM de extracción del flush |
| `OPENROUTER_EMBEDDING_MODEL` | `openai/text-embedding-3-small` | Embeddings (1536 dims) |
| `MEMORY_FLUSH_IDLE_MINUTES` | `30` | Fallback del umbral cuando el perfil no tiene valor propio |
| `MEMORY_FLUSH_MIN_TURNS` | `2` | Mínimo de turnos de usuario para que valga la pena flushear |
| `MEMORY_RETRIEVAL_K` | `6` | Top-K de recuerdos a inyectar (5–8) |
| `MEMORY_DEDUP_THRESHOLD` | `0.90` | Cosine mínima para considerar un hecho duplicado |
| `CRON_SECRET` | (ya existe) | Auth del `flush-tick` (reutilizado de scheduled-tasks) |

## Setup de Supabase Cron (flush por inactividad)

Reutiliza `pg_cron` + `pg_net` y el `CRON_SECRET` de scheduled-tasks. Si ya los tienes activos, solo falta registrar el job nuevo.

Desde **Supabase Dashboard → SQL Editor**, ejecutar **una vez** (ajusta cadencia y dominio):

```sql
select cron.schedule(
  'memory-flush-tick',
  '*/5 * * * *',
  $$
    select net.http_post(
      url     := 'https://TU_DOMINIO/api/memory/flush-tick',
      headers := jsonb_build_object(
                   'Content-Type', 'application/json',
                   'x-cron-secret', 'PEGAR_AQUI_EL_VALOR_DE_CRON_SECRET'
                 ),
      body    := '{}'::jsonb
    ) as request_id;
  $$
);
```

Verificar: `select * from cron.job;` debe listar `memory-flush-tick`. Apagar: `select cron.unschedule('memory-flush-tick');`.

### Validación rápida sin esperar el cron

```bash
curl -X POST http://localhost:3000/api/memory/flush-tick \
  -H "x-cron-secret: $CRON_SECRET"
```

Respuesta esperada: `{"processed": N, "results": [...], "started_at": "..."}`. Cada `result` trae `extracted` (recuerdos nuevos insertados) o `skipped`/`error`.

## Cómo probar end-to-end

1. En el chat web, cuenta algo durable: *"Prefiero respuestas cortas y trabajo en TypeScript con Supabase."*
2. Pulsa **"Nueva conversación"** (o espera el umbral de inactividad).
3. Verifica en SQL Editor:
   ```sql
   select type, content, retrieval_count from memories where user_id = '<uuid>';
   ```
4. Escribe un mensaje nuevo relacionado (*"¿qué stack uso?"*). El agente debería responder ya sabiéndolo.
5. Confirma la inyección en logs de Next.js: `[memoryInjectionNode] injected memories`.

## Inspección y operación

```sql
-- Recuerdos de un usuario, por relevancia de uso
select type, content, retrieval_count, last_retrieved_at
from memories where user_id = '<uuid>'
order by retrieval_count desc;

-- Sesiones cerradas pendientes de flush (el sweep las reintenta)
select id, user_id, status, flushed_at
from agent_sessions where status = 'closed' and flushed_at is null;
```

## Limitaciones conocidas

- **Sin reconciliación de contradicciones**: si un hecho nuevo contradice uno viejo (*"antes usaba JS, ahora TS"*), el dedup por similitud puede tratarlo como duplicado y conservar el dato viejo. Actualizar/invalidar memorias contradictorias es un follow-up fuera del MVP. El umbral `0.90` es conservador para minimizar falsos positivos.
- **Sin archivado por desuso**: la tabla crece sin podarse. `retrieval_count` + `last_retrieved_at` están para soportar un job de archivado futuro (bajo count + antiguo → archivar).
- **Doble flush posible (inocuo)**: si el cierre explícito y el sweep coinciden sobre la misma sesión en el retry path, el dedup garantiza que no se inserten duplicados; solo se desperdicia algo de trabajo.
- **Costo de embeddings**: `text-embedding-3-small` es de pago (no hay variante `:free`). Excepción explícita a la preferencia de modelos `:free` del proyecto.
- **Granularidad atada al cron**: ver nota arriba sobre el umbral de inactividad.
