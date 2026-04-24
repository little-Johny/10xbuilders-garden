# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

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
