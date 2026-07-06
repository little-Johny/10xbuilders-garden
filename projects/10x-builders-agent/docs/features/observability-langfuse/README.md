# Observabilidad con Langfuse (self-hosted)

Tracing por turno del agente: cada invocación de `runAgent` genera una traza
en Langfuse con los nodos del grafo, las generaciones LLM (prompts, respuestas,
tokens, latencia) y las tool calls como spans.

## Arquitectura

```
runAgent (graph.ts)
  └── createLangfuseHandler()        ← packages/agent/src/observability.ts
        └── CallbackHandler (langfuse-langchain) en config.callbacks
              ├── agentNode        → modelWithTools.invoke(msgs, config)
              ├── toolExecutorNode → matchingTool.invoke(args, config)
              └── compactionNode   → model.invoke(msgs, config)
```

- **Handler por invocación**, con `sessionId`/`userId` → Langfuse agrupa
  trazas por sesión y usuario. `threadId` y `autonomous` van en metadata/tags.
- **Propagación**: los nodos re-pasan el `config` que reciben a cada `invoke`
  interno; sin eso los callbacks no llegan a las llamadas LLM/tools.
- **Flush explícito** (`flushAsync`) tras el invoke del grafo para no perder
  eventos batcheados si el proceso se recicla.

## Configuración

Credenciales en `apps/web/.env.local` (nunca en el código):

```
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_BASE_URL=http://localhost:3001
```

Si faltan las keys, `createLangfuseHandler` devuelve `null` y el agente corre
sin tracing (no-op seguro para CI u otros entornos).

## Infraestructura local

Stack self-hosted (repo oficial clonado en `~/Dev/langfuse`):

```bash
cd ~/Dev/langfuse && docker compose up -d   # levantar
cd ~/Dev/langfuse && docker compose down    # apagar (los datos persisten en volúmenes)
```

UI en `http://localhost:3001` (remapeada del 3000 vía
`docker-compose.override.yml` para no chocar con el Next.js del proyecto).

## Fuera de alcance (por ahora)

- `memory_flush` corre fuera del grafo (pg_cron → endpoint); no se traza.
- Scores/evaluaciones y prompt management de Langfuse.

Ver decisiones y detalle en [plan.md](./plan.md).
