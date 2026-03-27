# Timeline del proyecto

Historial cronológico derivado del repositorio git, agrupado por fases o features.

| Fechas | Fase / Feature | Descripción y decisiones técnicas |
|--------|---------------|-----------------------------------|
| 2026-03-19 | **Fase 0 — Scaffold inicial** | Creación del monorepo `twitter-clon/`. Se estructura el workspace con `app/` (React + Vite) y `api/` (Express). Se establece la arquitectura desacoplada: el frontend nunca accede a Supabase directamente. Se configuran reglas y skills de Cursor AI para el flujo de trabajo del proyecto. |
| 2026-03-22 | **Fase 1 — Integración Supabase y esquema inicial** | Se integra `@supabase/supabase-js` exclusivamente en `api/`. Se crea la primera migración SQL (`20260322234105_initial_schema.sql`) con las tablas: `profiles`, `tweets`, `tweet_likes`, `comments` (con soporte a hilos), `comment_likes` y `follows`. Se habilita RLS en todas las tablas con políticas de lectura pública y escritura restringida al propietario. Se añaden skills de inspección y modificación de base de datos. |
| 2026-03-24 | **Fase 2 — Autenticación y tweets** | Se implementa el flujo completo de autenticación (registro y login) en la API y se conecta al frontend. Se añade la funcionalidad de publicar y listar tweets. La sesión del usuario se persiste en `localStorage` via `AuthContext`. |
| 2026-03-26 | **Fase 3 — Refactorización de la API** | Se descompone `app.js` en módulos separados: `routes/` (auth, tweets, profiles), `services/` (auth.service, tweet.service, profile.service) y `lib/` (supabase.js, bearer.js, upload.js, validation.js). Se actualiza la suite de tests de la API para cubrir los nuevos módulos. |
| 2026-03-26 | **Fase 4 — Perfiles y avatares** | Se añade la página `ProfilePage` con navegación dinámica por username (`/profile/:username`). Se implementa el componente `Avatar`. En la API se crean los endpoints de perfil (`GET /profiles/me`, `PATCH /profiles/me`, `POST /profiles/me/avatar`, `GET /profiles/:username`). Se añade la migración de Storage (`20260326183505_avatars_storage.sql`) con un bucket público `avatars` y políticas RLS para que cada usuario gestione solo su propio archivo. |
| 2026-03-26 | **Fase 4b — Tests de frontend y tooling QA** | Se actualizan los tests de `FeedPage` y se añaden los tests de `ProfilePage`. Se añade el agente `qa-engineer` de Cursor AI y se actualizan las reglas de trabajo para incluir el flujo de verificación delegada al QA. |

---
*Última actualización: 2026-03-26 — basado en el historial git hasta el commit `3b705fe`*
