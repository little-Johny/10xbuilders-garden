---
title: "Implementación de Memoria a Largo Plazo con Supabase"
week: 6
lesson: 5
module: 5004
tags: [agentes, memoria, memoria-largo-plazo, memory-flush, memory-injection, busqueda-semantica, embeddings, pgvector, supabase, cursor, retrieval-count, match-memories, dedup, migraciones, typescript, llm]
date: 2026-05-28
status: done
---

# Implementación de Memoria a Largo Plazo con Supabase

> **Síntesis.** La sesión 4 dejó la teoría del baúl de los recuerdos; esta la baja a código. Construimos el ciclo completo —**flush** al cerrar la sesión, almacenamiento en una tabla `memories` de Supabase con `pgvector`, y **inyección** enfocada al inicio de la siguiente— apoyándonos en **embeddings** para recuperar por significado y no por coincidencia de texto. El corazón es una tabla con `content`, `type`, `embedding vector(1536)` y `retrieval_count`, más una función SQL `match_memories` que ordena por similitud de coseno. El reto fino es la **deduplicación**: antes de guardar, se busca semánticamente si el hecho ya existe; si es muy parecido, se refuerza el recuerdo en vez de duplicarlo. Toda la implementación concreta vive en `projects/10x-builders-agent`, y a lo largo de estos apuntes se enlaza cada concepto con el archivo donde lo resolvimos en la práctica.

## Introducción

La sesión anterior (módulo 5003) estableció el **qué** y el **por qué**: la amnesia entre sesiones, los tres tipos de memoria, el flush, el retrieval count y la búsqueda por similitud. Esta sesión (módulo 5004) es el **cómo**: convertir esa arquitectura en una base de datos operativa, dos nodos en el grafo del agente y un flujo de extracción/recuperación que funciona en tiempo real.

El hilo conductor es práctico —usamos Cursor para generar migraciones y nodos, y Supabase como base de datos vectorial—, pero estos apuntes añaden una capa extra: **ya lo implementamos de verdad** en nuestro proyecto, así que en cada paso encontrarás un bloque **🔧 En nuestra implementación** que apunta al archivo y la decisión concreta que tomamos. Donde nuestra implementación se desvía del guion del curso (y lo hace en puntos importantes), se explica el porqué.

> **Mapa de archivos (referencia rápida).** Todo bajo `projects/10x-builders-agent/`:
> - Migraciones: `packages/db/supabase/migrations/00006_long_term_memory.sql` y `00007_memory_idle_setting.sql`
> - Embeddings: `packages/agent/src/embeddings.ts`
> - Nodo de inyección: `packages/agent/src/memory_injection_node.ts`
> - Flush (extracción): `packages/agent/src/memory_flush.ts`
> - Modelo de extracción: `packages/agent/src/model.ts` (`createMemoryModel`)
> - Grafo: `packages/agent/src/graph.ts`
> - Queries y funciones: `packages/db/src/queries/memories.ts`
> - Endpoints: `apps/web/src/app/api/memory/flush-tick/route.ts`, `apps/web/src/app/api/sessions/close/route.ts`
> - Smoke test: `packages/agent/scripts/smoke-memory.ts`
> - Diseño as-built: `docs/features/long-term-memory/plan.md` y `README.md`

## Objetivos de aprendizaje

1. **Diseñar** la arquitectura de nodos del agente para integrar extracción (flush) e inyección de memoria a largo plazo.
2. **Explicar** la búsqueda semántica y el uso de embeddings para recuperar información por significado.
3. **Implementar** la tabla y las migraciones en Supabase para almacenar y clasificar memorias episódicas, semánticas y procedimentales.
4. **Evaluar** el sistema con pruebas en tiempo real: persistencia de datos y actualización del `retrieval_count`.
5. **Proponer** estrategias de optimización que prevengan la duplicación de registros en interacciones futuras.

## Marco conceptual

### Búsqueda semántica y embeddings: el mapa de significados

Un LLM transforma texto en **vectores** (embeddings): listas de números que ubican cada fragmento en un espacio multidimensional. La analogía es un **mapa de significados**: "manzana" queda *cerca* de "fruta" o "tarta" aunque no compartan ninguna letra, porque comparten contexto. Buscar deja de ser "coincidencia exacta de texto" y pasa a ser "cercanía de significado" —se mide con **similitud de coseno** entre el vector de la consulta y los vectores guardados.

> **🔧 En nuestra implementación.** Los embeddings se generan en `packages/agent/src/embeddings.ts`, función **`generateEmbedding(text)`**, con un `fetch` directo al endpoint de OpenRouter (`/embeddings`, modelo por defecto `openai/text-embedding-3-small`, **1536 dimensiones**). El curso cita la API de OpenAI directamente; nosotros pasamos por OpenRouter para reutilizar la misma `OPENROUTER_API_KEY` del resto del agente. La verificación de que ese endpoint devuelve los 1536 valores está automatizada en el smoke test (`scripts/smoke-memory.ts`, sección "embeddings en vivo").

