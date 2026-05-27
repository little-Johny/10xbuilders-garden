# Technical Brief — Recuperación de contraseña (web)

## 0. Snapshot

| Campo | Valor |
|---|---|
| Fecha | 2026-05-25 |
| Tipo | `Feature / Auth` |
| Stack principal | `Next.js (App Router)`, `Supabase Auth`, `Telegram Bot` |
| Estado | `Draft` |
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

- [ ] **Link "¿Olvidaste tu contraseña?"** en `app/login/page.tsx` que apunta a `/forgot-password`.
- [ ] **Pantalla `/forgot-password`** (`app/forgot-password/page.tsx` + `forgot-password-form.tsx`):
  - Input de email + botón "Enviar link de recuperación".
  - Llama a `supabase.auth.resetPasswordForEmail(email, { redirectTo: ${origin}/reset-password })`.
  - **Respuesta genérica** independientemente de si el email existe ("Si la cuenta existe, te enviamos un link"). Evita enumeración de cuentas.
- [ ] **Pantalla `/reset-password`** (`app/reset-password/page.tsx` + `reset-password-form.tsx`):
  - Llega tras click en el link del email; el callback existente debe ejecutar `exchangeCodeForSession` y dejar al usuario con una sesión temporal de recovery.
  - Inputs: nueva contraseña + confirmación. Mínimo 6 caracteres (consistente con signup).
  - Llama a `supabase.auth.updateUser({ password })`.
  - Tras éxito, redirige a `/` con sesión activa.
- [ ] **Extender `app/auth/callback/route.ts`** para soportar `type=recovery`: detectar el flujo de recovery y redirigir a `/reset-password` (no a `/` directamente).
- [ ] **Plantillas de email en Supabase Dashboard**:
  - "Reset Password" (la que dispara `resetPasswordForEmail`) — adaptar copy a español y branding.
  - "Password Changed" — email de notificación tras cambio exitoso. Se configura en Auth > Email Templates si Supabase lo expone; si no, se implementa enviando un email propio desde el handler post-`updateUser`.
- [ ] **Mensaje en Telegram** cuando el bot detecte que el usuario vinculado intenta interactuar pero la sesión en Supabase no es válida (o ante un comando `/help` o `/login`): mostrar mensaje breve con link a `${WEB_URL}/forgot-password`. Solo informativo — no se hace reset desde Telegram.
- [ ] **Variables `.env.example`**: documentar `NEXT_PUBLIC_SITE_URL` si aún no está, ya que `redirectTo` lo necesita en producción.

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

// app/auth/callback/route.ts  (extensión)
// Si searchParams.type === "recovery" o next === "/reset-password",
// asegurar la redirección a /reset-password tras exchangeCodeForSession.

// app/reset-password/reset-password-form.tsx
await supabase.auth.updateUser({ password: newPassword });
// → success: router.push("/")
// → error: render del mensaje (sesión expirada, password débil, etc.)
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
- `password` mínimo 6 caracteres (consistente con `signup-form.tsx:68`).
- Las credenciales nunca se loggean (incluido el password nuevo en `updateUser`).
- **Sin lógica de auth en client components que no sea estrictamente UI**: server actions o handlers en el callback para todo lo sensible. El `updateUser` puede ir en cliente porque opera sobre la sesión de recovery del propio navegador.
- Next.js: leer `node_modules/next/dist/docs/` antes de implementar rutas/páginas — el fork de Next.js de este repo tiene breaking changes vs. el público (ver `apps/web/AGENTS.md`).

### Reglas específicas de esta tarea

- [ ] La URL de redirect del email (`redirectTo`) debe usar el origen actual del navegador en dev y `NEXT_PUBLIC_SITE_URL` (o equivalente verificado) en prod, no hardcodear `localhost`.
- [ ] `/reset-password` debe **rechazar acceso** si no hay sesión activa de recovery: mostrar mensaje "Este link ya no es válido, solicitá uno nuevo" + link a `/forgot-password`. No dejar formulario vacío que dispare un `updateUser` sin sesión.
- [ ] Si el usuario llegó vía OAuth (no tiene `password` real en su `user`), el `updateUser({ password })` puede crearle uno por primera vez. Documentar este comportamiento; no es bug, pero conviene que el copy lo aclare si lo detectamos.
- [ ] `redirectTo` debe estar en la lista blanca de Supabase Auth (`Site URL` + `Redirect URLs` en el dashboard). Sin esto, el email funciona pero el link redirige a la home por defecto.
- [ ] La plantilla "Password changed" — si se implementa con email propio, NO debe contener un link clickable de "no fui yo" si no hay endpoint para honrarlo; mejor un mensaje plano que indique cómo contactar.

