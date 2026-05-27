# Plan de Implementación — Integración de Google Calendar

Documento de **as-built**: registra lo que se ejecutó para habilitar Google Calendar en el agente, replicando el patrón ya consolidado para GitHub. La especificación funcional vive en [README.md](README.md) y el brief técnico en [brief.md](brief.md).

## Decisiones de diseño confirmadas

- **Schema con columnas dedicadas**: la migración `00003` agrega `encrypted_refresh_token` y `access_token_expires_at` a `user_integrations` (en lugar de meter un JSON cifrado en `encrypted_tokens`). Permite leer la expiración sin descifrar y mantiene `encrypted_tokens` como "el access token" (alineado con el comentario del schema).
- **Scopes mínimos con identidad**: `openid email https://www.googleapis.com/auth/calendar.events`. El email se persiste en `provider_account_login` para mostrarlo en Settings (mismo campo donde GitHub guarda el `login`).
- **Capa de confirmación intacta**: `ConfirmationRequiredError`, `pendingConfirmation` y `shouldContinueAfterTools` siguen siendo provider-agnósticos. Cero cambios en `graph.ts`, en el card de chat, ni en el webhook de Telegram.
- **Zona horaria del usuario**: se toma de `profiles.timezone` (que ya existía) y se propaga vía `IntegrationsContext.google.timeZone`. Default `Etc/UTC` si el perfil no la tiene.

---

## Fases y estado

### Fase 1: DB — schema y queries con refresh token ✅

- [x] Migración `packages/db/supabase/migrations/00003_google_integration.sql`: `encrypted_refresh_token text` + `access_token_expires_at timestamptz` (ambas opcionales; GitHub las ignora)
- [x] `upsertIntegration()` extendida con parámetros opcionales `refreshToken` y `accessTokenExpiresAt` que se cifran y persisten cuando vienen
- [x] `updateAccessToken(db, { userId, provider, accessToken, accessTokenExpiresAt })` — usada por el flujo de refresh; toca solo el access token y su expiración
- [x] `getDecryptedRefreshToken(db, userId, provider)` — análoga a `getDecryptedAccessToken` pero leyendo `encrypted_refresh_token`
- [x] Tipo `UserIntegration` (`packages/types/src/index.ts`) con `access_token_expires_at?: string | null`

### Fase 2: OAuth Google (web) ✅

- [x] Helper `apps/web/src/lib/google/oauth.ts` — exporta `GOOGLE_PROVIDER`, `GOOGLE_OAUTH_STATE_COOKIE`, `GOOGLE_OAUTH_SCOPES`, `getGoogleOAuthConfig`, `buildAuthorizeUrl` (con `access_type=offline` + `prompt=consent`), `generateState`, `exchangeCodeForToken`, `refreshAccessToken`, `fetchGoogleUserInfo`
- [x] Endpoint `GET /api/auth/google/start` — genera state, setea cookie httpOnly de 10 min, redirige a Google
- [x] Endpoint `GET /api/auth/google/callback` — valida state, intercambia el code, **rechaza el callback si Google no devuelve `refresh_token`** (`reason=missing_refresh_token`), llama `userinfo`, calcula `expires_at = now + expires_in*1000`, persiste cifrado vía `upsertIntegration`
- [x] Endpoint `POST /api/auth/google/disconnect` — `deleteIntegration` y `{ ok: true }`
- [x] CSRF: cookie httpOnly `g_oauth_state` con el mismo patrón de GitHub

### Fase 3: Cliente Calendar y refresh helper ✅

- [x] `apps/web/src/lib/google/access-token.ts` — `ensureFreshGoogleAccessToken(db, userId)`:
  - Devuelve el access token actual si quedan más de 60s antes de expirar
  - Si está por expirar/expiró, llama `refreshAccessToken`, re-cifra y persiste con `updateAccessToken`
  - Ante `invalid_grant` llama `revokeIntegration` y devuelve `null` (la UI de Settings lo refleja como desconectado)
  - Errores transitorios (red, 5xx) bubblean al caller