### Los nodos del grafo: inyectar al entrar, extraer al salir

La arquitectura instruccional añade dos nodos al flujo del agente:

- **Nodo de inyección de memoria (inicio):** consulta la base por similitud al input del usuario y añade los recuerdos relevantes al *system prompt*.
- **Nodo de flush (extracción):** toma lo nuevo de la conversación y lo guarda en la base.

> **🔧 En nuestra implementación — y una diferencia de diseño importante.** El nodo de inyección es `packages/agent/src/memory_injection_node.ts` (`makeMemoryInjectionNode(db)`), cableado como **primer nodo del grafo** en `packages/agent/src/graph.ts`:
> ```
> __start__ → memory_injection → compaction → agent → (tools) → … → __end__
> ```
> Corre **una sola vez por turno** (el loop de herramientas vuelve a `compaction`, nunca a la inyección).
>
> El flush, en cambio, **no lo disparamos "al final de cada ejecución/turno"** como sugiere el guion del curso. Lo hacemos **al cerrar la sesión**, que es lo que dicta la teoría de la sesión 4 (el flush es post-sesión, no por turno). El flush vive **fuera del grafo** en `packages/agent/src/memory_flush.ts` (`memoryFlush`) y se dispara por dos vías:
> 1. **Explícita:** el botón "Nueva conversación" → `apps/web/src/app/api/sessions/close/route.ts`.
> 2. **Automática por inactividad:** un job de pg_cron pega a `apps/web/src/app/api/memory/flush-tick/route.ts`.
>
> ¿Por qué no por turno? Flushear en cada mensaje gastaría el LLM constantemente y multiplicaría duplicados. Cerrar la sesión es el momento natural para "barrer" la conversación una sola vez.

### Anatomía de la base de datos de memorias

Para que la búsqueda vectorial funcione, la tabla necesita una estructura específica. Los campos esenciales:

- **`type`** (clasificación): `episodic` | `semantic` | `procedural`.
- **`content`**: el texto crudo del recuerdo.
- **`embedding`**: el vector (`vector(1536)` con `pgvector`).
- **`retrieval_count`**: contador que sube cada vez que el recuerdo se consulta, para ponderar los más útiles.

El ejemplo simplificado del curso:
```sql
CREATE TABLE memories (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  content text NOT NULL,
  memory_type text NOT NULL,
  embedding vector(1536),
  retrieval_count integer DEFAULT 0
);
```

> **🔧 En nuestra implementación.** La tabla real está en `packages/db/supabase/migrations/00006_long_term_memory.sql`. Diferencias y añadidos sobre el ejemplo del curso:
> - La columna de clasificación se llama **`type`** (no `memory_type`) y lleva un `check (type in ('episodic','semantic','procedural'))`.
> - Añadimos **`user_id`** (FK a `profiles`, con RLS) para aislar el baúl de cada usuario, **`created_at`** y **`last_retrieved_at`** (soporte de memoria episódica y de un futuro archivado por desuso).
> - Índice **ivfflat** (`vector_cosine_ops`) para que la similitud de coseno escale.
> - La migración `00007_memory_idle_setting.sql` añade `profiles.memory_flush_idle_minutes` (umbral de inactividad **por usuario**, editable en Ajustes).

### La función `match_memories` y el retrieval count

La recuperación no es un volcado: es una consulta **enfocada** —top 5–8 por similitud— encapsulada en una función SQL. Cada recuerpo recuperado **sube su `retrieval_count`**, creando una jerarquía por uso.

> **🔧 En nuestra implementación.** En la misma migración `00006` definimos tres funciones SQL:
> - **`match_memories(query_embedding, match_user_id, match_count)`** — top-K por `1 - (embedding <=> query_embedding)` (coseno), con desempate por `retrieval_count`. La consume `matchMemories(...)` en `packages/db/src/queries/memories.ts`.
> - **`bump_retrieval_count(ids[])`** — incremento atómico del contador + `last_retrieved_at`. El nodo de inyección la llama tras recuperar (`bumpRetrievalCount`).
> - **`find_similar_memory(...)`** — la pieza del reto de duplicados (ver más abajo).
>
> El bloque que se inyecta al system prompt lo arma `buildMemoryBlock(...)` en `memory_injection_node.ts`, bajo el marcador `[MEMORIA DEL USUARIO]`. El `K` por defecto es 6 (`MEMORY_RETRIEVAL_K`).

### Supabase + Cursor en el flujo de trabajo

