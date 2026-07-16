# Arquitectura Técnica — Agente Personal MVP

## Stack

| Capa                  | Tecnología                           | Paquete                              |
| --------------------- | ------------------------------------ | ------------------------------------ |
| Monorepo              | Turborepo + npm workspaces           | raíz                                 |
| Frontend / API routes | Next.js (App Router)                 | `apps/web`                           |
| Agente runtime        | LangGraph JS + LangChain core        | `packages/agent`                     |
| Base de datos + Auth  | Supabase (Postgres + Auth + RLS)     | `packages/db`                        |
| Tipos compartidos     | TypeScript                           | `packages/types`                     |
| Config compartida     | tsconfig                             | `packages/config`                    |
| Modelo LLM            | OpenRouter (GPT-4o-mini por defecto) | vía `@langchain/openai` con base URL |
| Observabilidad        | Langfuse self-hosted (Docker)        | `packages/agent` vía `langfuse-langchain` |

## Estructura del monorepo

```
10x-builders-agent/
├── apps/
│   └── web/                       # Next.js — UI + API routes
│       └── src/
│           ├── app/
│           │   ├── login/         # Autenticación
│           │   ├── signup/
│           │   ├── forgot-password/ # Solicitar enlace de recuperación
│           │   ├── reset-password/  # Establecer nueva contraseña (sesión recovery)
│           │   ├── onboarding/    # Wizard multi-paso
│           │   ├── chat/          # Interfaz de chat + confirmaciones
│           │   ├── settings/      # Ajustes + integraciones
│           │   └── api/
│           │       ├── auth/
│           │       │   ├── signout/           # POST → cerrar sesión
│           │       │   └── github/
│           │       │       ├── start/         # GET → redirige a GitHub OAuth
│           │       │       ├── callback/      # GET → intercambio de código por token
│           │       │       └── disconnect/    # POST → revoca integración
│           │       ├── chat/
│           │       │   ├── route.ts           # POST → runAgent
│           │       │   └── confirm/           # POST → aprobar/rechazar tool call
│           │       ├── telegram/
│           │       │   ├── webhook/           # POST → bot Telegram
│           │       │   └── setup/             # GET → registrar webhook
│           │       ├── scheduled-tasks/
│           │       │   └── tick/              # POST (cron-only) → dispara tareas due
│           │       ├── memory/
│           │       │   └── flush-tick/        # POST (cron-only) → flush de sesiones inactivas
│           │       └── sessions/
│           │           └── close/             # POST → cierre explícito + flush síncrono
│           ├── components/                   # Componentes compartidos (PasswordInput, PasswordRules)
│           ├── lib/
│           │   ├── agent/
│           │   │   ├── integrations-context.ts  # Carga tokens descifrados en memoria
│           │   │   └── load-context.ts          # Helper compartido: profile + tools + integraciones + preámbulo temporal
│           │   ├── auth/
│           │   │   └── password.ts              # Esquema de contraseña (PASSWORD_RULES, validatePassword)
│           │   ├── github/
│           │   │   └── oauth.ts               # Helpers OAuth (authorize URL, token exchange)
│           │   └── supabase/                  # Helpers SSR (client, middleware)
│           └── middleware.ts                   # Auth guard
├── packages/
│   ├── agent/                     # LangGraph grafo + tools
│   │   └── src/
│   │       ├── graph.ts           # StateGraph: memory_injection → compaction → agent → tools loop
│   │       ├── model.ts           # ChatOpenAI vía OpenRouter (chat, compaction, memory)
│   │       ├── embeddings.ts      # generateEmbedding() por fetch a OpenRouter (1536 dims)
│   │       ├── memory_injection_node.ts # Nodo: recupera top-K e inyecta [MEMORIA DEL USUARIO]
│   │       ├── memory_flush.ts    # Extracción post-sesión: destila + deduplica + guarda
│   │       ├── types.ts           # IntegrationsContext, PendingConfirmation
│   │       ├── integrations/
│   │       │   └── github.ts      # Cliente REST mínimo de GitHub API
│   │       ├── notifications/
│   │       │   ├── types.ts       # NotificationChannelAdapter / NotificationPayload
│   │       │   ├── telegram.ts    # Adapter Telegram (sendMessage + confirmationKeyboard)
│   │       │   └── index.ts       # Registry + dispatchNotification(channels, ...)
│   │       └── tools/
│   │           ├── catalog.ts     # Definiciones (id, risk, schema, requires_integration)
│   │           ├── adapters.ts    # LangChain tool() wrappers + confirmación + ejecución aprobada
│   │           ├── bash-exec.ts   # Subproceso bash -lc (timeout, max output, gate ALLOW_BASH_TOOL)
│   │           ├── file-ops.ts    # read_file/write_file/edit_file (sandbox opcional, escritura atómica)
│   │           └── cron-utils.ts  # Wrappers de cron-parser/cronstrue compartidos por tools y /tick
│   ├── db/                        # Supabase client + queries tipadas
│   │   └── src/
│   │       ├── client.ts
│   │       ├── crypto.ts          # AES-256-GCM encrypt/decrypt de tokens OAuth
│   │       ├── index.ts
│   │       └── queries/           # profiles, sessions, messages, tools, integrations, telegram, tool-calls
│   ├── types/                     # Interfaces compartidas
│   └── config/                    # tsconfig base/next
├── docs/
│   ├── brief.md                       # Brief original del producto
│   ├── architecture.md                # ← este archivo
│   ├── plan.md                        # Plan de implementación
│   └── features/                      # Una carpeta por feature/integración
│       ├── github/
│       │   └── README.md              # Diseño de la integración de GitHub
│       ├── calendar/
│       │   ├── README.md              # Diseño de la integración de Google Calendar
│       │   ├── brief.md               # Brief inicial de Google Calendar
│       │   └── plan.md                # Plan de implementación de Google Calendar
│       ├── google-sheets/
│       │   ├── brief.md               # Brief de Google Sheets
│       │   └── plan.md                # Plan de Google Sheets
│       ├── scheduled-tasks/
│       │   ├── README.md              # Guía de uso + setup de pg_cron
│       │   └── plan.md                # Plan de tareas programadas
│       ├── hitl/
│       │   └── plan.md                # Plan del flujo human-in-the-loop
│       ├── bash-tool/
│       │   └── plan.md                # Plan de la tool bash
│       ├── file-tools/
│       │   └── plan.md                # Plan de las file tools (read/write/edit)
│       ├── compaction/
│       │   └── plan.md                # Plan de la memoria a corto plazo del agente
│       ├── long-term-memory/
│       │   ├── README.md              # Guía de uso + setup del flush por inactividad
│       │   └── plan.md                # Plan de la memoria a largo plazo
│       └── password-recovery/
│           ├── brief.md               # Brief del flujo de recuperación de contraseña
│           └── plan.md                # Plan as-built del flujo de recuperación
└── turbo.json                     # Pipeline: build, dev, lint, type-check
```

