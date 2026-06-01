# Plan de Implementación — Recuperación de contraseña (web)

Documento de plan, consolidado como **as-built**. Se basa en el [brief.md](brief.md) e issue **#4**.

> **Estado:** `Implementado` (2026-05-27). `type-check` del web pasa sin errores. Pendiente: configuración en el Supabase Dashboard (ver §7) y prueba manual end-to-end.

---

## 0. Resumen

- Flujo de reset por email 100% sobre **Supabase Auth** nativo (`resetPasswordForEmail` → `exchangeCodeForSession` → `updateUser`). Sin API ni tablas propias.
- 2 pantallas nuevas (`/forgot-password`, `/reset-password`) + 1 link en `/login`.
- El **callback existente NO necesita cambios de lógica**: el flujo se apoya en el query param `next` que ya soporta `app/auth/callback/route.ts:7,13`. Solo se endurece el manejo de error.
- **Middleware** (`lib/supabase/middleware.ts`) había que ajustar: por defecto redirige a `/login` cualquier ruta no listada en `publicPaths`. Se añadió `/forgot-password` y `/reset-password` a esa whitelist (descubierto al probar en navegador).
- **Esquema de contraseña + UX del input**: add-on aplicado tras la primera ronda. Centralizado en `lib/auth/password.ts` (8+, mayúscula, minúscula, número, especial) y consumido vía dos componentes nuevos: `components/password-input.tsx` (input con toggle ojito) y `components/password-rules.tsx` (checklist viva). Se aplica en signup y reset-password; el login no se toca.
- Mensajería de Telegram: enriquecer mensajes **existentes** (`/start` y "cuenta no vinculada") — el brief mencionaba `/help`/`/login` que **no existen** en el bot.
- Config externa (Supabase Dashboard): plantilla de email + whitelist de Redirect URLs + PKCE confirmado. Es trabajo de dashboard, no de código; se documenta como requisito.

### Hallazgos que corrigen el brief

| Supuesto del brief | Realidad verificada | Impacto en el plan |
|---|---|---|
| Var de entorno `NEXT_PUBLIC_SITE_URL` / `WEB_URL` | La var real es **`NEXT_PUBLIC_APP_URL`** (`.env.example`) | Usar esa; en cliente basta `window.location.origin`. No agregar var nueva. |
| Telegram tiene comandos `/help` / `/login` | El bot solo tiene `/start` y `/link`; hay un mensaje "No tienes una cuenta vinculada" (`webhook/route.ts:145,198`) | Enriquecer `/start` y el mensaje de no-vinculado, no inventar comandos. |
| Leer `node_modules/next/dist/docs/` (AGENTS.md) | Ese folder **no existe** en el fork instalado (Next **16.2.1**) | No se puede consultar; implementar siguiendo el patrón de las páginas/route handlers ya presentes en el repo (login/signup/callback) y validar con `type-check`. |
| Callback debe detectar `type=recovery` | El callback ya redirige a `${origin}${next}` | Basta pasar `next=/reset-password` en `redirectTo`. La detección de `type` queda como hardening opcional (Fase 2). |

---

## 1. Decisiones de diseño

