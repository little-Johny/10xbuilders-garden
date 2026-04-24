# apps/web — Aplicación web del Agente Personal

Aplicación **Next.js (App Router)** que sirve como interfaz principal del agente y gateway de API para todos los canales (web, Telegram).

## Rutas de la aplicación

| Ruta | Tipo | Descripción |
|------|------|-------------|
| `/` | Page | Redirect inteligente → onboarding o chat |
| `/login` | Page | Inicio de sesión con email |
| `/signup` | Page | Registro de cuenta |
| `/onboarding` | Page | Wizard multi-paso (perfil → agente → tools → revisión) |
| `/chat` | Page | Interfaz de chat con el agente |
| `/settings` | Page | Ajustes de perfil, agente, herramientas e integraciones |

## API Routes

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/chat` | POST | Envía mensaje al agente (`runAgent`) |
| `/api/chat/confirm` | POST | Aprueba o rechaza un tool call pendiente |
| `/api/auth/signout` | POST | Cierra sesión |
| `/api/auth/github/start` | GET | Inicia flujo OAuth de GitHub |
| `/api/auth/github/callback` | GET | Callback de GitHub OAuth (intercambia código por token) |
| `/api/auth/github/disconnect` | POST | Desconecta integración de GitHub |
| `/api/telegram/webhook` | POST | Recibe eventos del bot de Telegram |
| `/api/telegram/setup` | GET | Registra el webhook en Telegram |

## Estructura de `src/`

```
src/
├── app/                     # App Router pages + API routes
├── lib/
│   ├── agent/
│   │   └── integrations-context.ts   # Carga tokens descifrados en memoria
│   ├── github/
│   │   └── oauth.ts                  # Helpers para el flujo OAuth de GitHub
│   └── supabase/
│       ├── server.ts                 # Cliente Supabase para RSC/API
│       └── middleware.ts             # Helper de auth para middleware
└── middleware.ts             # Auth guard global
```

## Desarrollo

La app se ejecuta desde la raíz del monorepo:

```bash
npm run dev
```

La app queda en **http://localhost:3000**. Las variables de entorno se leen de `apps/web/.env.local` (ver [README del proyecto](../../README.md) para la lista completa).