## Diagrama de componentes

```
┌─────────────┐    ┌──────────────┐
│  Next.js UI │    │ Telegram Bot │
│  (web chat) │    │  (webhook)   │
└──────┬──────┘    └──────┬───────┘
       │                  │
       ▼                  ▼
┌─────────────────────────────────┐
│     Supabase Auth (JWT)         │
└──────────────┬──────────────────┘
               ▼
┌─────────────────────────────────┐
│  Integrations Context (in-mem)  │
│  Decrypt OAuth tokens on-the-fly│
└──────────────┬──────────────────┘
               ▼
┌─────────────────────────────────┐
│   LangGraph Runtime (grafo)     │
│   ┌─────────┐  ┌────────────┐  │
│   │  Agent   │→ │ Tool Exec  │  │
│   │  Node    │← │  + Policy  │  │
│   └─────────┘  └────────────┘  │
└──────────────┬──────────────────┘
               │
       ┌───────┴────────┐
       ▼                ▼
┌──────────────┐ ┌──────────────┐
│   Supabase   │ │  GitHub API  │
│   Postgres   │ │  (OAuth)     │
└──────────────┘ └──────────────┘
```

## Flujo de un request de chat

1. Usuario envía mensaje (web POST `/api/chat` o Telegram webhook).
2. Se autentica al usuario (JWT en web, lookup `telegram_accounts` en Telegram).
3. Se carga o crea `agent_session` para el canal.
4. Se cargan `profile`, `user_tool_settings` e `integrations`.
5. Se construye `IntegrationsContext`: se descifran tokens OAuth en memoria (nunca se serializan).
6. Se filtran las tools disponibles (allowlist + integración activa + token válido).
7. Se invoca `runAgent()`:
   - Se construye el historial (últimos 30 mensajes de la sesión).
   - LangGraph ejecuta el grafo: `agent → [tools] → agent` (máx 6 iteraciones).
   - Si una tool tiene riesgo medio/alto, lanza `ConfirmationRequiredError` → se persiste como `pending_confirmation` en `tool_calls` y el grafo se detiene sin volver al modelo.
