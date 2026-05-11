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

## Estructura del monorepo

```
10x-builders-agent/
├── apps/
│   └── web/                       # Next.js — UI + API routes
│       └── src/
│           ├── app/
│           │   ├── login/         # Autenticación
│           │   ├── signup/
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
│           │       └── scheduled-tasks/
│           │           └── tick/              # POST (cron-only) → dispara tareas due
│           ├── lib/
│           │   ├── agent/
│           │   │   ├── integrations-context.ts  # Carga tokens descifrados en memoria
│           │   │   └── load-context.ts          # Helper compartido: profile + tools + integraciones + preámbulo temporal
│           │   ├── github/
│           │   │   └── oauth.ts               # Helpers OAuth (authorize URL, token exchange)
│           │   └── supabase/                  # Helpers SSR (client, middleware)
│           └── middleware.ts                   # Auth guard
├── packages/
│   ├── agent/                     # LangGraph grafo + tools
│   │   └── src/
│   │       ├── graph.ts           # StateGraph: agent → tools → agent loop, flag autonomous
│   │       ├── model.ts           # ChatOpenAI vía OpenRouter
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
│   ├── github-integration.md          # Diseño de la integración de GitHub
│   ├── calendar-integration.md        # Diseño de la integración de Google Calendar
│   ├── calendar-integration-brief.md  # Brief inicial de Google Calendar
│   ├── calendar-integration-plan.md   # Plan de implementación de Google Calendar
│   ├── hitl-plan.md                   # Plan del flujo human-in-the-loop
│   ├── bash-tool-plan.md              # Plan de la tool bash
│   ├── file_tools_plan.md             # Plan de las file tools (read/write/edit)
│   ├── scheduled-tasks-plan.md        # Plan de tareas programadas
│   └── scheduled-tasks.md             # Guía de uso + setup de pg_cron
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

Diseño detallado en [docs/github-integration.md](github-integration.md) (secciones 4, 5 y 6).

1. El agente detecta un tool call de riesgo medio o alto → lanza `ConfirmationRequiredError`.
2. El graph persiste la tool call con estado `pending_confirmation` y se detiene.
3. La UI muestra un prompt de aprobación:
   - **Web**: botones Aprobar / Rechazar en la interfaz de chat.
   - **Telegram**: botones inline (`inline_keyboard`) en el mensaje.
4. El usuario responde → `POST /api/chat/confirm` (web) o callback query handler (Telegram).
5. Si se aprueba: `executeApprovedToolCall()` ejecuta la acción real con el token descifrado.
6. Si se rechaza: se actualiza el estado a `rejected`.

## LangGraph: grafo simplificado

- **StateGraph** con dos nodos: `agent` (invoca modelo con tools) y `tools` (ejecuta tool calls).
- **Arista condicional** desde `agent`: si hay tool calls → `tools` → `agent`; si no → `__end__`.
- **Arista condicional** desde `tools`: si hay `pendingConfirmation` → `__end__` (halt); si no → `agent`.
- **MemorySaver** como checkpointer (thread_id = session_id).
- Máximo 6 iteraciones de tool para evitar loops.

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

Tablas: `profiles`, `user_integrations`, `user_tool_settings`, `agent_sessions`, `agent_messages`, `tool_calls`, `telegram_accounts`, `telegram_link_codes`, `scheduled_tasks`.

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
- **GitHub OAuth**: flujo estándar con state CSRF, intercambio de código por token en el servidor, almacenamiento cifrado del access token. Ver [docs/github-integration.md](github-integration.md).
- **Budget**: `budget_tokens_limit` por sesión para evitar costes descontrolados.

## Canales

- **Web**: Next.js App Router, POST síncrono a `/api/chat`, confirmaciones en la interfaz de chat.
- **Telegram**: webhook en `/api/telegram/webhook`, vinculación via código de un solo uso (`/link CODE`), confirmaciones con `inline_keyboard`.
- **Scheduled** (`channel='scheduled'`): cada disparo de pg_cron crea una sesión nueva aislada. No tiene UI; el agente publica el resultado por los canales de notificación configurados en la tarea.

## Tareas programadas

Diseño en [scheduled-tasks-plan.md](scheduled-tasks-plan.md), guía operativa en [scheduled-tasks.md](scheduled-tasks.md).

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
| GitHub | OAuth App | `repo`, `read:user` | `github_list_repos`, `github_list_issues`, `github_create_issue`, `github_create_repo` | [github-integration.md](github-integration.md) |
| Google Calendar | OAuth Web Client | `openid email https://www.googleapis.com/auth/calendar.events` | `gcal_list_events`, `gcal_get_event`, `gcal_create_event`, `gcal_update_event`, `gcal_delete_event` | [calendar-integration.md](calendar-integration.md) |

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
| `bash`                | high   | —           | `ALLOW_BASH_TOOL`              | sí                | Subproceso `bash -lc` por llamada (sin shell persistente entre llamadas); `cwd` opcional. Diseño en [bash-tool-plan.md](bash-tool-plan.md) |
| `read_file`           | low    | —           | `ALLOW_FILE_TOOLS`             | no                | Lee UTF-8; `offset`/`limit` 1-indexed; sandbox opcional vía `FILE_TOOLS_WORKSPACE_ROOT` |
| `write_file`          | low    | —           | `ALLOW_FILE_TOOLS`             | no                | Solo crea archivos nuevos (atómico tempfile + `fs.rename`); falla con `FILE_ALREADY_EXISTS` si existe |
| `edit_file`           | high   | —           | `ALLOW_FILE_TOOLS`             | sí                | Reemplazo literal único (`old_string` → `new_string`) con escritura atómica y diff en la tarjeta de confirmación. Diseño en [file_tools_plan.md](file_tools_plan.md) |
| `create_scheduled_task` | medium | —         | `ALLOW_SCHEDULED_TASKS_TOOL`   | sí                | Crea una tarea recurrente. Valida cron con `cron-parser` y precomputa `next_execution`. Diseño en [scheduled-tasks-plan.md](scheduled-tasks-plan.md) |
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