| Tema | Decisión | Por qué |
|---|---|---|
| Origen de la URL de redirect | `window.location.origin` en el client component de forgot-password. No leer env en cliente. | Funciona en dev y prod sin hardcodear; `NEXT_PUBLIC_APP_URL` queda como referencia para docs/Telegram. |
| Ruta de redirect del email | `redirectTo = ${origin}/auth/callback?next=/reset-password` | Reusa el callback existente sin tocar su lógica; el code-exchange ocurre ahí y luego redirige a `/reset-password`. |
| Cambios en `callback/route.ts` | **Ninguno funcional.** Opcional: si `next` apunta a `/reset-password` y el exchange falla, redirigir a `/forgot-password?error=expired` en vez de `/login`. | Minimiza superficie de cambio; el `next` param ya cubre el caso feliz. |
| Anti-enumeración | `/forgot-password` muestra **siempre** el mismo mensaje genérico, ignore el resultado de `resetPasswordForEmail` (success o error). No render condicional según existencia del email. | Brief §4, riesgo #4. Supabase ya responde sin distinguir, pero el UI no debe filtrar. |
| Guarda de `/reset-password` | Antes de mostrar el form, verificar sesión recovery con `supabase.auth.getUser()` en el client component. Sin usuario → estado "link expirado" + CTA a `/forgot-password`. | Brief §4: no dejar un form que dispare `updateUser` sin sesión. |
| Validación de password | Esquema centralizado en `lib/auth/password.ts` (5 reglas: 8+, mayúscula, minúscula, número, especial). `validatePassword(value)` devuelve `{ valid, checks }`. El submit se deshabilita con `disabled={loading \|\| !valid \|\| password !== confirm}`; además se valida en `handleSubmit` por defensa. La función es **pura** (sin React) para poder reutilizarse desde server actions o tests. | Reemplaza el `minLength={6}` inicial. Una sola fuente de verdad evita desincronización entre la checklist visual y la validación del submit. |
| Toggle de visibilidad | Componente `components/password-input.tsx` con SVG inline (sin librería de iconos), `aria-label`/`aria-pressed` para accesibilidad, `tabIndex={-1}` para no robar el foco del Tab. Se usa en signup y reset-password (input nuevo + confirmación, ojito independiente). No se usa en login. | UX estándar; evita errores de tipeo en contraseñas largas / con caracteres especiales. |
| Middleware whitelist | `/forgot-password` y `/reset-password` se añaden al array `publicPaths` en `lib/supabase/middleware.ts`. Sin esto, el middleware redirige a `/login` a cualquier usuario sin sesión que intente acceder al flujo. | Descubierto en pruebas (`GET /login` en lugar de `/forgot-password`); el brief no lo había anticipado. |
| Manejo de errores `updateUser` | Mapear a mensajes en español: sesión expirada, password débil, password igual a la anterior. Nunca loggear el password. | Brief §4. |
| Look & feel | Copiar exactamente las clases Tailwind y estructura de `login-form.tsx` / `signup-form.tsx`. Mismo patrón de `error` box rojo + botón azul + estados de loading. | Brief constraint. |
| Cliente Supabase | `createBrowserClient` con las mismas dos env públicas que login/signup. | Consistencia. |
| Email "Password changed" | Depende de plantilla nativa de Supabase. **No** implementar email propio en esta iteración (no hay infra transactional fuera de Supabase verificada). Si la plantilla nativa existe, activarla en dashboard; si no, queda como follow-up. | Brief riesgo #6; evita scope creep. |
| Telegram | Solo enriquecer texto existente con la URL de recuperación. Sin nuevo flujo de comandos. | Brief explícito: Telegram solo informa. |

---

## 2. Fases de implementación

### Fase 0 — Spike / verificación (sin código) — ⚠️ pendiente (Dashboard, lo hace el owner)

- [ ] Confirmar en el **Supabase Dashboard** que hay SMTP configurado (sin esto el email no llega). Documentar el estado.
- [ ] Confirmar que existe la plantilla nativa **"Reset Password"** y revisar si existe **"Password changed"**.
- [ ] Anotar las **Redirect URLs** que deben quedar en whitelist: `http://localhost:3000/auth/callback` (dev) y `${NEXT_PUBLIC_APP_URL}/auth/callback` (prod).
- [ ] Confirmar que el proyecto usa **flujo PKCE** (el enlace del email trae `?code=...`), que es lo que asume el callback existente.

### Fase 1 — Pantalla "Olvidé mi contraseña" (`/forgot-password`) — ✅ hecho

- [x] `apps/web/src/app/forgot-password/page.tsx` — server component contenedor (mismo layout `main` centrado que `login/page.tsx`). Si ya hay sesión, `redirect("/")`. **As-built:** además lee `searchParams.error` (como `Promise`, por el fork de Next) y muestra un banner ámbar cuando llega `?error=expired` desde el callback.
- [x] `apps/web/src/app/forgot-password/forgot-password-form.tsx` — client component:
  - Input email + botón "Enviar enlace de recuperación".
  - Submit: `await supabase.auth.resetPasswordForEmail(email, { redirectTo: \`${window.location.origin}/auth/callback?next=/reset-password\` })`.
  - **Siempre** muestra el mismo mensaje genérico (estado `sent`), sin importar el resultado. No se loggea nada.
- [x] Link "¿Olvidaste tu contraseña?" en `login/page.tsx` apuntando a `/forgot-password` (encima del link "Crear cuenta", mismo estilo).

### Fase 1.5 — Middleware whitelist — ✅ hecho (descubierto en pruebas)

- [x] `apps/web/src/lib/supabase/middleware.ts`: añadir `/forgot-password` y `/reset-password` al array `publicPaths`. Sin esto, el middleware redirige a `/login` a cualquier usuario sin sesión que intente acceder al flujo (síntoma observado: logs muestran `GET /login` repetidos tras click en "¿Olvidaste tu contraseña?", ningún `GET /forgot-password`).

### Fase 2 — Callback (hardening) — ✅ hecho