8. Se persisten los mensajes (user + assistant) en `agent_messages`.
9. Se devuelve la respuesta al canal, o el estado de confirmación pendiente.

## Flujo de confirmación de tools

Diseño detallado en [docs/features/github/README.md](features/github/README.md) (secciones 4, 5 y 6).

1. El agente detecta un tool call de riesgo medio o alto → lanza `ConfirmationRequiredError`.
2. El graph persiste la tool call con estado `pending_confirmation` y se detiene.
3. La UI muestra un prompt de aprobación:
   - **Web**: botones Aprobar / Rechazar en la interfaz de chat.
   - **Telegram**: botones inline (`inline_keyboard`) en el mensaje.
4. El usuario responde → `POST /api/chat/confirm` (web) o callback query handler (Telegram).
5. Si se aprueba: `executeApprovedToolCall()` ejecuta la acción real con el token descifrado.
6. Si se rechaza: se actualiza el estado a `rejected`.

## LangGraph: grafo simplificado

- **StateGraph** con cuatro nodos: `memory_injection` (memoria a largo plazo, inicio de turno), `compaction` (memoria a corto plazo), `agent` (invoca modelo con tools) y `tools` (ejecuta tool calls).
- **Topología**: `__start__ → memory_injection → compaction → agent → (tools | __end__)`, con `tools → compaction` (el edge crítico: cada tool result pasa por compaction antes de volver al agente). `memory_injection` corre solo en `__start__`, una vez por turno; el loop nunca vuelve a él.
- **Arista condicional** desde `agent`: si hay tool calls → `tools`; si no → `__end__`.
- **PostgresSaver** como checkpointer (thread_id = uuid por turno, ver `graph.ts`).
- Máximo 6 iteraciones de tool para evitar loops.

### Memoria a corto plazo (compaction_node)

El nodo `compaction` actúa como memoria a corto plazo del agente. Cada vez que la conversación lo atraviesa decide si limpiar y/o resumir el historial:

- **Etapa 1 (microcompact, gratis):** reemplaza el contenido de los `ToolMessage` viejos por `[tool result cleared]`, preservando íntegros los últimos 5. Usa el mismo `id` para que `messagesStateReducer` sobrescriba la entrada en vez de duplicar.
- **Etapa 2 (LLM compaction):** si tras el microcompact la estimación `chars/4` supera el 80% de `CONTEXT_WINDOW = 64_000`, invoca `createCompactionModel()` (modelo dedicado vía `OPENROUTER_COMPACTION_MODEL`) con un prompt de 9 secciones. La respuesta pasa por `stripAnalysisBlocks()` antes de reinyectarse como `SystemMessage` resumen + `RemoveMessage` por cada mensaje compactado.
- **Circuit breaker:** tras 3 fallos consecutivos de la etapa 2 (campo `compactionFailures` en el state), el nodo hace passthrough sin tocar `messages` para no bloquear el grafo.

