# Twitter Clon

Clon funcional de X (Twitter) construido como proyecto de aprendizaje. Permite registrarse, iniciar sesión, publicar tweets, ver un feed global y gestionar un perfil con avatar. El esquema de base de datos incluye también likes, comentarios anidados y sistema de seguimiento (follows), preparados para futuras fases.

## Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Frontend | React 18, Vite 6, Tailwind CSS 3, React Router 7 |
| Backend | Node.js ≥ 18, Express 4 |
| Base de datos | Supabase (PostgreSQL + Auth + Storage) |
| Testing | Jest 29/30, @testing-library/react, Supertest |
| Tooling | concurrently, Supabase CLI (`npx`), MCP de Supabase local (Cursor + `.cursor/mcp.json`), opcionalmente **agent-browser** (QA / automatización) |

## Herramientas y dependencias a instalar

Resumen de lo que necesitás en la máquina **antes** o **junto** al desarrollo. La columna **¿Obligatorio?** indica qué hace falta como mínimo para correr app + API + Supabase local (el resto es opcional).

| Herramienta | ¿Obligatorio? | Rol |
|-------------|---------------|-----|
| **Node.js** ≥ 18 y **npm** | Sí | Ejecutar el monorepo (`app/`, `api/`, scripts raíz). |
| **Docker Desktop** (o motor Docker compatible) | Sí para Supabase local | La CLI de Supabase levanta PostgreSQL, Auth, Storage, etc. en contenedores (`supabase start`). |
| **Supabase CLI** | Sí | Migraciones, `db reset`, tipos generados. En este repo podés usar **`npx supabase`** tras `npm install` en la raíz (queda como devDependency) o instalar global (Homebrew / `npm -g`). |
| **Cursor** (u otro editor con MCP) | No para correr la app | Solo si querés que el agente use el **MCP** definido en [`.cursor/mcp.json`](.cursor/mcp.json) contra la base local. |
| **MCP Inspector** (`@modelcontextprotocol/inspector`) | No | Depurar el servidor MCP: `npx @modelcontextprotocol/inspector`. |
| **agent-browser** | No | Automatización de navegador (CLI) para QA o el skill `executing-browser`; el agente `qa-engineer` lo usa para pruebas en el browser. Instalación típica: `npm install -g agent-browser` luego `agent-browser install` (Chrome for Testing). En Linux, si fallan deps del sistema, existe [`scripts/fix-agent-browser-system-deps.sh`](scripts/fix-agent-browser-system-deps.sh). |

**Notas:**

- **MCP de Supabase local:** no instalás un paquete extra en el proyecto: Cursor lee `.cursor/mcp.json`. Sí tenés que tener **Supabase local en marcha** (`npx supabase start`), porque el endpoint MCP es `http://localhost:54321/mcp`.
- **Tests unitarios** (Jest) no requieren Docker ni agent-browser; **npm** alcanza.

## Arquitectura

El proyecto es un **monorepo** con dos workspaces desacoplados:

- **`app/`** — Frontend React/Vite. **No importa `@supabase/supabase-js` en ningún caso.** Toda comunicación con datos pasa por llamadas `fetch` al prefijo `/api`, que Vite redirige al backend durante el desarrollo.
- **`api/`** — Backend Express. Es la única capa que conoce Supabase; centraliza autenticación, lógica de negocio y acceso a la base de datos.

```
Browser → React (Vite :5173)
             │  fetch /api/*
             ▼
         Express (Node :3001)
             │  @supabase/supabase-js
             ▼
         Supabase (PostgreSQL + Auth + Storage)
```

La sesión del usuario se almacena en `localStorage` (`tc_session`) y se propaga a toda la app mediante `AuthContext`.

## Setup inicial (primera vez)

Seguí este orden la primera vez que clonás el repo (o en una máquina nueva):

