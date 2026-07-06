# Plan — Observabilidad con Langfuse (self-hosted)

## Contexto y objetivo

Hoy el agente es una caja negra en runtime: los `console.log` de `runAgent`
dicen *que* pasó un turno, pero no *qué* pasó adentro — qué mensajes vio el
modelo, qué tools pidió, cuánto tardó cada llamada, cuántos tokens consumió.
Cuando un turno sale mal (respuesta vacía, tool loop, compaction agresiva) no
hay forma de reconstruir la ejecución.

Queremos **tracing por turno** con [Langfuse](https://langfuse.com) corriendo
**self-hosted en local** (Docker, `http://localhost:3001`), de modo que cada
invocación del grafo quede registrada como una traza navegable: nodos del
grafo → llamadas LLM (con prompts, respuestas, tokens, latencia) → tool calls.

## Estado actual (condiciona el diseño)

- El grafo se compila e invoca **dentro de `runAgent`**
  (`packages/agent/src/graph.ts`); no hay un `app` global. El punto único de
  integración es el `config` que se pasa a `app.invoke(...)`.
- **Los nodos no re-pasan el `config`**: `agentNode` llama
  `modelWithTools.invoke(state.messages)` y `compaction_node` llama
  `model.invoke([...])` sin segundo argumento. En LangChain/LangGraph JS los
  callbacks solo se propagan si cada nodo re-pasa el `config` que recibe —
  sin ese cambio, la traza mostraría el grafo pero **ninguna generación LLM**.
- El stack corre dentro del server de Next.js (`apps/web`), que carga
  `.env.local` en `process.env`. Las credenciales ya están ahí
  (`LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_BASE_URL`).
  **Nunca se hardcodean en el código** — el módulo de observabilidad las lee
  de `process.env` y si faltan devuelve `null` (no-op: el agente funciona
  igual sin Langfuse configurado).

## Decisiones

| Decisión | Elegido | Por qué |
|---|---|---|
| SDK | `langfuse-langchain` (SDK clásico v3) | Un solo `CallbackHandler` que se pasa por `config.callbacks`; sin setup de OpenTelemetry (`instrumentation.ts`) que exige el SDK v4. Suficiente para tracing de LangGraph. |
| Dónde se instala | workspace `@agents/agent` | Es el paquete dueño del grafo; `apps/web` no necesita conocer Langfuse. |
| Handler | **por invocación** (dentro de `runAgent`) | Permite fijar `sessionId`/`userId` por turno → Langfuse agrupa trazas por sesión y usuario sin trabajo extra. |
| Credenciales faltantes | handler `null`, agente sigue | Observabilidad nunca debe tumbar al agente (entornos sin Langfuse: CI, otros devs). |
| Flush | `flushAsync()` tras el `invoke` | El SDK batchea eventos; en route handlers de Next conviene vaciar la cola antes de responder para no perder trazas. |
| Alcance | grafo principal (`agent`, `tools`, `compaction`) | `memory_flush` corre fuera del grafo (pg_cron → endpoint); se instrumenta en una iteración futura si hace falta. |

## Cambios

1. **`packages/agent/package.json`** — dependencia `langfuse-langchain`.
2. **`packages/agent/src/observability.ts`** (nuevo) —
   `createLangfuseHandler({ sessionId, userId, threadId, autonomous })`:
   lee `process.env.LANGFUSE_*`; devuelve `CallbackHandler` o `null`.
3. **`packages/agent/src/graph.ts`** —
   - crear el handler al inicio de `runAgent` y añadirlo a
     `config.callbacks`;
   - `agentNode(state, config)` → re-pasar `config` a
     `modelWithTools.invoke`;
   - `toolExecutorNode(state, config)` → re-pasar `config` a
     `matchingTool.invoke` (ambos paths: directo y HITL-approve) para que las
     tools aparezcan como spans;
   - `await handler?.flushAsync()` tras el invoke.
4. **`packages/agent/src/nodes/compaction_node.ts`** — aceptar `config` y
   re-pasarlo al `model.invoke` de la compactación LLM.

## Infraestructura (ya montada)

- Repo oficial clonado en `~/Dev/langfuse`; stack v3 con
  `docker compose up -d` (web, worker, Postgres, ClickHouse, Redis, MinIO).
- `docker-compose.override.yml` remapea la UI a `127.0.0.1:3001` para no
  chocar con el Next.js del proyecto en el 3000.

## Verificación

1. `npm run type-check` en el monorepo.
2. Script puntual que envía una traza de prueba con las keys reales → debe
   aparecer en `http://localhost:3001`.
3. Turno real por la UI de chat → traza completa con generaciones y tools.