- [x] `app/auth/callback/route.ts`: confirmado que `next=/reset-password` se respeta (ya lo hacía).
- [x] Hardening **incluido**: si el exchange falla y `next === "/reset-password"`, redirige a `/forgot-password?error=expired` en vez de `/login?error=auth_failed`.

### Fase 3 — Pantalla "Restablecer contraseña" (`/reset-password`) — ✅ hecho

- [x] `apps/web/src/app/reset-password/page.tsx` — server component contenedor. NO redirige por sesión (la sesión recovery ES válida); el form maneja el estado.
- [x] `apps/web/src/app/reset-password/reset-password-form.tsx` — client component:
  - Al montar: `supabase.auth.getUser()`. Sin usuario → estado "Este enlace ya no es válido" + CTA a `/forgot-password`. Estado `checking` muestra "Verificando enlace...".
  - Con usuario: inputs nueva contraseña + confirmación usando `<PasswordInput>` (ojito independiente en cada uno). Checklist viva (`<PasswordRules>`) bajo el primer input. Submit deshabilitado hasta `validatePassword(password).valid && password === confirm`.
  - Submit: `await supabase.auth.updateUser({ password })`. Éxito → `router.push("/")` + `router.refresh()`.
  - Errores muestran el mensaje de Supabase; nunca se loggea el password.

### Fase 4 — Telegram (informativo) — ✅ hecho

- [x] En `app/api/telegram/webhook/route.ts`:
  - Mensaje de `/start`: añade línea con `${WEB_URL}/forgot-password`.
  - Mensaje "No tienes una cuenta vinculada": menciona también la URL de recuperación.
- [x] URL desde `process.env.NEXT_PUBLIC_APP_URL` con fallback `http://localhost:3000`, en una constante `WEB_URL` a nivel de módulo. Sin hardcodear.

### Fase 5 — Docs & cierre — ✅ hecho

- [x] **No existe `apps/web/README.md` ni `.env.example` en el repo.** Los requisitos de Supabase (SMTP, Redirect URLs, PKCE) se documentan en §7 en su lugar.
- [x] `NEXT_PUBLIC_APP_URL` ya se usa en el código (OAuth Google/GitHub); no se agregan vars nuevas.
- [x] Checkboxes del brief §6 marcados y este plan consolidado como **as-built**. `type-check` del web pasa.

### Fase 6 — Esquema de contraseña y toggle de visibilidad — ✅ hecho (add-on)

Añadido tras la primera ronda, a petición del usuario, para mejorar UX y endurecer el esquema. Aplica a signup y reset-password; el login se deja intacto.

- [x] `apps/web/src/lib/auth/password.ts` — define `PASSWORD_RULES` (5 reglas: 8+, mayúscula, minúscula, número, especial) y `validatePassword(value): { valid, checks }`. Función pura sin React, reutilizable desde el servidor.
- [x] `apps/web/src/components/password-input.tsx` — input con toggle ojito (SVG inline, sin librería de iconos). `aria-label`/`aria-pressed` para accesibilidad. `tabIndex={-1}` en el botón para no robar el foco del Tab.
- [x] `apps/web/src/components/password-rules.tsx` — checklist visual: cada regla `○` gris pasa a `✓` verde al cumplirse.
- [x] `apps/web/src/app/signup/signup-form.tsx` — sustituye el input plano por `<PasswordInput>`, agrega `<PasswordRules>`, valida con `validatePassword`. Botón submit `disabled={loading || !valid}`. Quita `minLength={6}` (ahora 8+ por esquema).
- [x] `apps/web/src/app/reset-password/reset-password-form.tsx` — mismo patrón. Botón submit `disabled={loading || !valid || password !== confirm}`. Cada input (nuevo + confirmación) con ojito independiente.

---

## 3. Archivos afectados

| Archivo | Acción |
|---|---|
| `app/forgot-password/page.tsx` | **nuevo** |
| `app/forgot-password/forgot-password-form.tsx` | **nuevo** |
| `app/reset-password/page.tsx` | **nuevo** |
| `app/reset-password/reset-password-form.tsx` | **nuevo** |
| `app/login/page.tsx` | editar (link a forgot-password) |
| `app/auth/callback/route.ts` | editar (hardening: `next=/reset-password` → `/forgot-password?error=expired` ante fallo) |
| `app/api/telegram/webhook/route.ts` | editar (2 mensajes con URL de recuperación) |
| `lib/supabase/middleware.ts` | editar (whitelist `/forgot-password` y `/reset-password`) |
| `lib/auth/password.ts` | **nuevo** (esquema + `validatePassword`) |
| `components/password-input.tsx` | **nuevo** (input + toggle ojito) |
| `components/password-rules.tsx` | **nuevo** (checklist visual) |
| `app/signup/signup-form.tsx` | editar (adoptar `<PasswordInput>` + `<PasswordRules>` + `validatePassword`) |

