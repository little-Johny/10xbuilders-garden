# Plan de Implementación — Recuperación de contraseña (web)

Documento de plan **previo a implementación**. Se basa en el [brief.md](brief.md) e issue **#4**.

> **Estado:** `Draft`. Al completar cada fase, marcar los checkboxes; al final consolidar como **as-built**.

---

## 0. Resumen

- Flujo de reset por email 100% sobre **Supabase Auth** nativo (`resetPasswordForEmail` → `exchangeCodeForSession` → `updateUser`). Sin API ni tablas propias.
- 2 pantallas nuevas (`/forgot-password`, `/reset-password`) + 1 link en `/login`.
- El **callback existente NO necesita cambios de lógica**: el flujo se apoya en el query param `next` que ya soporta `app/auth/callback/route.ts:7,13`. Solo se endurece el manejo de error.
- Mensajería de Telegram: enriquecer mensajes **existentes** (`/start` y "cuenta no vinculada") — el brief mencionaba `/help`/`/login` que **no existen** en el bot.
- Config externa (Supabase Dashboard): plantilla de email + whitelist de Redirect URLs. Es trabajo de dashboard, no de código; se documenta como requisito.

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
| Validación de password | `minLength={6}` en el input + chequeo en submit + confirmación que debe coincidir. Consistente con `signup-form.tsx:68`. | Brief constraint. |
| Manejo de errores `updateUser` | Mapear a mensajes en español: sesión expirada, password débil, password igual a la anterior. Nunca loggear el password. | Brief §4. |
| Look & feel | Copiar exactamente las clases Tailwind y estructura de `login-form.tsx` / `signup-form.tsx`. Mismo patrón de `error` box rojo + botón azul + estados de loading. | Brief constraint. |
| Cliente Supabase | `createBrowserClient` con las mismas dos env públicas que login/signup. | Consistencia. |
| Email "Password changed" | Depende de plantilla nativa de Supabase. **No** implementar email propio en esta iteración (no hay infra transactional fuera de Supabase verificada). Si la plantilla nativa existe, activarla en dashboard; si no, queda como follow-up. | Brief riesgo #6; evita scope creep. |
| Telegram | Solo enriquecer texto existente con la URL de recuperación. Sin nuevo flujo de comandos. | Brief explícito: Telegram solo informa. |

---

## 2. Fases de implementación

### Fase 0 — Spike / verificación (sin código)

- [ ] Confirmar en el **Supabase Dashboard** que hay SMTP configurado (sin esto el email no llega). Documentar el estado.
- [ ] Confirmar que existe la plantilla nativa **"Reset Password"** y revisar si existe **"Password changed"**.
- [ ] Anotar las **Redirect URLs** que deben quedar en whitelist: `http://localhost:3000/auth/callback` (dev) y `${NEXT_PUBLIC_APP_URL}/auth/callback` (prod).

### Fase 1 — Pantalla "Olvidé mi contraseña" (`/forgot-password`)

- [ ] `apps/web/src/app/forgot-password/page.tsx` — server component contenedor (mismo layout `main` centrado que `login/page.tsx`). Si ya hay sesión, `redirect("/")`.
- [ ] `apps/web/src/app/forgot-password/forgot-password-form.tsx` — client component:
  - Input email + botón "Enviar link de recuperación".
  - Submit: `await supabase.auth.resetPasswordForEmail(email, { redirectTo: \`${window.location.origin}/auth/callback?next=/reset-password\` })`.
  - **Siempre** mostrar el mismo mensaje de éxito genérico ("Si existe una cuenta con ese email, te enviamos un link"), sin importar el resultado.
- [ ] Link "¿Olvidaste tu contraseña?" en `login/page.tsx` apuntando a `/forgot-password` (debajo del `LoginForm`, mismo estilo que el link "Crear cuenta").

### Fase 2 — Callback (hardening opcional)

- [ ] Revisar `app/auth/callback/route.ts`: confirmar que `next=/reset-password` se respeta (ya lo hace).
- [ ] (Opcional) Si `next === "/reset-password"` y el exchange falla, redirigir a `/forgot-password?error=expired` en vez de `/login?error=auth_failed`, para un mensaje más claro.