Supabase actúa como **base de datos vectorial** (vía `pgvector`); Cursor ayuda a estructurar el código de los nodos y a generar los **scripts de migración SQL** exactos. El ciclo práctico es: prompt → revisar código generado → ejecutar migración → verificar en el Table Editor → probar en tiempo real.

## Guía práctica: implementación y prueba de la memoria vectorial

> Rama de referencia del curso: `https://github.com/lab10-org/10x-builders-agent/tree/agent-memory`

### Preparación

1. Abre el proyecto del agente en **Cursor**.
2. Ten tu Supabase local corriendo (`supabase start`).
3. Verifica que el agente base responde a prompts simples **antes** de inyectar los nodos nuevos.

### Paso 1 — Generar la arquitectura con Cursor

Pídele a Cursor la arquitectura de memoria a largo plazo, especificando **dos nodos**: inyección al inicio y flush al final. Revisa que las funciones de extracción y guardado queden integradas en el flujo.

> **🔧 En nuestra implementación.** El nodo de inyección (`memory_injection_node.ts`) hace, en orden: extrae el último mensaje del usuario (`lastUserInput`), genera su embedding, llama a `matchMemories`, sube el `retrieval_count` y reescribe el `SystemMessage` con el bloque `[MEMORIA DEL USUARIO]`. Si algo falla (sin input, sin recuerdos, embeddings caídos) hace *passthrough* y el turno corre sin memoria —nunca tumba el chat—. El flush (`memory_flush.ts`) lee el historial de la sesión, extrae hechos con un LLM dedicado (`createMemoryModel` en `model.ts`), deduplica y guarda.

### Paso 2 — Crear las migraciones en Supabase

Pídele a Cursor el script SQL para la tabla y la función de búsqueda. Debe incluir: habilitar la extensión vectorial, crear la tabla (`content`, `type`, `embedding`, `retrieval_count`) y la función `match_memories`. Ejecútala (`supabase db push` o aplicando la migración local) y verifica en el **Table Editor** que la tabla quedó con las columnas correctas.

> **🔧 En nuestra implementación.** Migración `00006_long_term_memory.sql`. Un detalle que nos mordió: el push del CLI no incluye el esquema `extensions` en el `search_path` (a diferencia del SQL Editor del Dashboard), así que la migración fija `set search_path = public, extensions;` y crea `pgvector` con `with schema extensions`. Sin eso, `vector`, `vector_cosine_ops` y el operador `<=>` no resuelven al aplicar por CLI.

### Paso 3 — Probar el sistema de memoria

1. Interactúa con el agente dando un dato personal: *"disfruto jugar al fútbol los fines de semana"*.
2. Observa los logs para confirmar que el flush se ejecuta y procesa la info.
3. En el Table Editor, refresca y verifica que aparece el recuerdo (*"El usuario disfruta del fútbol"*) con su vector.
4. Haz una consulta relacionada con el deporte y verifica que el `retrieval_count` de ese recuerdo **subió** —prueba de que se inyectó.

> **🔧 En nuestra implementación.** Como el flush es post-sesión, para forzarlo sin esperar la inactividad se pulsa **"Nueva conversación"** (cierra y flushea síncrono) o se llama al endpoint:
> ```bash
> curl -X POST http://localhost:3000/api/memory/flush-tick -H "x-cron-secret: $CRON_SECRET"
> ```
> Los logs a buscar: `[memoryFlush] done` (extracción) y `[memoryInjectionNode] injected memories` (inyección). El `retrieval_count` se verifica con:
> ```sql
> select type, content, retrieval_count, last_retrieved_at from memories where user_id = '<uuid>';
> ```
> La lógica determinista (parseo del JSON extraído, dedup, formato del bloque) está cubierta por `scripts/smoke-memory.ts` (`npx tsx packages/agent/scripts/smoke-memory.ts`).

### Paso 4 (reto) — Optimización de duplicados

El reto del curso: antes de guardar, hacer una **búsqueda semántica**; si existe un recuerdo con similitud muy alta (p. ej. > 0.95), **actualizarlo o ignorarlo** en lugar de insertar una fila nueva. Probar repitiendo el mismo dato y confirmar que no se crean duplicados.