Config fuera del repo (Supabase Dashboard): plantilla email + Redirect URLs whitelist + flujo PKCE. **No es código.** Ver §7.

> Nota: el brief mencionaba editar `apps/web/README.md`, pero ese archivo no existe en el repo; los requisitos del Dashboard se documentan aquí en §7 en su lugar.

---

## 4. Riesgos de implementación

- **Redirect URLs no en whitelist** (brief riesgo #3, prob. Alta): el email llega pero el link cae en la home. → Documentar y verificar en Fase 0/5 antes de dar por cerrada la feature.
- **SMTP no configurado** (riesgo #2): el email nunca llega. → Verificar en Fase 0; es bloqueante para la prueba end-to-end.
- **Fork de Next 16.2.1**: convenciones de App Router pueden diferir de las públicas y los docs del fork no están instalados. → Imitar estrictamente el patrón de las rutas existentes (login/signup/callback) y apoyarse en `type-check`.
- **Usuario OAuth resetea password** (riesgo #5): crea un password "fantasma". Comportamiento nativo de Supabase; documentar, no bloquear.

---

## 5. Validación

- [x] `type-check` del web pasa sin errores, sin `any`.
- [x] `/forgot-password` con email inexistente devuelve **el mismo** mensaje que con uno existente (estado `sent` mostrado siempre, sin discriminar el resultado de `resetPasswordForEmail`).
- [x] `/reset-password` sin sesión recovery muestra estado "link expirado" (validado por code review del flujo `useEffect` + `getUser`).
- [x] `/forgot-password` y `/reset-password` accesibles sin sesión (confirmado en pruebas: `GET /forgot-password 200` tras añadir al whitelist del middleware).
- [x] Telegram `/start` y mensaje de no-vinculado mencionan la URL de recuperación.
- [x] Signup y reset-password rechazan contraseñas que no cumplen el esquema; checklist y ojito visibles.
- [~] **Manual end-to-end pendiente**: olvidé contraseña → recibir email → link → `/reset-password` → nueva pass → entro a `/`. Login con pass vieja falla, con la nueva funciona. Bloqueado por entrega de email vía SMTP por defecto de Supabase; ver §7.

---

## 6. Follow-ups (fuera de alcance)

- Email propio "Password changed" si la plantilla nativa no existe (riesgo #6).
- Invalidar otras sesiones tras el reset (`signOut({ scope: 'others' })`, riesgo #8).
- Cambio de contraseña desde settings/perfil (otra feature).

---

## 7. Configuración requerida en Supabase Dashboard (bloqueante, no es código)

El código está completo, pero el flujo end-to-end **no funcionará** hasta que el owner del proyecto Supabase configure lo siguiente. No tengo acceso al Dashboard.

1. **Redirect URLs** — Authentication → URL Configuration → Redirect URLs. Agregar a la whitelist:
   - `http://localhost:3000/auth/callback` (dev)
   - `https://TU-DOMINIO/auth/callback` (prod, debe coincidir con `NEXT_PUBLIC_APP_URL`)
   - Confirmar también el **Site URL** de producción.
   - Sin esto, el email llega pero el enlace cae en la home (riesgo #3).
2. **SMTP** — Authentication → Emails. Confirmar que el envío funciona. El SMTP por defecto de Supabase sirve para probar pero tiene límites bajos; para producción, SMTP propio (riesgo #2).
3. **Plantilla "Reset Password"** — Authentication → Email Templates. Opcional: adaptar copy a español. Confirmar que el proyecto usa **flujo PKCE** (el enlace trae `?code=...`), que es lo que asume `auth/callback/route.ts`.
4. *(Opcional, follow-up)* Plantilla "Password changed" para notificar el cambio.

### Cómo probar (manual, una vez configurado el Dashboard)

1. `/login` → click "¿Olvidaste tu contraseña?".
2. `/forgot-password` → ingresar email → mensaje genérico siempre.
3. Revisar email → click enlace → aterrizar en `/reset-password` con sesión recovery.
4. Nueva contraseña + confirmación → entrar a `/` autenticado.
5. Login con la contraseña vieja falla; con la nueva funciona.
6. Acceder a `/reset-password` sin sesión recovery → estado "enlace expirado".
7. Email inexistente en `/forgot-password` → exactamente el mismo mensaje.
