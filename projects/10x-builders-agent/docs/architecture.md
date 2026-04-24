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
│           │       └── telegram/
│           │           ├── webhook/           # POST → bot Telegram
│           │           └── setup/             # GET → registrar webhook
│           ├── lib/
│           │   ├── agent/
│           │   │   └── integrations-context.ts  # Carga tokens descifrados en memoria
│           │   ├── github/
│           │   │   └── oauth.ts               # Helpers OAuth (authorize URL, token exchange)
│           │   └── supabase/                  # Helpers SSR (client, middleware)
│           └── middleware.ts                   # Auth guard
├── packages/
│   ├── agent/                     # LangGraph grafo + tools
│   │   └── src/
│   │       ├── graph.ts           # StateGraph: agent → tools → agent loop
│   │       ├── model.ts           # ChatOpenAI vía OpenRouter
│   │       ├── types.ts           # IntegrationsContext, PendingConfirmation
│   │       ├── integrations/
│   │       │   └── github.ts      # Cliente REST mínimo de GitHub API
│   │       └── tools/
│   │           ├── catalog.ts     # Definiciones (id, risk, schema, requires_integration)
│   │           └── adapters.ts    # LangChain tool() wrappers + confirmación + ejecución aprobada
│   ├── db/                        # Supabase client + queries tipadas
│   │   └── src/
│   │       ├── client.ts
│   │       ├── crypto.ts          # AES-256-GCM encrypt/decrypt de tokens OAuth
│   │       ├── index.ts
│   │       └── queries/           # profiles, sessions, messages, tools, integrations, telegram, tool-calls
│   ├── types/                     # Interfaces compartidas
│   └── config/                    # tsconfig base/next
├── docs/
│   ├── brief.md                   # Brief original del producto
│   ├── architecture.md            # ← este archivo
│   ├── plan.md                    # Plan de implementación
│   └── github-integration.md     # Diseño de la integración de GitHub
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

Tablas: `profiles`, `user_integrations`, `user_tool_settings`, `agent_sessions`, `agent_messages`, `tool_calls`, `telegram_accounts`, `telegram_link_codes`.

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

## Integraciones externas

| Proveedor | Tipo | Scopes | Tools habilitadas | Doc de diseño |
|-----------|------|--------|-------------------|---------------|
| GitHub | OAuth App | `repo`, `read:user` | `github_list_repos`, `github_list_issues`, `github_create_issue`, `github_create_repo` | [github-integration.md](github-integration.md) |