- [x] `packages/agent/src/integrations/google-calendar.ts` — cliente REST mínimo (mirror de `github.ts`):
  - `gcalFetch<T>` interno con `Authorization: Bearer`
  - `recurrenceToRRule(r: Recurrence)` traduce el objeto de alto nivel a RRULE de RFC 5545; valida que `count` y `until` sean mutuamente excluyentes; convierte `until` al formato básico `YYYYMMDDTHHMMSSZ`
  - `listEvents` con `singleEvents=true&orderBy=startTime` (recurrencias expandidas por instancia)
  - `getEvent`, `createEvent` (con `recurrence: [RRULE]` cuando aplica), `updateEvent` (PATCH), `deleteEvent`
  - `findConflictsInWindow` reusa `listEvents` para inspeccionar la ventana N semanas

### Fase 4: Runtime del agente — tools y context ✅

- [x] `IntegrationsContext.google?: { accessToken; email?; timeZone? }` agregado en `packages/agent/src/types.ts`
- [x] 5 entradas nuevas en `TOOL_CATALOG` (`packages/agent/src/tools/catalog.ts`) con `requires_integration: "google"`:
  - `gcal_list_events` — riesgo `low`, sin confirmación
  - `gcal_get_event` — riesgo `low`, sin confirmación
  - `gcal_create_event` — riesgo `medium`, **con confirmación**
  - `gcal_update_event` — riesgo `medium`, **con confirmación**
  - `gcal_delete_event` — riesgo `high`, **con confirmación**
- [x] `requireGoogleToken(ctx)` análogo a `requireGithubToken` en `adapters.ts`
- [x] 5 wrappers `tool()` con schemas zod. Los 3 de escritura tiran `ConfirmationRequiredError` con summary que incluye:
  - Para create: título, rango horario, zona, descripción de la recurrencia (si la hay), aviso de conflictos detectados en las primeras 8 semanas (best-effort, no bloquea si la API falla)
  - Para update/delete: alcance explícito — *"Esta acción afectará SOLO a esa ocurrencia"* vs *"Esta acción afectará TODA la serie"*
- [x] Helper `describeRecurrence(r)` que genera líneas en español como *"Cada semana los lunes"*, *"Cada 2 semanas los miércoles"*, *"Cada mes el día 1"*
- [x] `recurrenceSchema` y `normalizeRecurrence` en `adapters.ts` para convertir el input zod (con `nullable`) al objeto `Recurrence` limpio que consume el cliente
- [x] 3 ramas en `executeApprovedToolCall` para `gcal_create_event`, `gcal_update_event`, `gcal_delete_event`. La ruta web/Telegram refresca el token vía `loadIntegrationsContext` antes de invocar, por lo que no se duplica el refresh aquí
- [x] `loadIntegrationsContext()` (`apps/web/src/lib/agent/integrations-context.ts`) extendido con un bloque Google que llama `ensureFreshGoogleAccessToken` y propaga `profile.timezone` a `ctx.google.timeZone`. Errores se loguean y la integración se omite (mismo patrón que GitHub)

### Fase 5: UI de Settings ✅

- [x] `apps/web/src/app/settings/page.tsx`: query adicional para `provider="google"` y nuevo prop `google={ email, scopes }`
- [x] `apps/web/src/app/settings/settings-form.tsx`: nueva `<section>` para Google **después** del panel de GitHub. Mirror del UX:
  - Conectado → muestra email vinculado en monoespaciado, lista de scopes y botón "Desconectar"
  - No conectado → descripción + link a `/api/auth/google/start`
  - `disconnectGoogle()` llama `POST /api/auth/google/disconnect` y refresca la página
- [x] `TOOL_IDS` extendido con las 5 tools `gcal_*` para que aparezcan en el toggle de Herramientas
- [x] **Sin cambios** en `chat-interface.tsx`, `/api/chat/confirm/route.ts`, ni en el webhook de Telegram (todos genéricos)

### Fase 6: Configuración y documentación ✅

- [x] README: paso 9 nuevo "Google Calendar (opcional)" con instrucciones de Google Cloud Console y los redirect URIs; tabla de variables de entorno con `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`; el paso de Telegram se renumeró a 10
- [x] CHANGELOG actualizado con sección `[Unreleased] / Added`: integración OAuth, 5 tools, refresh token lifecycle, migration `00003`. Sección `Changed` refleja `IntegrationsContext.google`, `loadIntegrationsContext` extendido, `upsertIntegration` con campos opcionales y el panel de Settings
- [x] [`README.md`](README.md) marcada con `> Estado: implementada.` y enlazada a este plan y al brief
- [x] [`brief.md`](brief.md) — brief técnico que se redactó antes de implementar (input al plan)
- [x] Fase 8 agregada en [`plan.md`](../../plan.md)

