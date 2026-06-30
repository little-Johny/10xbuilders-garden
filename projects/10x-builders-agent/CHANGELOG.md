# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Sheet references (referencias de hojas)**: el usuario registra sus hojas de Google Sheets bajo un alias legible y el agente las resuelve por nombre/intención sin volver a pegar el `spreadsheet_id`. Tabla nueva `user_sheets` (migración `00008`, RLS por usuario, `unique(user_id, alias)`) con queries `listUserSheets`/`upsertUserSheet`/`deleteUserSheet` (alias normalizado case-insensitive, upsert idempotente). Tres tools nuevas: `gsheets_save_reference` (medium, HITL), `gsheets_list_references` (low), `gsheets_delete_reference` (medium, HITL). Resolución determinista (Opción A, sin embeddings): `loadAgentContext` inyecta un bloque `[HOJAS DEL USUARIO]` en el system prompt cada turno, presente en web/Telegram/scheduled; se omite si el usuario no tiene hojas. La tool existente `gsheets_create_spreadsheet` acepta ahora un parámetro opcional `register_as` que registra la hoja recién creada en una sola confirmación (si el registro falla, devuelve el `spreadsheetId` + el error sin revertir la creación). Brief y plan en [docs/features/sheet-references/](docs/features/sheet-references/)
- **Google Sheets integration**: cliente REST mínimo `packages/agent/src/integrations/google-sheets.ts` (espejo de `google-calendar.ts`) con `sheetsFetch`, validaciones `assertSpreadsheetId`/`assertA1`/`assertWriteSize` (tope de 10.000 celdas por escritura) y `mapSheetsError` que traduce 403/`PERMISSION_DENIED` a un mensaje accionable de "reconectá Google en Settings". Cinco tools nuevas: `gsheets_list_sheets` (low), `gsheets_read_range` (low), `gsheets_append_row` (medium, INSERT_ROWS), `gsheets_update_range` (medium, default `USER_ENTERED`), `gsheets_create_spreadsheet` (medium). Las 3 de escritura disparan HITL automáticamente vía el `toolExecutorNode` existente. Brief y plan en [docs/features/google-sheets/](docs/features/google-sheets/). Issue #6

### Changed

- **`GOOGLE_OAUTH_SCOPES` ahora incluye `https://www.googleapis.com/auth/spreadsheets`**: requiere que los usuarios con Google ya conectado (por Calendar) **desconecten y reconecten** desde *Ajustes → Google* para que el grant cubra el scope nuevo. Sin reconectar, las tools `gsheets_*` devuelven el mensaje accionable de `mapSheetsError`. No requiere migración de DB (la columna `scopes` en `user_integrations` se actualiza desde el callback OAuth)

### Added