El reducer de `messages` es `messagesStateReducer` (oficial de `@langchain/langgraph`), que dedupe por id y procesa `RemoveMessage`. Para que esto funcione, `runAgent` asigna `randomUUID()` explícito a los `SystemMessage` / `HumanMessage` / `AIMessage` que construye al cargar historial.

Diseño completo en [features/compaction/plan.md](features/compaction/plan.md).

### Memoria a largo plazo (memory_injection + memory_flush)

Si la compactación gobierna el contexto **dentro** de una sesión, la memoria a largo plazo gobierna qué sobrevive **entre** sesiones. Cruza la información por `user_id` en la tabla `memories` (pgvector). Dos procesos separados:

- **`memory_injection` (síncrono, nodo del grafo):** primer nodo en `__start__`. Embebe el último mensaje del usuario (`generateEmbedding`), recupera por cosine similarity el top-K de `memories` (`match_memories`, default 6 vía `MEMORY_RETRIEVAL_K`), sube su `retrieval_count` (`bump_retrieval_count`) e inyecta los recuerdos en el `SystemMessage` líder como bloque `[MEMORIA DEL USUARIO]` (reemplazo por id vía `messagesStateReducer`). Corre una vez por turno y degrada a passthrough si no hay input/recuerdos/embeddings.
- **`memory_flush` (asíncrono, fuera del grafo):** se dispara al **cerrar** una sesión, por dos vías que convergen en la misma función — cierre **explícito** (`POST /api/sessions/close`, botón "Nueva conversación", flush síncrono) y **sweep de inactividad** (`POST /api/memory/flush-tick`, pg_cron + service-role, CAS `active→closed`, reintento vía `flushed_at`). Lee el historial, extrae hechos durables con `createMemoryModel` (prompt conservador, clasificación `episodic`/`semantic`/`procedural`), deduplica (intra-lote + por embedding contra lo almacenado, reforzando el duplicado) y guarda solo lo nuevo.

El umbral de inactividad es **por usuario** (`profiles.memory_flush_idle_minutes`, default 30, rango 5–1440, editable en Ajustes); `MEMORY_FLUSH_IDLE_MINUTES` es el fallback. Embeddings vía `fetch` directo a OpenRouter (`packages/agent/src/embeddings.ts`, `OPENROUTER_EMBEDDING_MODEL`).

Diseño en [features/long-term-memory/plan.md](features/long-term-memory/plan.md), guía operativa en [features/long-term-memory/README.md](features/long-term-memory/README.md).

## Observabilidad (Langfuse)

Tracing por turno contra una instancia self-hosted de Langfuse (Docker, UI en `http://localhost:3001`):

- **Handler por invocación**: `runAgent` crea un `CallbackHandler` (`packages/agent/src/observability.ts`) por turno, con `sessionId`/`userId` — Langfuse agrupa las trazas por sesión y usuario sin trabajo extra. `threadId` y `autonomous` viajan como metadata/tags.
- **Propagación por `config`**: el handler entra en `config.callbacks` del `app.invoke(...)`, y cada nodo (`agentNode`, `toolExecutorNode`, `compactionNode`) re-pasa el `config` que recibe a sus `invoke` internos. Sin ese re-paso los callbacks no llegan a las llamadas LLM/tools y la traza mostraría solo el esqueleto del grafo.
- **Flush explícito**: `flushAsync()` tras el invoke del grafo — el SDK batchea eventos en memoria y conviene vaciar la cola antes de responder.
- **Degradación a no-op**: sin las variables `LANGFUSE_*` en el entorno, el handler es `null` y el agente corre sin tracing; si la instancia está caída, el SDK reintenta, descarta y loguea sin afectar el turno.

Diseño en [features/observability-langfuse/plan.md](features/observability-langfuse/plan.md), guía en [features/observability-langfuse/README.md](features/observability-langfuse/README.md).

## LangChain: qué usamos