> **🔧 En nuestra implementación — lo hicimos, con matices.** Resolvimos la deduplicación en **dos capas** dentro de `memory_flush.ts`:
> 1. **Intra-lote** (`dedupeBatch`): colapsa hechos casi idénticos que el propio LLM repite en una misma extracción (normaliza el texto y compara por `type` + contenido).
> 2. **Semántica contra lo almacenado** (`find_similar_memory`): por cada hecho candidato genera su embedding y consulta si ya existe uno **del mismo `type`** por encima del umbral `MEMORY_DEDUP_THRESHOLD` (**default 0.90**, configurable por entorno).
>
> Y aquí la decisión de diseño que nos diferencia del guion: cuando detectamos un duplicado **no lo ignoramos ni lo sobrescribimos a ciegas — lo reforzamos**. Subimos el `retrieval_count` del recuerdo existente (`bump_retrieval_count`) y descartamos el insert. Re-mencionar un hecho es señal de que sigue vigente e importante, así que en vez de perder la señal, la sumamos a la jerarquía por uso. Solo se inserta (`saveMemory`) lo genuinamente nuevo.
>
> **Limitación honesta** (documentada en `docs/features/long-term-memory/plan.md`): el dedup por similitud asume "muy parecido = lo mismo". Un hecho que **contradice** a uno viejo ("antes usaba JS, ahora TS") puede quedar omitido por cercanía semántica, dejando el dato viejo. La **reconciliación de memorias contradictorias** quedó como trabajo futuro; el umbral 0.90 es conservador para minimizar falsos positivos.

### Extras que añadimos sobre el guion del curso

- **Dos disparadores de cierre** (explícito + sweep de inactividad por pg_cron), no un flush por turno. Ver `getIdleSessions`, `claimSessionForFlush`, `closeSession`, `markSessionFlushed` en `queries/memories.ts` y el CAS `active→closed` con reintento vía `flushed_at`.
- **Umbral de inactividad por usuario** (`memory_flush_idle_minutes`, editable en Ajustes; migración `00007`).
- **Guard de sesión trivial** (`MEMORY_FLUSH_MIN_TURNS`, default 2): no flushea conversaciones de un "hola".
- **RLS por usuario** en `memories` y filtro `user_id` explícito dentro de las funciones SQL, para que el service-role del flush no cruce recuerdos entre usuarios.

## Síntesis

Esta sesión cerró el ciclo flush → store → retrieve → inject en código real. La pieza conceptual es la **búsqueda semántica con embeddings**: convertir texto en vectores y recuperar por cercanía de significado, no por coincidencia de texto. La pieza de datos es una tabla `memories` con `content`, `type`, `embedding vector(1536)` y `retrieval_count`, más una función `match_memories` que ordena por coseno. La pieza de flujo son dos nodos: inyección al inicio (recupera y enriquece el prompt) y flush al cerrar la sesión (extrae, **deduplica** y guarda). El detalle que separa un baúl útil de uno saturado es la **deduplicación**: buscar antes de escribir y, ante un duplicado, reforzar en vez de repetir. Toda la implementación as-built vive en `projects/10x-builders-agent` y está enlazada paso a paso en estos apuntes.

## Preguntas de repaso

1. ¿Por qué la búsqueda semántica encuentra "tarta" al consultar "manzana", y qué tiene que ver con los embeddings y la similitud de coseno?
2. Enumera las columnas mínimas de la tabla `memories` y di qué papel juega cada una. ¿Qué añadimos nosotros sobre el ejemplo del curso y por qué (`user_id`, `last_retrieved_at`)?
3. El guion sugiere flushear "al final de la ejecución". Nosotros flusheamos al **cerrar la sesión**. Argumenta por qué la segunda opción evita duplicados y coste innecesario.
4. ¿Qué hace `match_memories` y cómo se relaciona el `retrieval_count` con priorizar recuerdos? ¿Dónde se incrementa en nuestro código?
5. Describe las **dos capas** de deduplicación que implementamos. ¿Por qué reforzar el `retrieval_count` de un duplicado es mejor que ignorarlo sin más?
6. ¿Qué riesgo introduce el dedup por similitud cuando un hecho nuevo **contradice** a uno viejo? ¿Cómo lo dejamos documentado?

## Recursos

- [Supabase — AI & Vectors (pgvector)](https://supabase.com/docs/guides/ai) — integración de IA y búsqueda vectorial.
- [Supabase — Vector columns & similarity search](https://supabase.com/docs/guides/ai/vector-columns) — columnas `vector` y funciones de matching por coseno.
- [OpenAI — Guía de Embeddings](https://platform.openai.com/docs/guides/embeddings) — qué son los embeddings y el modelo `text-embedding-3-small`.
- Rama de GitHub del curso: `https://github.com/lab10-org/10x-builders-agent/tree/agent-memory`.
- Implementación as-built (nuestro repo): `projects/10x-builders-agent/docs/features/long-term-memory/plan.md` y `README.md`.
- Conexión interna: [Fundamentos de Memoria a Largo Plazo](./04-long-term-memory-fundamentals.md) — la teoría que esta sesión baja a código.
- Conexión interna: [Memoria a corto plazo: compactación en cascada](./03-short-term-memory-cascading-compaction.md) — el `compaction_node`, vecino de nuestro `memory_injection`.