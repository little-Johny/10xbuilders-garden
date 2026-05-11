# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Scheduled tasks**: el agente puede crear tareas recurrentes que se ejecutan automáticamente. Tools `create_scheduled_task` (medium, HITL), `list_scheduled_tasks` (low), `update_scheduled_task` (medium, HITL — pausa/reanuda sin eliminar) y `delete_scheduled_task` (high, HITL). Disparador: `pg_cron` + `pg_net` llamando cada minuto al endpoint `POST /api/scheduled-tasks/tick` (auth via `CRON_SECRET`). Cada disparo crea una `agent_session(channel='scheduled')` aislada y notifica por los canales configurados. Flag `autonomous` por tarea para saltarse HITL en disparos confiables. Persistencia en tabla `scheduled_tasks` (migration `00005`). Gate maestro `ALLOW_SCHEDULED_TASKS_TOOL`. Diseño en [docs/scheduled-tasks-plan.md](docs/scheduled-tasks-plan.md), guía de uso/operación en [docs/scheduled-tasks.md](docs/scheduled-tasks.md)
- **Notifications module** (`packages/agent/src/notifications/`): registry abstraído `NotificationChannelAdapter` con adapter Telegram MVP. `dispatchNotification(channels, userId, db, payload)` itera y aísla fallos por canal. Añadir nuevos canales (email, web push) requiere solo un adapter nuevo y entry en el registry
- **Temporal preamble**: `loadAgentContext` (`apps/web/src/lib/agent/load-context.ts`) antepone al system prompt un bloque con fecha/hora/TZ del perfil para que el modelo resuelva correctamente expresiones relativas («mañana», «cada lunes a las 9am»). Aplica a los 3 canales (web, telegram, scheduled); en `scheduled` el preámbulo refleja el momento del disparo, no la creación
- **`autonomous` flag en `runAgent`**: input opcional que salta HITL para tools medium/high. Cuando está activo, el grafo crea un `tool_calls` con `status='approved'` antes de ejecutar para mantener auditoría completa
- **Migration 00005**: tabla `scheduled_tasks` con RLS estándar, índice parcial `scheduled_tasks_due_idx` y extensión del check de `agent_sessions.channel` para incluir `'scheduled'`
- **File tools**: `read_file`, `write_file` y `edit_file` (`packages/agent/src/tools/file-ops.ts`) con sandbox opcional vía `FILE_TOOLS_WORKSPACE_ROOT`, `realpath` anti-symlink, escritura atómica (tempfile + `fs.rename`), cap simétrico `FILE_TOOL_MAX_BYTES` y errores estructurados (`{ ok: false, code, ... }`). `edit_file` (riesgo alto) renderiza un mini-diff unificado en la tarjeta de confirmación. Gate maestro `ALLOW_FILE_TOOLS`. Diseño en [docs/file_tools_plan.md](docs/file_tools_plan.md)
- **Smoke script de file tools**: `packages/agent/scripts/smoke-file-tools.ts` que ejercita paths absolutos/relativos, sandbox, symlinks fuera del root, `FILE_ALREADY_EXISTS`, match único/no-encontrado/duplicado y hints de CRLF/BOM
- **Bash tool**: nueva tool `bash` (riesgo alto, HITL automático) que ejecuta `bash -lc` como subproceso sin estado persistente entre llamadas, con `cwd` opcional, timeout y truncado de stdout/stderr (`packages/agent/src/tools/bash-exec.ts`). Gate de entorno `ALLOW_BASH_TOOL` — sin la variable la tool no se registra en `buildLangChainTools`. Diseño en [docs/bash-tool-plan.md](docs/bash-tool-plan.md)
- **Google Calendar integration**: flujo OAuth completo (`/api/auth/google/start|callback|disconnect`) con `access_type=offline + prompt=consent` para refresh token. Diseño en [docs/calendar-integration.md](docs/calendar-integration.md) y plan en [docs/calendar-integration-brief.md](docs/calendar-integration-brief.md)
- **Google Calendar tools**: `gcal_list_events`, `gcal_get_event`, `gcal_create_event`, `gcal_update_event`, `gcal_delete_event` con cliente REST mínimo (`packages/agent/src/integrations/google-calendar.ts`). Soporta eventos recurrentes (RRULE de RFC 5545) y scope `instance | series` para modificación/eliminación
- **Refresh token lifecycle**: `ensureFreshGoogleAccessToken` (`apps/web/src/lib/google/access-token.ts`) refresca transparentemente el access token cuando le quedan menos de 60s; ante `invalid_grant` marca la integración como `revoked` para forzar reconexión
- **Migration 00003**: columnas `encrypted_refresh_token` y `access_token_expires_at` en `user_integrations` (no afectan a GitHub)
- **GitHub OAuth integration**: flujo completo de conexión/desconexión de GitHub desde Ajustes (`/api/auth/github/start`, `/api/auth/github/callback`, `/api/auth/github/disconnect`). Diseño en [docs/github-integration.md](docs/github-integration.md)
- **GitHub tools**: `github_list_repos`, `github_list_issues`, `github_create_issue`, `github_create_repo` con cliente REST mínimo (`packages/agent/src/integrations/github.ts`)
- **Tool confirmation flow**: herramientas de riesgo medio/alto generan `pending_confirmation` en vez de ejecutar; el usuario aprueba/rechaza desde web o Telegram
- **Confirmation API**: endpoint `POST /api/chat/confirm` para aprobar/rechazar tool calls pendientes
- **Telegram confirmations**: botones inline de aprobar/rechazar en el canal de Telegram
- **OAuth token encryption**: cifrado AES-256-GCM de tokens de terceros con `OAUTH_ENCRYPTION_KEY` (`packages/db/src/crypto.ts`)
- **Integrations context**: carga en memoria de tokens descifrados para el runtime del agente (`apps/web/src/lib/agent/integrations-context.ts`)
- **Migration 00002**: `provider_account_id`, `provider_account_login` y `updated_at` en `user_integrations`
- **IntegrationsContext type**: interfaz para tokens runtime-only que no se persisten (`packages/agent/src/types.ts`)

### Changed

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