### Fase 7: Verificación ✅

- [x] `npm run type-check` — los 4 paquetes (`@agents/types`, `@agents/db`, `@agents/agent`, `@agents/web`) compilan sin errores
- [x] `npm run lint` — sin errores en `@agents/web`
- [x] Dos errores de tipo pre-existentes en `adapters.ts` (zod `.nullable().optional()` en GitHub tools) que el linecount nuevo expuso fueron resueltos con `?? undefined`

---

## Archivos resultantes

### Nuevos (8)

- `packages/db/supabase/migrations/00003_google_integration.sql`
- `apps/web/src/lib/google/oauth.ts`
- `apps/web/src/lib/google/access-token.ts`
- `apps/web/src/app/api/auth/google/start/route.ts`
- `apps/web/src/app/api/auth/google/callback/route.ts`
- `apps/web/src/app/api/auth/google/disconnect/route.ts`
- `packages/agent/src/integrations/google-calendar.ts`
- `docs/features/calendar/brief.md`

### Modificados (10)

- `packages/db/src/queries/integrations.ts` — `upsertIntegration` extendida + `updateAccessToken` + `getDecryptedRefreshToken`
- `packages/types/src/index.ts` — `UserIntegration.access_token_expires_at`
- `packages/agent/src/types.ts` — `IntegrationsContext.google`
- `packages/agent/src/tools/catalog.ts` — 5 entradas `gcal_*`
- `packages/agent/src/tools/adapters.ts` — `requireGoogleToken`, 5 wrappers, helpers de recurrencia, 3 ramas en `executeApprovedToolCall`, fix de zod nullable en wrappers de GitHub
- `apps/web/src/lib/agent/integrations-context.ts` — bloque Google con refresh y zona horaria del perfil
- `apps/web/src/app/settings/page.tsx` — query `provider="google"` y prop nuevo
- `apps/web/src/app/settings/settings-form.tsx` — panel Google + tools en `TOOL_IDS` + `disconnectGoogle`
- `README.md` — paso de Google Calendar y env vars
- `CHANGELOG.md` — entrada en `[Unreleased]`
- `docs/plan.md` — Fase 8
- `docs/features/calendar/README.md` — header de estado

### Reusados sin tocar

- `packages/db/src/crypto.ts` — `encryptSecret`/`decryptSecret`
- `packages/agent/src/graph.ts` — `shouldContinueAfterTools` ya halta en `pendingConfirmation`
- `apps/web/src/app/chat/chat-interface.tsx` — card de confirmación genérico
- `apps/web/src/app/api/chat/confirm/route.ts` — orquesta `executeApprovedToolCall` por `toolName`
- `apps/web/src/app/api/telegram/webhook/route.ts` — botones inline + handler de callback son genéricos

---

## Variables de entorno nuevas

```
GOOGLE_CLIENT_ID=<client id desde Google Cloud Console>
GOOGLE_CLIENT_SECRET=<client secret>
# OAUTH_ENCRYPTION_KEY ya existe (compartida con GitHub)
# NEXT_PUBLIC_APP_URL ya existe; el redirect es ${NEXT_PUBLIC_APP_URL}/api/auth/google/callback
```

---

## Verificación end-to-end pendiente

La verificación funcional descrita en el brief (flujos A–J: conectar, listar, crear simple, recurrente con conflictos, scope instance vs series, refresh automático, refresh inválido, Telegram, tools no expuestas, no leak de tokens) **no se ejecutó** todavía: requiere correr `npm run dev`, autorizar en Google Cloud Console y un cliente real. Es la primera tarea cuando se vaya a probar el feature.

Tests unitarios del cliente (`recurrenceToRRule`, manejo de scope, etc.) tampoco se escribieron porque el monorepo aún no tiene framework de tests configurado.

---

## Follow-ups

- Tests unitarios del cliente Calendar y del helper de refresh (requiere setup previo de Vitest u otro framework).
- Soportar múltiples calendarios: el parámetro `calendarId` ya existe como interno en las 5 tools (default `"primary"`); falta exponerlo y un picker en Settings.
- Push notifications (`watch` API) para reaccionar a cambios externos al chat.
- Permitir agregar/quitar invitados en `gcal_update_event` como flujo dedicado (hoy se cubre indirectamente).