- `@langchain/core`: `HumanMessage`, `AIMessage`, `SystemMessage`, `ToolMessage`, `tool()`.
- `@langchain/openai`: `ChatOpenAI` con `baseURL` apuntando a OpenRouter.
- `@langchain/langgraph`: `StateGraph`, `Annotation`, `MemorySaver`, `END`.
- `zod`: schemas de validación para parámetros de tools.

## Modelo de datos

Migración base: `packages/db/supabase/migrations/00001_initial_schema.sql`.
Migración GitHub: `packages/db/supabase/migrations/00002_github_integration.sql`.
Migración Google Calendar: `packages/db/supabase/migrations/00003_google_integration.sql`.
Migración HITL nativo: `packages/db/supabase/migrations/00004_tool_calls_thread_id.sql`.
Migración tareas programadas: `packages/db/supabase/migrations/00005_scheduled_tasks.sql`.
Migración memoria a largo plazo: `packages/db/supabase/migrations/00006_long_term_memory.sql` (pgvector + tabla `memories` + funciones + `agent_sessions.flushed_at`).
Migración umbral de inactividad: `packages/db/supabase/migrations/00007_memory_idle_setting.sql` (`profiles.memory_flush_idle_minutes`).

Tablas: `profiles`, `user_integrations`, `user_tool_settings`, `agent_sessions`, `agent_messages`, `tool_calls`, `telegram_accounts`, `telegram_link_codes`, `scheduled_tasks`, `memories`.

Campos añadidos por migración 00002 en `user_integrations`:
- `provider_account_id` — ID numérico estable del proveedor (ej. GitHub user ID).
- `provider_account_login` — Handle legible (ej. GitHub login). Seguro para exponer al cliente.
- `updated_at` — Timestamp con trigger automático.

Todas con **RLS habilitado** y políticas por `user_id` desde el día 1.

## Seguridad

- **RLS** en toda tabla con datos de usuario.
- **Allowlist de tools**: solo se montan las que el usuario habilitó en onboarding/ajustes Y para las que tiene integración activa Y token descifrable.
- **Confirmación humana**: tools de riesgo medio/alto generan `pending_confirmation` en lugar de ejecutar. El grafo se detiene sin volver al modelo para evitar que el LLM fabrique respuestas de "esperando aprobación".
- **Cifrado de tokens OAuth**: AES-256-GCM con clave derivada de `OAUTH_ENCRYPTION_KEY` vía SHA-256. Formato: `v1:<iv>:<tag>:<ciphertext>`. Los tokens solo se descifran en memoria durante la invocación del agente y nunca se serializan en respuestas, cookies o logs.
- **GitHub OAuth**: flujo estándar con state CSRF, intercambio de código por token en el servidor, almacenamiento cifrado del access token. Ver [docs/features/github/README.md](features/github/README.md).
- **Budget**: `budget_tokens_limit` por sesión para evitar costes descontrolados.

## Canales

- **Web**: Next.js App Router, POST síncrono a `/api/chat`, confirmaciones en la interfaz de chat.
- **Telegram**: webhook en `/api/telegram/webhook`, vinculación via código de un solo uso (`/link CODE`), confirmaciones con `inline_keyboard`.
- **Scheduled** (`channel='scheduled'`): cada disparo de pg_cron crea una sesión nueva aislada. No tiene UI; el agente publica el resultado por los canales de notificación configurados en la tarea.

## Tareas programadas

Diseño en [features/scheduled-tasks/plan.md](features/scheduled-tasks/plan.md), guía operativa en [features/scheduled-tasks/README.md](features/scheduled-tasks/README.md).

