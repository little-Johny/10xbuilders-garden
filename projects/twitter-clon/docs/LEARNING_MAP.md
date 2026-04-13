# Mapa de aprendizaje

Lista de conocimientos necesarios para construir este proyecto desde cero, organizados por nivel de dificultad y conectados con partes concretas del proyecto.

---

## Fundamentos
> Lo básico que se debe dominar antes de empezar a tocar código del proyecto.

- **HTML y CSS** — Base de cualquier interfaz web. Tailwind genera clases utilitarias sobre CSS; sin conocer el modelo de caja y el layout (flexbox, grid), no se puede personalizar la UI.
- **JavaScript moderno (ES2020+)** — El proyecto usa ESModules (`import/export`), `async/await`, destructuring, template literals y el operador de encadenamiento opcional. Necesario tanto en `app/` como en `api/`.
- **Git y control de versiones** — Toda la historia del proyecto vive en git. Las migraciones SQL también se versionan. Conocer `git log`, `git diff`, commits y ramas es imprescindible.
- **npm y gestión de dependencias** — El monorepo tiene tres `package.json` (raíz, `app/`, `api/`). Se deben entender los scripts, `devDependencies` vs `dependencies`, y el ciclo de instalación con `npm run install:all`.
- **Node.js básico** — La API corre en Node.js ≥ 18. Se usa `node --watch` para desarrollo y se necesita comprender el sistema de módulos ESM.

---

## Intermedio
> Las tecnologías específicas del stack del proyecto.

- **React 18** — Toda la interfaz está construida con React. Se usan: componentes funcionales, hooks (`useState`, `useEffect`, `useCallback`, `useContext`), Context API (`AuthContext`) y renderizado condicional. Se debe entender el ciclo de vida de los componentes y cómo gestionar estado global. *Usado en: `app/src/components/`, `app/src/pages/`, `app/src/contexts/`.*
- **React Router 7** — Gestión de rutas del lado del cliente. El proyecto usa `BrowserRouter`, `Routes`, `Route`, `Navigate`, `useParams` y `useNavigate`. *Usado en: `App.jsx`, `ProfilePage.jsx`.*
- **Vite 6** — Bundler y servidor de desarrollo. El punto clave es la configuración del **proxy**: `/api/*` → `http://localhost:3001`, que permite desacoplar frontend y backend en desarrollo. *Usado en: `app/vite.config.js`.*
- **Tailwind CSS 3** — Framework de utilidades CSS. Se usa para todo el estilado de la UI. Se deben conocer las clases de layout, tipografía, colores, responsividad y estados (hover, focus). *Usado en: todos los componentes y páginas de `app/src/`.*
- **Express 4** — Framework HTTP para Node.js. El proyecto usa: `Router`, middlewares (`cors`, `express.json`), gestión de rutas RESTful y separación en capas (routes → services → lib). *Usado en: todo `api/src/`.*
- **Supabase (Auth + Database + Storage)** — BaaS que provee autenticación, base de datos PostgreSQL y almacenamiento de archivos. Se usa **exclusivamente desde el backend** (`api/src/lib/supabase.js`). Se deben entender: el cliente `@supabase/supabase-js`, las operaciones de Auth (`signUp`, `signInWithPassword`), las queries a tablas (`from().select()`, `from().insert()`, `from().update()`), el uso de JWT del usuario para operaciones con RLS, y la API de Storage. *Usado en: `api/src/lib/supabase.js`, `api/src/services/`.*
- **PostgreSQL básico** — La base de datos es PostgreSQL gestionada por Supabase. Se deben conocer: tipos de datos, claves primarias y foráneas, índices, constraints (`CHECK`, `UNIQUE`) y triggers. *Usado en: `supabase/migrations/`.*
- **Row Level Security (RLS)** — Mecanismo de PostgreSQL/Supabase para restringir el acceso a filas según el usuario autenticado (`auth.uid()`). Todas las tablas del proyecto usan RLS. *Usado en: `supabase/migrations/20260322234105_initial_schema.sql`.*
- **Supabase Storage** — Sistema de almacenamiento de archivos (bucket `avatars`). La subida se hace desde el backend con `multer` (multipart parsing) y el SDK de Supabase. *Usado en: `api/src/lib/upload.js`, `api/src/services/profile.service.js`, `supabase/migrations/20260326183505_avatars_storage.sql`.*
- **JWT y autenticación por token** — La sesión del usuario es un JWT emitido por Supabase Auth. El frontend lo almacena en `localStorage` y lo envía como `Authorization: Bearer <token>` en cada petición protegida. El backend extrae el token con `getBearerToken()` y se lo pasa a Supabase para actuar como ese usuario (respetando RLS). *Usado en: `api/src/lib/bearer.js`, `app/src/contexts/AuthContext.jsx`.*

