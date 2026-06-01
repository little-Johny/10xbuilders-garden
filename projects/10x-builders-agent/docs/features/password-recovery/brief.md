# Technical Brief — Recuperación de contraseña (web)

## 0. Snapshot

| Campo | Valor |
|---|---|
| Fecha | 2026-05-25 |
| Tipo | `Feature / Auth` |
| Stack principal | `Next.js (App Router)`, `Supabase Auth`, `Telegram Bot` |
| Estado | `Implementado` (código + docs; pendiente config Supabase Dashboard y prueba manual) |
| Issue | #4 — feat: recuperar contraseña |

---

## 1. Contexto

### ¿Qué existe hoy?

La app web (`apps/web`) usa **Supabase Auth** para autenticación. El flujo actual cubre:

- Login email + password en `app/login/login-form.tsx` con `supabase.auth.signInWithPassword`.
- Signup email + password en `app/signup/signup-form.tsx` con `supabase.auth.signUp` y confirmación por email.
- OAuth con Google (`app/api/auth/google/*`) y GitHub (`app/api/auth/github/*`).
- Callback de OAuth/confirmación en `app/auth/callback/route.ts` que hace `exchangeCodeForSession(code)` y redirige.
- Logout en `app/api/auth/signout`.

La pantalla de login **no tiene** ningún enlace a "olvidé mi contraseña". El usuario reporta en el issue que, ante el olvido, termina creando cuentas nuevas — síntoma claro de la ausencia.

Telegram autentica vía un setup separado (`app/api/telegram/setup` + `webhook`) que vincula el `chat_id` con un `user_id` de Supabase. No usa contraseña — el flujo de reset no aplica directamente, pero los usuarios que también usan la web sí pueden necesitar saber dónde recuperarla.

### Objetivo

Permitir que un usuario con cuenta email+password en la web pueda **solicitar un reset de contraseña por email** y **establecer una nueva contraseña** desde una pantalla en la web, sin necesidad de crear una cuenta nueva.

### Usuarios / Consumidores

- **Usuario final** que se registró con email+password y olvidó la suya.
- **No aplica** a usuarios que entraron solo con OAuth (Google/GitHub) — esos no tienen contraseña en Supabase; el mensaje debe ser claro si intentan resetear con un email asociado a OAuth.

---

## 2. Alcance

### Dentro del alcance

- [x] **Link "¿Olvidaste tu contraseña?"** en `app/login/page.tsx` que apunta a `/forgot-password`.
- [x] **Pantalla `/forgot-password`** (`app/forgot-password/page.tsx` + `forgot-password-form.tsx`):
  - Input de email + botón "Enviar link de recuperación".
  - Llama a `supabase.auth.resetPasswordForEmail(email, { redirectTo: ${origin}/reset-password })`.
  - **Respuesta genérica** independientemente de si el email existe ("Si la cuenta existe, te enviamos un link"). Evita enumeración de cuentas.
- [x] **Pantalla `/reset-password`** (`app/reset-password/page.tsx` + `reset-password-form.tsx`):
  - Llega tras click en el link del email; el callback existente debe ejecutar `exchangeCodeForSession` y dejar al usuario con una sesión temporal de recovery.
  - Inputs: nueva contraseña + confirmación. **Esquema de validación** centralizado en `lib/auth/password.ts` (8+, mayúscula, minúscula, número, especial); ver §4.
  - Llama a `supabase.auth.updateUser({ password })`.
  - Tras éxito, redirige a `/` con sesión activa.
- [x] **`app/auth/callback/route.ts`**: el callback ya respeta `next=/reset-password` (no requería detectar `type=recovery`). Se añadió hardening: si el exchange falla con `next=/reset-password`, redirige a `/forgot-password?error=expired`.
- [x] **Middleware** (`lib/supabase/middleware.ts`): añadir `/forgot-password` y `/reset-password` a la lista blanca de rutas públicas. Sin esto, el middleware redirige a `/login` a cualquier usuario sin sesión que intente acceder al flujo (descubierto en pruebas).
- [x] **Esquema de contraseña + checklist** en signup y reset-password: `lib/auth/password.ts` expone las reglas (8 caracteres, mayúscula, minúscula, número, especial) y `validatePassword()`. El componente `components/password-rules.tsx` muestra cada regla en vivo (✓/○). El botón submit se deshabilita hasta cumplir todas. Aplica a signup y reset, no a login.
- [x] **Toggle de visibilidad ("ojito")** en los inputs de contraseña de signup y reset-password (`components/password-input.tsx`, SVG inline sin librería de iconos). Login se deja sin ojito por decisión UX (es un input de "contraseña existente", no de creación/cambio).
- [ ] **Plantillas de email en Supabase Dashboard** (config del owner, ver plan §7):
  - "Reset Password" (la que dispara `resetPasswordForEmail`) — adaptar copy a español y branding.
  - "Password Changed" — email de notificación tras cambio exitoso. Se configura en Auth > Email Templates si Supabase lo expone; si no, se implementa enviando un email propio desde el handler post-`updateUser`.