```
chat (web/telegram)                pg_cron (cada minuto)
       │                                   │
       │ create_scheduled_task             │ POST /api/scheduled-tasks/tick
       ▼                                   ▼
┌─────────────────┐                 ┌──────────────────┐
│ HITL approve    │                 │ getDueTasks      │
└────────┬────────┘                 └─────────┬────────┘
         ▼                                    ▼
┌─────────────────┐                 ┌──────────────────┐
│ scheduled_tasks │ ◄───────────────│ claimScheduledTask │ (CAS optimista)
│  + next_exec    │                 └─────────┬────────┘
└─────────────────┘                           ▼
                                    ┌──────────────────┐
                                    │ runAgent({       │
                                    │  message=desc,   │
                                    │  autonomous? })  │
                                    │  channel=scheduled│
                                    └─────────┬────────┘
                                              ▼
                                    ┌──────────────────┐
                                    │ dispatchNotif    │
                                    │  → Telegram (MVP)│
                                    └──────────────────┘
```

Detalles clave:

- Tabla `scheduled_tasks` (migration `00005`) con índice parcial `next_execution` (donde `enabled` y `status='active'`) para lookup barato.
- Endpoint `/api/scheduled-tasks/tick` se autentica con header `x-cron-secret` y usa **service role**; pg_cron lo dispara con `net.http_post` cada minuto.
- `runAgent` admite `autonomous: boolean`: cuando `true`, el `toolExecutorNode` salta el `interrupt()` para tools medium/high (pero crea un `tool_calls` con `status='approved'` para mantener auditoría).
- `loadAgentContext` (en `apps/web/src/lib/agent/load-context.ts`) construye el system prompt con un **preámbulo temporal** (fecha/hora/TZ/día) para que el modelo resuelva expresiones relativas. En el canal scheduled, el preámbulo refleja el momento del disparo.
- `dispatchNotification` (en `packages/agent/src/notifications/`) abstrae el envío para que canales nuevos (email, web push) requieran solo un adapter sin tocar el endpoint.

## Integraciones externas

| Proveedor | Tipo | Scopes | Tools habilitadas | Doc de diseño |
|-----------|------|--------|-------------------|---------------|
| GitHub | OAuth App | `repo`, `read:user` | `github_list_repos`, `github_list_issues`, `github_create_issue`, `github_create_repo` | [features/github/README.md](features/github/README.md) |
| Google Calendar | OAuth Web Client | `openid email https://www.googleapis.com/auth/calendar.events` | `gcal_list_events`, `gcal_get_event`, `gcal_create_event`, `gcal_update_event`, `gcal_delete_event` | [features/calendar/README.md](features/calendar/README.md) |

## Tools del agente

El catálogo completo vive en [`packages/agent/src/tools/catalog.ts`](../packages/agent/src/tools/catalog.ts). Cada tool declara `id`, `risk` (`low` | `medium` | `high`), opcionalmente `requires_integration` y un `parameters_schema` (JSON Schema). El runtime las monta en [`adapters.ts`](../packages/agent/src/tools/adapters.ts) tras pasar el filtro de allowlist + integración activa + token disponible + gates de entorno.