---

## Avanzado
> Patrones y decisiones de arquitectura aplicadas en el proyecto.

- **Arquitectura desacoplada frontend/backend** — El frontend es un cliente HTTP puro; nunca importa `@supabase/supabase-js`. Toda la lógica de datos vive en `api/`. Esto permite cambiar el backend sin tocar el frontend, testear ambas capas de forma independiente y evitar exponer credenciales de Supabase al navegador. *Aplicado en: toda la estructura del monorepo.*
- **Patrón de capas en la API (Routes → Services → Lib)** — Las rutas solo manejan HTTP (request/response). Los services contienen la lógica de negocio. Los módulos en `lib/` son utilidades reutilizables (cliente Supabase, extracción de token, validaciones, multer). Este patrón facilita los tests unitarios y el mantenimiento. *Aplicado en: `api/src/routes/`, `api/src/services/`, `api/src/lib/`.*
- **Context API para estado global de sesión** — `AuthContext` encapsula el ciclo completo de autenticación: carga desde `localStorage` al montar, login, register, logout y actualización de perfil. Todos los componentes consumen el contexto con `useAuth()`, evitando prop drilling. *Aplicado en: `app/src/contexts/AuthContext.jsx`.*
- **Migraciones SQL versionadas** — Los cambios de esquema se aplican mediante archivos `.sql` en `supabase/migrations/`, nombrados con timestamp. Esto garantiza que el estado de la base de datos sea reproducible en cualquier entorno con `supabase db reset`. *Aplicado en: `supabase/migrations/`.*
- **TDD (Test-Driven Development)** — Los tests se escriben antes o junto al código. Los tests del frontend viven en `app/test/` (separados de `src/`) y usan `@testing-library/react` para interactuar con los componentes tal como lo haría un usuario. Los tests de la API usan `supertest` para probar los endpoints HTTP. *Aplicado en: `app/test/*.test.jsx`, `api/src/app.test.js`.*
- **Proxy Vite como desacoplamiento de entorno** — En desarrollo, Vite reescribe `/api/*` → `http://localhost:3001` transparentemente. En producción, el mismo patrón se puede implementar con un reverse proxy (nginx, Caddy) o desplegando la API en un dominio separado y configurando CORS. El frontend no necesita saber la URL real del backend. *Aplicado en: `app/vite.config.js`.*
- **Comentarios anidados (árbol de hilos)** — La tabla `comments` incluye `parent_comment_id` (auto-referencial) con un trigger que valida que el comentario padre pertenezca al mismo tweet. Este patrón es la base para sistemas de respuestas tipo Reddit o Twitter. *Aplicado en: `supabase/migrations/20260322234105_initial_schema.sql`, `api/src/services/comment.service.js`, `app/src/components/CommentCard.jsx`.*
- **Toggle idempotente con unique constraint** — Los likes (tanto de tweets como de comentarios) usan un patrón de toggle: se intenta un `INSERT`; si viola la constraint `UNIQUE` (código PostgreSQL `23505`), se ejecuta un `DELETE`. Esto evita endpoints separados de like/unlike y garantiza idempotencia. *Aplicado en: `api/src/services/tweetLike.service.js`, `api/src/services/commentLike.service.js`.*
- **Rutas anidadas en Express con `mergeParams`** — Los comentarios están montados como sub-router bajo `/tweets/:tweetId/comments` usando `Router({ mergeParams: true })`, lo que permite acceder a `:tweetId` desde las rutas hijas sin duplicar lógica de extracción de parámetros. *Aplicado en: `api/src/routes/tweets.routes.js`, `api/src/routes/comments.routes.js`.*
- **Extracción de componentes para reutilización** — `TweetCard` se extrajo de `FeedPage` y `ProfilePage` en un componente independiente que encapsula la presentación de un tweet (contenido, autor, likes, comentarios). Elimina duplicación y facilita mantener una UI consistente. *Aplicado en: `app/src/components/TweetCard.jsx`, `app/src/pages/FeedPage.jsx`, `app/src/pages/ProfilePage.jsx`.*

---
*Última actualización: 2026-04-12*