- [x] **Mensaje en Telegram**: los mensajes existentes de `/start` y "cuenta no vinculada" incluyen ahora un link a `${WEB_URL}/forgot-password` (`WEB_URL` = `NEXT_PUBLIC_APP_URL`). Solo informativo — no se hace reset desde Telegram. (Los comandos `/help`/`/login` que asumía el brief no existen.)
- [x] **Variables de entorno**: no se agregan nuevas. La var real es `NEXT_PUBLIC_APP_URL` (ya usada en el código); en cliente basta `window.location.origin`. No existe `.env.example` en el repo.

### Fuera del alcance

- [ ] OTP / código numérico en lugar de link.
- [ ] Magic link como sustituto del login con contraseña.
- [ ] Cambio de contraseña desde dentro de la app (perfil / settings) — eso es otra feature.
- [ ] 2FA / MFA.
- [ ] Pregunta de seguridad o flujo de recuperación sin email (backup codes, etc.).
- [ ] Recuperación o re-vinculación de cuentas OAuth (Google/GitHub) — Supabase los maneja en su propio flujo.
- [ ] Flujo de reset iniciado desde Telegram (solo se informa con un link).
- [ ] Rate limiting custom: se confía en el rate limiting nativo de Supabase Auth.
- [ ] Auditoría / tabla propia de intentos de reset.

---

## 3. Stack & Arquitectura

### 3.1 Stack

| Capa | Tecnología |
|---|---|
| Framework web | Next.js (App Router) — ver `AGENTS.md`: usa APIs específicas del fork, no asumir las del Next.js de docs públicos |
| Cliente Supabase navegador | `@supabase/ssr` (`createBrowserClient`) |
| Cliente Supabase servidor | `@/lib/supabase/server` (`createClient`) |
| Auth | Supabase Auth — métodos `resetPasswordForEmail`, `exchangeCodeForSession`, `updateUser` |
| Email transactional | Supabase Auth Emails (SMTP configurado en el proyecto Supabase) |
| Bot | Telegram Bot API vía `app/api/telegram/webhook` |
| Estilos | Tailwind, mismo patrón visual que `login-form.tsx` / `signup-form.tsx` |
| Componentes compartidos | `components/password-input.tsx` (input + ojito), `components/password-rules.tsx` (checklist), `lib/auth/password.ts` (esquema) |

### 3.2 Flujo — diagrama en texto

```
[/login] ──link "¿Olvidaste tu contraseña?"──→ [/forgot-password]
                                                       │
                                                       │ submit email
                                                       ▼
                                       supabase.auth.resetPasswordForEmail(
                                         email,
                                         { redirectTo: `${origin}/auth/callback?next=/reset-password` }
                                       )
                                                       │
                                       Supabase envía email "Reset password"
                                                       │
[Usuario en su cliente de email] ──click link──→ /auth/callback?code=<jwt>&type=recovery&next=/reset-password
                                                       │
                                       exchangeCodeForSession(code)  → sesión "recovery"
                                                       │
                                                       ▼
                                              redirect → /reset-password
                                                       │
                                       submit nueva contraseña
                                                       │
                                              supabase.auth.updateUser({ password })
                                                       │
                                       Supabase envía email "Password changed" (notificación)
                                                       │
                                                       ▼
                                              redirect → /  (ya autenticado)
```

```
[Telegram bot] usuario sin sesión válida o /help
    └→ responde: "Si olvidaste tu contraseña, podés recuperarla acá: {WEB_URL}/forgot-password"
```

### 3.3 Contratos de datos

No hay API propia: el frontend habla directamente con Supabase. Los únicos puntos donde toca el código del repo son:

```ts
// app/forgot-password/forgot-password-form.tsx
await supabase.auth.resetPasswordForEmail(email, {
  redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
});
// → siempre responde con mensaje genérico al usuario (success o "si existe la cuenta...")

// app/auth/callback/route.ts
// El callback ya respeta el query `next`; basta con pasar next=/reset-password
// en `redirectTo`. Hardening añadido: si `next === "/reset-password"` y el
// exchange falla, redirige a /forgot-password?error=expired.

// app/reset-password/reset-password-form.tsx
await supabase.auth.updateUser({ password: newPassword });
// → success: router.push("/")
// → error: render del mensaje (sesión expirada, password débil, etc.)
// El submit está bloqueado hasta que validatePassword(password).valid === true
// y password === confirm.
```