| Tool                  | Riesgo | Integración | Gate de entorno                | Confirmación HITL | Notas |
|-----------------------|--------|-------------|--------------------------------|-------------------|-------|
| `get_user_preferences`| medium | —           | —                              | sí                | Lee perfil y configuración del agente |
| `list_enabled_tools`  | low    | —           | —                              | no                | Devuelve las tools habilitadas por el usuario |
| `github_list_repos`   | low    | `github`    | —                              | no                | |
| `github_list_issues`  | low    | `github`    | —                              | no                | |
| `github_create_issue` | medium | `github`    | —                              | sí                | |
| `github_create_repo`  | high   | `github`    | —                              | sí                | |
| `gcal_list_events`    | low    | `google`    | —                              | no                | Expande recurrencias en instancias |
| `gcal_get_event`      | low    | `google`    | —                              | no                | |
| `gcal_create_event`   | medium | `google`    | —                              | sí                | Soporta RRULE (RFC 5545) |
| `gcal_update_event`   | medium | `google`    | —                              | sí                | `scope: instance | series` |
| `gcal_delete_event`   | high   | `google`    | —                              | sí                | `scope: instance | series` |
| `bash`                | high   | —           | `ALLOW_BASH_TOOL`              | sí                | Subproceso `bash -lc` por llamada (sin shell persistente entre llamadas); `cwd` opcional. Diseño en [features/bash-tool/plan.md](features/bash-tool/plan.md) |
| `read_file`           | low    | —           | `ALLOW_FILE_TOOLS`             | no                | Lee UTF-8; `offset`/`limit` 1-indexed; sandbox opcional vía `FILE_TOOLS_WORKSPACE_ROOT` |
| `write_file`          | low    | —           | `ALLOW_FILE_TOOLS`             | no                | Solo crea archivos nuevos (atómico tempfile + `fs.rename`); falla con `FILE_ALREADY_EXISTS` si existe |
| `edit_file`           | high   | —           | `ALLOW_FILE_TOOLS`             | sí                | Reemplazo literal único (`old_string` → `new_string`) con escritura atómica y diff en la tarjeta de confirmación. Diseño en [features/file-tools/plan.md](features/file-tools/plan.md) |
| `create_scheduled_task` | medium | —         | `ALLOW_SCHEDULED_TASKS_TOOL`   | sí                | Crea una tarea recurrente. Valida cron con `cron-parser` y precomputa `next_execution`. Diseño en [features/scheduled-tasks/plan.md](features/scheduled-tasks/plan.md) |
| `list_scheduled_tasks`  | low    | —         | `ALLOW_SCHEDULED_TASKS_TOOL`   | no                | Lista las tareas del usuario con filtro opcional por status |
| `update_scheduled_task` | medium | —         | `ALLOW_SCHEDULED_TASKS_TOOL`   | sí                | Activa/desactiva una tarea por id sin eliminarla (toggle del flag `enabled`) |
| `delete_scheduled_task` | high   | —         | `ALLOW_SCHEDULED_TASKS_TOOL`   | sí                | Elimina permanentemente una tarea por id |

### Gates de entorno

Las tools de riesgo alto que tocan el sistema de archivos o ejecutan comandos están **opt-in por servidor** vía variables de entorno; sin la variable, la tool ni siquiera se registra en el grafo aunque el usuario la tenga habilitada en BD:

| Variable                      | Tools afectadas                                    | Default | Descripción |
|-------------------------------|----------------------------------------------------|---------|-------------|
| `ALLOW_BASH_TOOL`             | `bash`                                             | off     | `true`/`1` para exponer la tool. Riesgo alto, HITL siempre activo |
| `ALLOW_FILE_TOOLS`            | `read_file`, `write_file`, `edit_file`             | off     | `true`/`1` para exponer las tres tools de archivos |
| `FILE_TOOLS_WORKSPACE_ROOT`   | `read_file`, `write_file`, `edit_file`             | unset   | Si se define, confina toda ruta dentro y permite paths relativos. Sin definir, solo absolutos y el alcance lo dictan los permisos del proceso (entorno confiable) |
| `FILE_TOOL_MAX_BYTES`         | `read_file`, `write_file`, `edit_file`             | `1000000` | Cap defensivo simétrico para lectura, escritura nueva y resultado de edición |
| `ALLOW_SCHEDULED_TASKS_TOOL`  | `create_scheduled_task`, `list_scheduled_tasks`, `delete_scheduled_task` | off | `true` para exponer las tools de tareas programadas |
| `CRON_SECRET`                 | endpoint `/api/scheduled-tasks/tick` (no es una tool) | unset | Secret compartido entre pg_cron y el endpoint. Sin él, el endpoint responde 401 |

### Patrón de implementación

- **Tools `low`**: el adapter persiste el `tool_call` con `createToolCall` antes de ejecutar y actualiza el estado al terminar.
- **Tools `medium`/`high`**: el `toolExecutorNode` del grafo crea el pending y lanza `interrupt()`; el handler del adapter solo se invoca después de aprobación, sin tocar BD adicional.
- **Errores como outputs**: las file tools devuelven `{ ok: false, code, message, details? }` (no `throw`) para que el LLM pueda razonar y reintentar sin romper el flujo del grafo.