### Fase 3 — Pantalla "Restablecer contraseña" (`/reset-password`)

- [ ] `apps/web/src/app/reset-password/page.tsx` — server component contenedor. NO redirige por sesión (la sesión recovery ES una sesión válida); deja que el form maneje el estado.
- [ ] `apps/web/src/app/reset-password/reset-password-form.tsx` — client component:
  - Al montar: `supabase.auth.getUser()`. Sin usuario → render de estado "Este link ya no es válido" + link a `/forgot-password`.
  - Con usuario: inputs nueva contraseña + confirmación (`minLength={6}`, deben coincidir).
  - Submit: `await supabase.auth.updateUser({ password })`. Éxito → `router.push("/")` + `router.refresh()`.
  - Errores mapeados a español; nunca loggear el password.

### Fase 4 — Telegram (informativo)

- [ ] En `app/api/telegram/webhook/route.ts`:
  - Mensaje de `/start` (`:146`): añadir línea con `${NEXT_PUBLIC_APP_URL}/forgot-password` para recuperar contraseña.
  - Mensaje "No tienes una cuenta vinculada" (`:199`): mencionar también la URL de recuperación.
- [ ] Leer la URL desde `process.env.NEXT_PUBLIC_APP_URL` (con fallback razonable). No hardcodear.

### Fase 5 — Docs & cierre

- [ ] Actualizar `apps/web/README.md` (o el README del proyecto): flujo de recuperación + requisitos de Supabase (SMTP, Redirect URLs en whitelist).
- [ ] `.env.example`: confirmar que `NEXT_PUBLIC_APP_URL` está documentada (ya existe). No se agregan vars nuevas.
- [ ] Marcar checkboxes del brief §6 (Definition of Done) y consolidar este plan como **as-built**.

---

## 3. Archivos afectados

| Archivo | Acción |
|---|---|
| `app/forgot-password/page.tsx` | **nuevo** |
| `app/forgot-password/forgot-password-form.tsx` | **nuevo** |
| `app/reset-password/page.tsx` | **nuevo** |
| `app/reset-password/reset-password-form.tsx` | **nuevo** |
| `app/login/page.tsx` | editar (link a forgot-password) |
| `app/auth/callback/route.ts` | editar opcional (mensaje de error de recovery) |
| `app/api/telegram/webhook/route.ts` | editar (2 mensajes) |
| `apps/web/README.md` | editar (documentar flujo + requisitos Supabase) |

Config fuera del repo (Supabase Dashboard): plantilla email + Redirect URLs whitelist. **No es código.**

---

## 4. Riesgos de implementación

- **Redirect URLs no en whitelist** (brief riesgo #3, prob. Alta): el email llega pero el link cae en la home. → Documentar y verificar en Fase 0/5 antes de dar por cerrada la feature.
- **SMTP no configurado** (riesgo #2): el email nunca llega. → Verificar en Fase 0; es bloqueante para la prueba end-to-end.
- **Fork de Next 16.2.1**: convenciones de App Router pueden diferir de las públicas y los docs del fork no están instalados. → Imitar estrictamente el patrón de las rutas existentes (login/signup/callback) y apoyarse en `type-check`.
- **Usuario OAuth resetea password** (riesgo #5): crea un password "fantasma". Comportamiento nativo de Supabase; documentar, no bloquear.

---

## 5. Validación

- [ ] `type-check` del web pasa sin errores, sin `any`.
- [ ] Manual: olvidé contraseña → email → link → `/reset-password` → nueva pass → entro a `/`. Login con pass vieja falla, con la nueva funciona.
- [ ] `/forgot-password` con email inexistente devuelve **el mismo** mensaje que con uno existente.
- [ ] `/reset-password` sin sesión recovery muestra estado "link expirado".
- [ ] Telegram `/start` y mensaje de no-vinculado mencionan la URL de recuperación.

---

## 6. Follow-ups (fuera de alcance)

- Email propio "Password changed" si la plantilla nativa no existe (riesgo #6).
- Invalidar otras sesiones tras el reset (`signOut({ scope: 'others' })`, riesgo #8).
- Cambio de contraseña desde settings/perfil (otra feature).