---

## 5. Riesgos & Supuestos

| # | Riesgo / Supuesto | Probabilidad | Mitigación |
|---|---|---|---|
| 1 | El callback actual (`/auth/callback`) trata todo `code` como login normal y redirige a `/`. El recovery también pasa por ahí y puede mandar al usuario a la home en vez de a `/reset-password` | Alta | Ajustar `route.ts` para respetar `next=/reset-password` y/o detectar `type=recovery`. Verificar con un test manual. |
| 2 | Supabase configurado sin SMTP custom: el email no llega o llega como spam | Media | Verificar config SMTP en el proyecto Supabase antes de implementar. Documentar el requisito. |
| 3 | `redirectTo` no está en la whitelist de Supabase y el link manda al usuario a la URL por defecto | Alta | Documentar en el README qué URLs hay que agregar (`http://localhost:3000/auth/callback` + producción). |
| 4 | Enumeración de cuentas vía tiempos de respuesta o mensajes distintos | Media | Mismo mensaje genérico en todos los casos; no se loggea ni distingue en UI si el email existía. |
| 5 | Un usuario OAuth resetea y se crea un password "fantasma" que después usa para login email+password sin esperarlo | Baja-Media | Documentar el comportamiento; no bloquear. Es la semántica nativa de Supabase. |
| 6 | El email "Password changed" no existe como plantilla nativa en la versión de Supabase del proyecto | Media | Verificar en el dashboard. Si no existe, implementar handler propio que mande email vía Resend / SMTP existente. Si no hay infra de email transactional fuera de Supabase, dejarlo como ítem aparte y notificar al usuario. |
| 7 | Supuesto: existe `NEXT_PUBLIC_SITE_URL` (o similar) usable como origen en producción | Alta | Verificar `.env.example` y `next.config.*` antes; si no existe, agregarlo. |
| 8 | Cambio de password no invalida otras sesiones del usuario (otros navegadores/Telegram) | Media | Por ahora, fuera de alcance. Documentar como follow-up; Supabase tiene `signOut({ scope: 'others' })` si se quiere agregar. |

---

## 6. Definition of Done

### Siempre se cumplen

- [ ] `npm run type-check` (o equivalente en `apps/web`) pasa sin errores.
- [ ] Sin `any`. Sin valores hardcodeados de URL (todas vienen de env o `window.location.origin`).
- [ ] Credenciales no se loggean.
- [ ] `.env.example` actualizado con cualquier variable nueva.
- [ ] README de `apps/web` menciona el flujo de recuperación y los requisitos de Supabase (SMTP, Redirect URLs).

### Criterios específicos

- [ ] Un usuario que olvidó su contraseña puede: (a) hacer click en "¿Olvidaste tu contraseña?" desde `/login`, (b) ingresar su email en `/forgot-password`, (c) recibir el email, (d) clickear el link y aterrizar en `/reset-password` con sesión recovery activa, (e) escribir nueva contraseña y entrar a `/` autenticado.
- [ ] Después del reset, el usuario recibe un email de notificación "tu contraseña fue cambiada".
- [ ] Pedir reset para un email inexistente devuelve **exactamente** el mismo mensaje que para uno existente.
- [ ] Acceder a `/reset-password` sin sesión recovery muestra un estado de "link expirado" con CTA para pedir uno nuevo.
- [ ] El login con la **contraseña vieja** falla; el login con la **nueva** funciona.
- [ ] El bot de Telegram, ante `/help` (o el comando equivalente actual) y ante un usuario no vinculado, menciona la URL de recuperación.
- [ ] Las redirect URLs necesarias están documentadas para que se carguen en el dashboard de Supabase.

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
- AGENTS.md del web: el Next.js de este repo es un fork con breaking changes — leer `node_modules/next/dist/docs/` antes de implementar.
- Memoria del proyecto: el modelo del agente está fijado a `:free` (no aplica directamente a esta feature, pero relevante si se involucra al agente en algún flujo).
- Próximo paso esperado: redactar `password-recovery-plan.md` con los pasos concretos de implementación una vez aprobado este brief.