1. **Instalar prerrequisitos de sistema** según la tabla [Herramientas y dependencias a instalar](#herramientas-y-dependencias-a-instalar): Node ≥ 18, Docker, y (opcional) agent-browser o Cursor para MCP/QA.
2. **Instalar dependencias npm** del monorepo (raíz + `app/` + `api/`):

   ```bash
   npm run install:all
   ```

3. **Variables de entorno del API.** Copiá el ejemplo y completá URL y claves de Supabase (local o cloud):

   ```bash
   cp api/.env.example api/.env
   ```

   Para **Supabase local**, tras el paso 4 podés obtener `SUPABASE_URL` y `SUPABASE_ANON_KEY` con `npx supabase status` (o `supabase status` si la CLI está en el PATH). Opcional: `SUPABASE_SERVICE_ROLE_KEY` para operaciones administrativas.

4. **Levantar Supabase local y aplicar el esquema** (requiere Docker en ejecución):

   ```bash
   npx supabase start          # o: supabase start
   npx supabase db reset       # o: supabase db reset — aplica migraciones en supabase/migrations/
   ```

5. **Completar `api/.env`** si aún no lo hiciste (valores del `status` del paso anterior para entorno local).

6. **Arrancar desarrollo** (Vite + Express):

   ```bash
   npm run dev
   ```

   - App: http://localhost:5173  
   - API: http://localhost:3001  

**Opcional después del setup:** instalar **agent-browser** y ejecutar `agent-browser install` si vas a usar QA en navegador o el skill `executing-browser`. Activar el MCP en Cursor no requiere paquetes extra; con Supabase local arriba, [`.cursor/mcp.json`](.cursor/mcp.json) ya apunta a `http://localhost:54321/mcp`.

**Solo Supabase en la nube (sin Docker):** no hace falta el paso 4 con `supabase start`. Completá `api/.env` con `SUPABASE_URL` y `SUPABASE_ANON_KEY` del [panel del proyecto](https://supabase.com/dashboard) y aplicá el esquema remoto (por ejemplo vinculando el proyecto con la CLI: `supabase link` y `supabase db push`, u otro flujo que uses). El MCP local de este README no aplica hasta que tengas un stack en `localhost:54321`.

## Instalación y uso (referencia rápida)

### Supabase CLI (tres formas; elegí una)

| Modo | Cómo | Notas |
|------|------|--------|
| **`npx` desde el repo** | Tras `npm install` en la raíz: `npx supabase <comando>` | Misma versión en cualquier máquina; no hace falta instalar la CLI global. |
| **Homebrew (macOS)** | `brew install supabase/tap/supabase` | [Docs](https://supabase.com/docs/guides/cli/getting-started#installing-the-supabase-cli) — podés usar `supabase` sin `npx`. |
| **npm global** | `npm install -g supabase` | Expone `supabase` en el PATH. |

En **Linux** también podés seguir los [métodos oficiales](https://supabase.com/docs/guides/cli/getting-started#linux). Si tenés `supabase` en el PATH, los comandos de este README con `npx supabase …` equivalen a `supabase …`.

### MCP (Cursor) y MCP Inspector

- El servidor MCP está en [`.cursor/mcp.json`](.cursor/mcp.json) → `http://localhost:54321/mcp` (solo con **Supabase local** levantado).
- Depuración: `npx @modelcontextprotocol/inspector`.

### Comandos útiles

**Solo dependencias** (si ya clonaste y solo querés reinstalar):

```bash
npm run install:all
```

**Tests:**

```bash
npm test              # app + api
npm run test:app      # solo frontend (Jest + jsdom)
npm run test:api      # solo backend (Jest + Supertest)
```

**Tipos TypeScript desde un proyecto Supabase en la nube:**

```bash
SUPABASE_PROJECT_ID=<tu-project-id> npm run supabase:gen
```

## Estructura de carpetas

```
twitter-clon/
├── package.json          # Scripts raíz (dev, test, install:all, supabase:gen)
├── app/                  # Frontend React + Vite + Tailwind
│   ├── src/
│   │   ├── components/   # Componentes reutilizables (App, Avatar, BrandLogo, TweetCard, CommentCard, CommentSection)
│   │   ├── contexts/     # AuthContext — gestión de sesión global
│   │   └── pages/        # Páginas: FeedPage, LoginPage, RegisterPage, ProfilePage
│   └── test/             # Tests Jest (setupTests.js + *.test.jsx)
├── api/                  # Backend Express
│   └── src/
│       ├── routes/       # auth.routes, tweets.routes, profiles.routes, comments.routes
│       ├── services/     # auth.service, tweet.service, tweetLike.service, profile.service, comment.service, commentLike.service
│       └── lib/          # supabase.js, bearer.js, upload.js, validation.js
├── supabase/
│   ├── config.toml
│   └── migrations/       # SQL versionado: schema inicial + storage de avatares
└── .cursor/              # Reglas, skills, agentes y mcp.json (MCP → Supabase local)
```

## Rutas disponibles

### Frontend

| Ruta | Página |
|------|--------|
| `/` | Feed global de tweets |
| `/login` | Inicio de sesión |
| `/register` | Registro de cuenta |
| `/profile/:username` | Perfil de usuario |

### API

| Método | Endpoint | Auth | Descripción |
|--------|----------|------|-------------|
| `POST` | `/auth/register` | — | Registro con email, contraseña y username |
| `POST` | `/auth/login` | — | Login; devuelve sesión con tokens |
| `GET` | `/tweets` | — | Lista pública de todos los tweets |
| `POST` | `/tweets` | Bearer | Crear un tweet |
| `POST` | `/tweets/:tweetId/like` | Bearer | Toggle like en un tweet |
| `GET` | `/tweets/:tweetId/comments` | — | Lista de comentarios de un tweet |
| `POST` | `/tweets/:tweetId/comments` | Bearer | Crear un comentario en un tweet |
| `POST` | `/tweets/:tweetId/comments/:commentId/like` | Bearer | Toggle like en un comentario |
| `GET` | `/profiles/me` | Bearer | Perfil propio |
| `PATCH` | `/profiles/me` | Bearer | Actualizar bio/display_name |
| `POST` | `/profiles/me/avatar` | Bearer | Subir avatar (multipart/form-data) |
| `GET` | `/profiles/:username` | — | Perfil público por username |

## Esquema de base de datos

| Tabla | Descripción |
|-------|-------------|
| `profiles` | Perfil vinculado a `auth.users`; username único lowercase |
| `tweets` | Publicaciones (máx. 280 caracteres) |
| `tweet_likes` | Likes de tweets (PK compuesta user+tweet) |
| `comments` | Comentarios con soporte a hilos (`parent_comment_id`) |
| `comment_likes` | Likes de comentarios |
| `follows` | Relaciones de seguimiento entre perfiles |

Todas las tablas tienen **Row Level Security (RLS)** activado: lectura pública del contenido, escritura restringida al usuario autenticado dueño del recurso.

El bucket de Storage `avatars` es público en lectura; cada usuario solo puede gestionar su propio archivo (`<user_id>.*`).

## Documentación adicional

- [Timeline del proyecto](docs/TIMELINE.md)
- [Mapa de aprendizaje](docs/LEARNING_MAP.md)

---
*Última actualización: 2026-04-12*