### 3.4 Telegram — punto de integración

En `app/api/telegram/webhook/route.ts`, donde ya se resuelve la sesión del usuario, agregar:

- Si el comando es `/help` o `/login` (o equivalente), incluir en la respuesta un link a `${WEB_URL}/forgot-password`.
- Si el `chat_id` no está vinculado a ningún `user_id` válido, el mensaje actual de "no estás vinculado" debe mencionar también la opción de recuperar contraseña en la web.

No se introduce nuevo flujo de comandos en el bot — solo se enriquece la respuesta existente. La URL de la web vive en `WEB_URL` o `NEXT_PUBLIC_SITE_URL` (verificar cuál existe ya).

---

## 4. Constraints

### Reglas fijas

- TypeScript estricto, sin `any`.
- Mismo look & feel que `login-form.tsx` / `signup-form.tsx` (Tailwind, mismas clases, mismos textos de estado en español).
- **No exponer si un email está registrado o no**: la respuesta de `/forgot-password` es genérica ("Si existe una cuenta con ese email, te enviamos un link"). Aplica también a errores que Supabase pudiera devolver de forma discriminante.
- **Esquema de contraseña** (signup + reset, no login) — centralizado en `lib/auth/password.ts`:
  - ≥ 8 caracteres.
  - Al menos 1 mayúscula (A-Z).
  - Al menos 1 minúscula (a-z).
  - Al menos 1 número (0-9).
  - Al menos 1 carácter especial (no alfanumérico).
- Las credenciales nunca se loggean (incluido el password nuevo en `updateUser`).
- **Sin lógica de auth en client components que no sea estrictamente UI**: server actions o handlers en el callback para todo lo sensible. El `updateUser` puede ir en cliente porque opera sobre la sesión de recovery del propio navegador.
- Next.js: AGENTS.md pide leer `node_modules/next/dist/docs/`, pero **ese folder no existe en el fork instalado** (Next 16.2.1). Se implementó siguiendo el patrón de las rutas existentes (login/signup/callback) y se valida con `type-check`.

### Reglas específicas de esta tarea

- [x] La URL de redirect del email (`redirectTo`) usa `window.location.origin` (sin hardcodear `localhost`). En Telegram se usa `process.env.NEXT_PUBLIC_APP_URL` con fallback. La var es `NEXT_PUBLIC_APP_URL`, no `NEXT_PUBLIC_SITE_URL` como asumía la versión inicial del brief.
- [ ] `/reset-password` debe **rechazar acceso** si no hay sesión activa de recovery: mostrar mensaje "Este link ya no es válido, solicitá uno nuevo" + link a `/forgot-password`. No dejar formulario vacío que dispare un `updateUser` sin sesión.
- [ ] Si el usuario llegó vía OAuth (no tiene `password` real en su `user`), el `updateUser({ password })` puede crearle uno por primera vez. Documentar este comportamiento; no es bug, pero conviene que el copy lo aclare si lo detectamos.
- [ ] `redirectTo` debe estar en la lista blanca de Supabase Auth (`Site URL` + `Redirect URLs` en el dashboard). Sin esto, el email funciona pero el link redirige a la home por defecto.
- [ ] La plantilla "Password changed" — si se implementa con email propio, NO debe contener un link clickable de "no fui yo" si no hay endpoint para honrarlo; mejor un mensaje plano que indique cómo contactar.

---

## 5. Riesgos & Supuestos

