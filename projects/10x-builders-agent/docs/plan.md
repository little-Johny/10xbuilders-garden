# Plan de Implementación — Agente Personal MVP

Construir un agente que permita a un usuario **gestionar tareas y ejecutar acciones útiles** desde chat: consultar calendario y correo, buscar documentos, disparar workflows internos, operar GitHub en casos acotados. El sistema debe priorizar **control, trazabilidad, seguridad y costos predecibles** por encima de “autonomía máxima”.

## Fases y estado

### Fase 1: Fundaciones

- '[ ]' Monorepo Turborepo con npm workspaces
- '[ ]' `apps/web` — Next.js con App Router + Tailwind
- '[ ]' `packages/agent` — LangGraph JS + tools
- '[ ]' `packages/db` — cliente Supabase + queries tipadas
- '[ ]' `packages/types` — interfaces compartidas
- '[ ]' `packages/config` — tsconfig compartido
- '[ ]' `.env.example` con variables necesarias
- '[ ]' Migración SQL con RLS (`00001_initial_schema.sql`)

### Fase 2: Core agente

- '[ ]' Grafo LangGraph: `agent → tools → agent` con máx 6 iteraciones
- '[ ]' Modelo vía OpenRouter (ChatOpenAI con baseURL)
- '[ ]' Catálogo de tools con risk levels
- '[ ]' Adapters LangChain `tool()` con policy (allowlist + integración)
- '[ ]' Persistencia de mensajes en `agent_messages`
- '[ ]' API route `/api/chat` que orquesta todo

### Fase 3: Onboarding y UI

- '[ ]' Login y signup con Supabase Auth
- '[ ]' Middleware de protección de rutas
- '[ ]' Wizard onboarding multi-paso (perfil → agente → tools → revisión)
- '[ ]' Página de chat con interfaz de mensajes
- '[ ]' Página de ajustes (editar perfil, agente, tools, vincular Telegram)
- '[ ]' Redirect inteligente: `/` → `/onboarding` (si no completado) → `/chat`

### Fase 4: Tools con confirmación

- '[ ]' Tools internas: `get_user_preferences`, `list_enabled_tools`
- '[ ]' Tools GitHub (stub): `github_list_repos`, `github_list_issues`, `github_create_issue, github_create_repo`
- '[ ]' `github_create_issue` con riesgo "medium" → genera `pending_confirmation`
- '[ ]' Tabla `tool_calls` para tracking de estado

### Fase 5: Telegram

- '[ ]' Webhook en `/api/telegram/webhook`
- '[ ]' Comando `/start` con instrucciones
- '[ ]' Comando `/link CODE` para vincular cuenta
- '[ ]' Tabla `telegram_link_codes` con expiración
- '[ ]' Mismo `runAgent()` que web
- '[ ]' Confirmaciones con botones inline (aprobar/rechazar)
- '[ ]' Setup endpoint `/api/telegram/setup` para registrar webhook

### Fase 6: Documentación

- '[ ]' `docs/architecture.md` — arquitectura técnica viva
- '[ ]' `docs/plan.md`