- **Memoria a largo plazo (long-term memory)**: el agente destila hechos durables al cerrar una sesión y los recupera al iniciar la siguiente, cruzándolos por `user_id`. Dos procesos separados: (1) **memory injection** — nuevo nodo `memory_injection` que corre una vez por turno en `__start__`, embebe el input del usuario, recupera por cosine similarity el top-K (`MEMORY_RETRIEVAL_K`, default 6) de `memories`, sube su `retrieval_count` e inyecta los recuerdos en el `SystemMessage` como bloque `[MEMORIA DEL USUARIO]` (degrada elegante si no hay input/recuerdos/embeddings); (2) **memory flush** — `packages/agent/src/memory_flush.ts` lee el historial de una sesión cerrada, extrae hechos durables con un LLM (`createMemoryModel`, prompt conservador) clasificados en `episodic`/`semantic`/`procedural`, deduplica (intra-lote por texto normalizado + contra lo almacenado por embedding ≥ `MEMORY_DEDUP_THRESHOLD`, reforzando el duplicado en vez de insertar) y guarda solo lo nuevo. Diseño en [docs/features/long-term-memory/plan.md](docs/features/long-term-memory/plan.md), guía operativa en [docs/features/long-term-memory/README.md](docs/features/long-term-memory/README.md)
- **Cierre de sesión (dos vías) + memoria por usuario**: cierre **explícito** con el botón "Nueva conversación" en el chat web (`POST /api/sessions/close`, flush síncrono) y el comando **`/reset` en Telegram** (mismo cierre + flush desde el webhook), más cierre **automático** por inactividad vía pg_cron (`POST /api/memory/flush-tick`, service-role + CAS `active→closed`, con reintento de flushes caídos vía `flushed_at`). El umbral de inactividad es **por usuario** (`profiles.memory_flush_idle_minutes`, default 30, rango 5–1440), editable en Ajustes; `MEMORY_FLUSH_IDLE_MINUTES` queda como fallback. Guard de sesión trivial (`MEMORY_FLUSH_MIN_TURNS`, default 2)
- **`packages/agent/src/embeddings.ts`**: `generateEmbedding(text)` por `fetch` directo al endpoint de embeddings de OpenRouter (`OPENROUTER_EMBEDDING_MODEL`, default `openai/text-embedding-3-small`, 1536 dims). Sin dependencias nuevas
- **`createMemoryModel()`** en `packages/agent/src/model.ts`: factory para el LLM de extracción (`OPENROUTER_MEMORY_MODEL`, cae a `OPENROUTER_COMPACTION_MODEL`), `temperature: 0.1`
- **Migration 00006**: extensión `vector` (pgvector), tabla `memories` (`id`, `user_id`, `type`, `content`, `embedding vector(1536)`, `retrieval_count`, `created_at`, `last_retrieved_at`) con RLS por usuario, índice ivfflat cosine, funciones `match_memories` / `find_similar_memory` / `bump_retrieval_count`, y columna `flushed_at` en `agent_sessions`
- **Migration 00007**: columna `memory_flush_idle_minutes` en `profiles` (default 30, check 5–1440)
- **Password recovery flow**: pantallas `/forgot-password` y `/reset-password` con Supabase Auth nativo (`resetPasswordForEmail` → `exchangeCodeForSession` → `updateUser`). Link "¿Olvidaste tu contraseña?" en `/login`. Hardening del callback (`next=/reset-password` → `/forgot-password?error=expired` ante fallo). Anti-enumeración: respuesta genérica única en `/forgot-password`. Mensajes del bot de Telegram (`/start` y "cuenta no vinculada") ahora incluyen la URL de recuperación. Diseño en [docs/features/password-recovery/plan.md](docs/features/password-recovery/plan.md)
- **Password schema + UX**: validación centralizada en `apps/web/src/lib/auth/password.ts` (`PASSWORD_RULES` + `validatePassword(value)`) con 5 reglas (8+, mayúscula, minúscula, número, especial). Componentes nuevos `components/password-input.tsx` (input con toggle de visibilidad, SVG inline sin librería de iconos) y `components/password-rules.tsx` (checklist viva ✓/○). Aplicado en signup y reset-password; el botón submit se deshabilita hasta cumplir todas las reglas (y, en reset, hasta que las contraseñas coincidan). Login se deja intacto.
- **Memoria a corto plazo (compaction_node)**: nuevo nodo `compaction` que se interpone en el loop del grafo (`__start__ → compaction → agent → (tools | __end__)`, `tools → compaction → agent`) para evitar Context Rot sin perder contexto crítico. Dos etapas en orden de costo: (1) **microcompact** gratis, reemplaza el contenido de los `ToolMessage` viejos por `[tool result cleared]` preservando los últimos 5; (2) **LLM compaction** si la estimación `chars/4` supera el 80% de `CONTEXT_WINDOW = 64_000`, invoca un modelo dedicado vía `OPENROUTER_COMPACTION_MODEL` con un prompt de 9 secciones y reinyecta el resumen como `SystemMessage`. Bloques `<analysis>` se eliminan por defensa. Circuit breaker tras 3 fallos consecutivos (`compactionFailures` en el state) hace passthrough sin bloquear. El reducer de `messages` migra a `messagesStateReducer` oficial de `@langchain/langgraph` para soportar `RemoveMessage(id)`; `runAgent` asigna `randomUUID()` explícito a SystemMessage/HumanMessage/AIMessage iniciales para que el reducer pueda deduparlos. Diseño en [docs/features/compaction/plan.md](docs/features/compaction/plan.md)
- **`createCompactionModel()`** en `packages/agent/src/model.ts`: factory separada de `createChatModel()` parametrizada por `OPENROUTER_COMPACTION_MODEL`, con `temperature: 0.1` para resúmenes deterministas
- **`packages/agent/src/state.ts`**: extracción de `GraphState` a archivo dedicado con `messagesStateReducer` + nuevo campo `compactionFailures` con reducer de reemplazo (`(_prev, next) => next`)
- **Scheduled tasks**: el agente puede crear tareas recurrentes que se ejecutan automáticamente. Tools `create_scheduled_task` (medium, HITL), `list_scheduled_tasks` (low), `update_scheduled_task` (medium, HITL — pausa/reanuda sin eliminar) y `delete_scheduled_task` (high, HITL). Disparador: `pg_cron` + `pg_net` llamando cada minuto al endpoint `POST /api/scheduled-tasks/tick` (auth via `CRON_SECRET`). Cada disparo crea una `agent_session(channel='scheduled')` aislada y notifica por los canales configurados. Flag `autonomous` por tarea para saltarse HITL en disparos confiables. Persistencia en tabla `scheduled_tasks` (migration `00005`). Gate maestro `ALLOW_SCHEDULED_TASKS_TOOL`. Diseño en [docs/features/scheduled-tasks/plan.md](docs/features/scheduled-tasks/plan.md), guía de uso/operación en [docs/features/scheduled-tasks/README.md](docs/features/scheduled-tasks/README.md)
- **Notifications module** (`packages/agent/src/notifications/`): registry abstraído `NotificationChannelAdapter` con adapter Telegram MVP. `dispatchNotification(channels, userId, db, payload)` itera y aísla fallos por canal. Añadir nuevos canales (email, web push) requiere solo un adapter nuevo y entry en el registry
- **Temporal preamble**: `loadAgentContext` (`apps/web/src/lib/agent/load-context.ts`) antepone al system prompt un bloque con fecha/hora/TZ del perfil para que el modelo resuelva correctamente expresiones relativas («mañana», «cada lunes a las 9am»). Aplica a los 3 canales (web, telegram, scheduled); en `scheduled` el preámbulo refleja el momento del disparo, no la creación
- **`autonomous` flag en `runAgent`**: input opcional que salta HITL para tools medium/high. Cuando está activo, el grafo crea un `tool_calls` con `status='approved'` antes de ejecutar para mantener auditoría completa
- **Migration 00005**: tabla `scheduled_tasks` con RLS estándar, índice parcial `scheduled_tasks_due_idx` y extensión del check de `agent_sessions.channel` para incluir `'scheduled'`
- **File tools**: `read_file`, `write_file` y `edit_file` (`packages/agent/src/tools/file-ops.ts`) con sandbox opcional vía `FILE_TOOLS_WORKSPACE_ROOT`, `realpath` anti-symlink, escritura atómica (tempfile + `fs.rename`), cap simétrico `FILE_TOOL_MAX_BYTES` y errores estructurados (`{ ok: false, code, ... }`). `edit_file` (riesgo alto) renderiza un mini-diff unificado en la tarjeta de confirmación. Gate maestro `ALLOW_FILE_TOOLS`. Diseño en [docs/features/file-tools/plan.md](docs/features/file-tools/plan.md)
- **Smoke script de file tools**: `packages/agent/scripts/smoke-file-tools.ts` que ejercita paths absolutos/relativos, sandbox, symlinks fuera del root, `FILE_ALREADY_EXISTS`, match único/no-encontrado/duplicado y hints de CRLF/BOM
- **Bash tool**: nueva tool `bash` (riesgo alto, HITL automático) que ejecuta `bash -lc` como subproceso sin estado persistente entre llamadas, con `cwd` opcional, timeout y truncado de stdout/stderr (`packages/agent/src/tools/bash-exec.ts`). Gate de entorno `ALLOW_BASH_TOOL` — sin la variable la tool no se registra en `buildLangChainTools`. Diseño en [docs/features/bash-tool/plan.md](docs/features/bash-tool/plan.md)
- **Google Calendar integration**: flujo OAuth completo (`/api/auth/google/start|callback|disconnect`) con `access_type=offline + prompt=consent` para refresh token. Diseño en [docs/features/calendar/README.md](docs/features/calendar/README.md) y plan en [docs/features/calendar/brief.md](docs/features/calendar/brief.md)
- **Google Calendar tools**: `gcal_list_events`, `gcal_get_event`, `gcal_create_event`, `gcal_update_event`, `gcal_delete_event` con cliente REST mínimo (`packages/agent/src/integrations/google-calendar.ts`). Soporta eventos recurrentes (RRULE de RFC 5545) y scope `instance | series` para modificación/eliminación
- **Refresh token lifecycle**: `ensureFreshGoogleAccessToken` (`apps/web/src/lib/google/access-token.ts`) refresca transparentemente el access token cuando le quedan menos de 60s; ante `invalid_grant` marca la integración como `revoked` para forzar reconexión
- **Migration 00003**: columnas `encrypted_refresh_token` y `access_token_expires_at` en `user_integrations` (no afectan a GitHub)
- **GitHub OAuth integration**: flujo completo de conexión/desconexión de GitHub desde Ajustes (`/api/auth/github/start`, `/api/auth/github/callback`, `/api/auth/github/disconnect`). Diseño en [docs/features/github/README.md](docs/features/github/README.md)
- **GitHub tools**: `github_list_repos`, `github_list_issues`, `github_create_issue`, `github_create_repo` con cliente REST mínimo (`packages/agent/src/integrations/github.ts`)
- **Tool confirmation flow**: herramientas de riesgo medio/alto generan `pending_confirmation` en vez de ejecutar; el usuario aprueba/rechaza desde web o Telegram
- **Confirmation API**: endpoint `POST /api/chat/confirm` para aprobar/rechazar tool calls pendientes
- **Telegram confirmations**: botones inline de aprobar/rechazar en el canal de Telegram
- **OAuth token encryption**: cifrado AES-256-GCM de tokens de terceros con `OAUTH_ENCRYPTION_KEY` (`packages/db/src/crypto.ts`)
- **Integrations context**: carga en memoria de tokens descifrados para el runtime del agente (`apps/web/src/lib/agent/integrations-context.ts`)
- **Migration 00002**: `provider_account_id`, `provider_account_login` y `updated_at` en `user_integrations`
- **IntegrationsContext type**: interfaz para tokens runtime-only que no se persisten (`packages/agent/src/types.ts`)

