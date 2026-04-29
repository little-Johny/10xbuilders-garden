# Plan de Implementación — Agente Personal MVP

Construir un agente que permita a un usuario **gestionar tareas y ejecutar acciones útiles** desde chat: consultar calendario y correo, buscar documentos, disparar workflows internos, operar GitHub en casos acotados. El sistema debe priorizar **control, trazabilidad, seguridad y costos predecibles** por encima de "autonomía máxima".

## Fases y estado

### Fase 1: Fundaciones ✅

- [x] Monorepo Turborepo con npm workspaces
- [x] `apps/web` — Next.js con App Router + Tailwind
- [x] `packages/agent` — LangGraph JS + tools
- [x] `packages/db` — cliente Supabase + queries tipadas
- [x] `packages/types` — interfaces compartidas
- [x] `packages/config` — tsconfig compartido
- [x] `.env.example` con variables necesarias
- [x] Migración SQL con RLS (`00001_initial_schema.sql`)

### Fase 2: Core agente ✅

- [x] Grafo LangGraph: `agent → tools → agent` con máx 6 iteraciones
- [x] Modelo vía OpenRouter (ChatOpenAI con baseURL)
- [x] Catálogo de tools con risk levels
- [x] Adapters LangChain `tool()` con policy (allowlist + integración)
- [x] Persistencia de mensajes en `agent_messages`
- [x] API route `/api/chat` que orquesta todo

### Fase 3: Onboarding y UI ✅

- [x] Login y signup con Supabase Auth
- [x] Middleware de protección de rutas
- [x] Wizard onboarding multi-paso (perfil → agente → tools → revisión)
- [x] Página de chat con interfaz de mensajes
- [x] Página de ajustes (editar perfil, agente, tools, vincular Telegram)
- [x] Redirect inteligente: `/` → `/onboarding` (si no completado) → `/chat`

### Fase 4: Tools con confirmación ✅

- [x] Tools internas: `get_user_preferences`, `list_enabled_tools`
- [x] Tools GitHub: `github_list_repos`, `github_list_issues`, `github_create_issue`, `github_create_repo`
- [x] `github_create_issue` con riesgo "medium" → genera `pending_confirmation`
- [x] Tabla `tool_calls` para tracking de estado
- [x] `ConfirmationRequiredError` para short-circuit del grafo
- [x] Endpoint `/api/chat/confirm` para aprobar/rechazar
- [x] `executeApprovedToolCall()` para ejecutar tras aprobación

### Fase 5: Telegram ✅

- [x] Webhook en `/api/telegram/webhook`
- [x] Comando `/start` con instrucciones
- [x] Comando `/link CODE` para vincular cuenta
- [x] Tabla `telegram_link_codes` con expiración
- [x] Mismo `runAgent()` que web
- [x] Confirmaciones con botones inline (aprobar/rechazar)
- [x] Setup endpoint `/api/telegram/setup` para registrar webhook

### Fase 6: GitHub OAuth ✅

Diseño detallado en [github-integration.md](github-integration.md).

- [x] GitHub OAuth App: flujo authorize → callback → token exchange
- [x] Cifrado AES-256-GCM de access tokens (`packages/db/src/crypto.ts`)
- [x] Migración `00002_github_integration.sql` (metadata de proveedor)
- [x] Endpoints: `/api/auth/github/start`, `/api/auth/github/callback`, `/api/auth/github/disconnect`
- [x] Cliente REST mínimo de GitHub (`packages/agent/src/integrations/github.ts`)
- [x] `IntegrationsContext`: carga de tokens en memoria para el runtime
- [x] UI de conexión/desconexión en Ajustes
- [x] Filtrado de tools por integración activa + token disponible

### Fase 7: Documentación ✅

- [x] `docs/architecture.md` — arquitectura técnica viva
- [x] `docs/plan.md` — este archivo
- [x] `docs/brief.md` — visión y brief original
- [x] `docs/github-integration.md` — diseño de la integración de GitHub
- [x] `CHANGELOG.md`

### Fase 8: Google Calendar OAuth ✅

Diseño detallado en [calendar-integration.md](calendar-integration.md). Plan operativo en [calendar-integration-brief.md](calendar-integration-brief.md).

- [x] OAuth Client en Google Cloud Console: flujo authorize → callback → token exchange con `access_type=offline` + `prompt=consent`
- [x] Migración `00003_google_integration.sql` (`encrypted_refresh_token`, `access_token_expires_at`)
- [x] Endpoints: `/api/auth/google/start`, `/api/auth/google/callback`, `/api/auth/google/disconnect`
- [x] Cliente REST mínimo de Google Calendar (`packages/agent/src/integrations/google-calendar.ts`)
- [x] Refresh automático del access token con `ensureFreshGoogleAccessToken` (`apps/web/src/lib/google/access-token.ts`); marca como `revoked` ante `invalid_grant`
- [x] Tools: `gcal_list_events`, `gcal_get_event`, `gcal_create_event`, `gcal_update_event`, `gcal_delete_event`
- [x] Eventos recurrentes con esquema de alto nivel traducido a `RRULE` (RFC 5545)
- [x] Scope `instance | series` para modificar/eliminar series, mostrado explícitamente en el card de confirmación
- [x] Detección de conflictos en las primeras 8 semanas antes de crear una serie
- [x] `IntegrationsContext.google` con email + zona horaria del perfil del usuario
- [x] UI de conexión/desconexión en Ajustes con email vinculado y scopes