| # | Riesgo / Supuesto | Probabilidad | Mitigación |
|---|---|---|---|
| 1 | El callback actual (`/auth/callback`) trata todo `code` como login normal y redirige a `/`. El recovery también pasa por ahí y puede mandar al usuario a la home en vez de a `/reset-password` | Alta | **Resuelto:** el callback ya respeta `next`; basta con pasar `next=/reset-password` desde `resetPasswordForEmail`. Hardening: si el exchange falla con `next=/reset-password`, redirige a `/forgot-password?error=expired`. |
| 2 | Supabase configurado sin SMTP custom: el email no llega o llega como spam | Media | Verificar config SMTP en el proyecto Supabase antes de implementar. Documentar el requisito. |
| 3 | `redirectTo` no está en la whitelist de Supabase y el link manda al usuario a la URL por defecto | Alta | Documentadas en el plan §7 las URLs a agregar (`http://localhost:3000/auth/callback` + producción / ngrok para Telegram). No hay README en `apps/web` donde dejarlo. |
| 4 | Enumeración de cuentas vía tiempos de respuesta o mensajes distintos | Media | Mismo mensaje genérico en todos los casos; no se loggea ni distingue en UI si el email existía. |
| 5 | Un usuario OAuth resetea y se crea un password "fantasma" que después usa para login email+password sin esperarlo | Baja-Media | Documentar el comportamiento; no bloquear. Es la semántica nativa de Supabase. |
| 6 | El email "Password changed" no existe como plantilla nativa en la versión de Supabase del proyecto | Media | Verificar en el dashboard. Si no existe, implementar handler propio que mande email vía Resend / SMTP existente. Si no hay infra de email transactional fuera de Supabase, dejarlo como ítem aparte y notificar al usuario. |
| 7 | Supuesto: existe `NEXT_PUBLIC_SITE_URL` (o similar) usable como origen en producción | Alta | **Verificado:** la var real es `NEXT_PUBLIC_APP_URL` (ya usada por OAuth Google/GitHub). No se agregan vars nuevas. |
| 8 | Cambio de password no invalida otras sesiones del usuario (otros navegadores/Telegram) | Media | Por ahora, fuera de alcance. Documentar como follow-up; Supabase tiene `signOut({ scope: 'others' })` si se quiere agregar. |
| 9 | El middleware (`lib/supabase/middleware.ts`) redirige a `/login` cualquier ruta no incluida en su whitelist, incluyendo `/forgot-password` y `/reset-password` (no aparecía en el brief original) | Alta | **Detectado en pruebas y resuelto:** se añadieron `/forgot-password` y `/reset-password` a `publicPaths`. |

---

## 6. Definition of Done

### Siempre se cumplen

- [x] `npm run type-check` en `apps/web` pasa sin errores.
- [x] Sin `any`. Sin valores hardcodeados de URL (todas vienen de env o `window.location.origin`).
- [x] Credenciales no se loggean.
- [x] No hay `.env.example` en el repo y no se agregan variables nuevas (`NEXT_PUBLIC_APP_URL` ya existe).
- [x] No existe README de `apps/web`; los requisitos de Supabase (SMTP, Redirect URLs, PKCE) quedan documentados en el plan §7.

### Criterios específicos

- [~] Flujo completo implementado en código; la verificación manual (a–e) queda pendiente de la config del Dashboard (plan §7).
- [ ] Email de notificación "tu contraseña fue cambiada" — follow-up, depende de plantilla nativa de Supabase.
- [x] `/forgot-password` muestra **siempre** el mismo mensaje genérico, exista o no el email (estado `sent`, ignora el resultado).
- [x] Acceder a `/reset-password` sin sesión recovery muestra estado "enlace expirado" con CTA a `/forgot-password`.
- [~] Login con contraseña vieja vs. nueva — a verificar manualmente tras config del Dashboard.
- [x] El bot de Telegram menciona la URL de recuperación en `/start` y ante usuario no vinculado.
- [x] Las redirect URLs necesarias están documentadas (plan §7) para cargarlas en el Dashboard de Supabase.
- [x] El middleware permite acceso público a `/forgot-password` y `/reset-password` (sin sesión); en pruebas se confirmó vía `GET /forgot-password 200`.
- [x] En signup y reset-password, la contraseña debe cumplir el esquema de 5 reglas (`lib/auth/password.ts`); el botón submit está deshabilitado hasta que cumpla. La checklist visual (`PasswordRules`) muestra cada regla en verde a medida que se cumple.
- [x] En signup y reset-password, los inputs de contraseña tienen toggle de visibilidad (`PasswordInput`).

---

## 7. Referencias & Notas

- Issue: #4 — feat: recuperar contraseña.
- Patrón visual de referencia: `apps/web/src/app/login/login-form.tsx`, `apps/web/src/app/signup/signup-form.tsx`.
- Callback existente a extender: `apps/web/src/app/auth/callback/route.ts`.
- Cliente Supabase (servidor): `apps/web/src/lib/supabase/server.ts`.
- Webhook Telegram: `apps/web/src/app/api/telegram/webhook/route.ts`.
- Docs Supabase relevantes:
  - `auth.resetPasswordForEmail(email, { redirectTo })`
  - `auth.exchangeCodeForSession(code)`
  - `auth.updateUser({ password })`
  - Email Templates → "Reset Password", "Change Email Address"
- AGENTS.md del web: el Next.js de este repo es un fork con breaking changes — AGENTS pide leer `node_modules/next/dist/docs/`, **pero ese folder no existe** en el fork instalado (Next 16.2.1); se siguió el patrón de las rutas existentes y se validó con `type-check`.
- Memoria del proyecto: el modelo del agente está fijado a `:free` (no aplica directamente a esta feature, pero relevante si se involucra al agente en algún flujo).
- Plan de implementación (as-built): [plan.md](plan.md).
