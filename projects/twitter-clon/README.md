# Twitter Clon

Clon funcional de X (Twitter) construido como proyecto de aprendizaje. Permite registrarse, iniciar sesión, publicar tweets, ver un feed global y gestionar un perfil con avatar. El esquema de base de datos incluye también likes, comentarios anidados y sistema de seguimiento (follows), preparados para futuras fases.

## Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Frontend | React 18, Vite 6, Tailwind CSS 3, React Router 7 |
| Backend | Node.js ≥ 18, Express 4 |
| Base de datos | Supabase (PostgreSQL + Auth + Storage) |
| Testing | Jest 29/30, @testing-library/react, Supertest |
| Tooling | concurrently, Supabase CLI |

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

## Instalación y uso

### Requisitos

- Node.js ≥ 18
- [Supabase CLI](https://supabase.com/docs/guides/cli) (para desarrollo local con base de datos)
- Una instancia de Supabase (local o cloud)

### Instalar dependencias

```bash
npm run install:all
```

### Configurar variables de entorno

```bash
cp api/.env.example api/.env
# Edita api/.env con tu SUPABASE_URL y SUPABASE_ANON_KEY
```

### Aplicar migraciones (Supabase local)

```bash
npx supabase start          # levanta Supabase local (Docker)
npx supabase db reset       # aplica todas las migraciones
```

### Levantar el proyecto en desarrollo

```bash
npm run dev
# app  → http://localhost:5173
# api  → http://localhost:3001
```

### Ejecutar tests

```bash
npm test              # app + api
npm run test:app      # solo frontend (Jest + jsdom)
npm run test:api      # solo backend (Jest + Supertest)
```

### Generar tipos TypeScript de Supabase

```bash
SUPABASE_PROJECT_ID=<tu-project-id> npm run supabase:gen
```

## Estructura de carpetas

```
twitter-clon/
├── package.json          # Scripts raíz (dev, test, install:all, supabase:gen)
├── app/                  # Frontend React + Vite + Tailwind
│   ├── src/
│   │   ├── components/   # Componentes reutilizables (App, Avatar, BrandLogo)
│   │   ├── contexts/     # AuthContext — gestión de sesión global
│   │   └── pages/        # Páginas: FeedPage, LoginPage, RegisterPage, ProfilePage
│   └── test/             # Tests Jest (setupTests.js + *.test.jsx)
├── api/                  # Backend Express
│   └── src/
│       ├── routes/       # auth.routes, tweets.routes, profiles.routes
│       ├── services/     # auth.service, tweet.service, profile.service
│       └── lib/          # supabase.js, bearer.js, upload.js, validation.js
├── supabase/
│   ├── config.toml
│   └── migrations/       # SQL versionado: schema inicial + storage de avatares
└── .cursor/              # Reglas, skills y agentes de Cursor AI
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
*Última actualización: 2026-03-26*