### Changed

- `apps/web/src/lib/supabase/middleware.ts`: `/forgot-password` y `/reset-password` añadidas al array `publicPaths`. Sin esto el middleware redirigía a `/login` al usuario sin sesión que intentara acceder al flujo (descubierto en pruebas: logs mostraban `GET /login` repetidos en vez de `GET /forgot-password`).
- **`loadAgentContext` helper compartido** (`apps/web/src/lib/agent/load-context.ts`) reemplaza la carga manual de profile/tools/integrations duplicada en `chat`, `chat/confirm`, `telegram/webhook` y `scheduled-tasks/tick`. Centraliza también la inyección del preámbulo temporal en el system prompt
- Catálogo de tools: la descripción de `bash` incluye ahora un addendum de **PREFERENCIA** que guía al modelo a elegir `read_file`/`write_file`/`edit_file` antes que `bash cat`/`echo >`/`sed -i` cuando aplica
- UI de tools: `read_file`, `write_file`, `edit_file` y `bash` registrados en `TOOL_IDS` de `settings-form.tsx`; las file tools también añadidas al `AVAILABLE_TOOLS` del wizard de onboarding (`step-tools.tsx`). `bash` se mantiene fuera del onboarding por defecto por su riesgo
- `IntegrationsContext`: nuevo campo `google?: { accessToken, email?, timeZone? }` (`packages/agent/src/types.ts`)
- `loadIntegrationsContext()`: ahora también carga la integración Google (con refresh transparente del access token) y propaga la zona horaria del perfil del usuario
- `upsertIntegration()`: parámetros opcionales `refreshToken` y `accessTokenExpiresAt` para providers con refresh flow
- Settings page: nuevo panel para conectar/desconectar Google además de GitHub; las 5 tools de Calendar se incorporan al toggleable de herramientas
- `runAgent()` ahora recibe `integrationsContext` con tokens descifrados en memoria
- `buildLangChainTools()` filtra tools por integración activa y disponibilidad de token
- Graph de LangGraph: nueva arista condicional `shouldContinueAfterTools` que detiene el grafo si hay confirmación pendiente
- Chat interface: soporte para mostrar prompts de confirmación y procesarlos
- Settings page: sección de integraciones con conexión/desconexión de GitHub
- Telegram webhook: soporte para callback queries de confirmación

## [0.1.0] — Initial scaffold

### Added

- Initial project setup with Turborepo monorepo structure
- Workspace configuration for `apps/*` and `packages/*`
- `apps/web` — Next.js with App Router, Tailwind, Supabase Auth
- `packages/agent` — LangGraph JS runtime with tool catalog and adapters
- `packages/db` — Supabase client with typed queries (profiles, sessions, messages, tools, integrations, telegram, tool-calls)
- `packages/types` — Shared TypeScript interfaces
- `packages/config` — Shared tsconfig
- Migration `00001_initial_schema.sql` with RLS
- Login, signup, onboarding wizard (profile → agent → tools → review)
- Chat interface with message persistence
- Settings page (edit profile, agent, tools, link Telegram)
- Telegram bot: webhook, `/start`, `/link CODE`, session management
- Internal tools: `get_user_preferences`, `list_enabled_tools`
- Build, dev, lint, and type-check scripts
- Project documentation (`README.md`, `docs/plan.md`, `docs/architecture.md`, `docs/brief.md`)
- MIT License
