# Technical Brief — Integración de Google Calendar

## 0. Snapshot

| Campo           | Valor                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------- |
| Fecha           | `2026-04-27`                                                                                |
| Tipo            | `Feature — integración OAuth + tools de agente`                                             |
| Stack principal | `Next.js + Node.js + TypeScript + LangGraph JS + Supabase + Google Calendar API (REST)`    |
| Estado          | `Draft — pendiente de implementación`                                                       |
| Antecedente     | Integración de GitHub ya implementada ([github/README.md](../github/README.md))    |

---

## 1. Título de la tarea

Integrar Google Calendar al agente para que el usuario conecte su cuenta de Google desde *Settings* mediante OAuth y el agente pueda **leer y escribir eventos** —incluyendo series recurrentes— en el calendario `primary` del propio usuario, replicando el patrón ya consolidado para GitHub (OAuth + token cifrado + tools en el agente + confirmación estructurada para acciones sensibles), de modo que la conexión Google quede lista para extenderse a otras APIs (Sheets, Drive, Gmail) en el futuro sin migración.

---

## 2. Contexto

### ¿Qué existe hoy?

La integración de **GitHub** ya está implementada y es el patrón a replicar (ver [`github/README.md`](../github/README.md)). En particular, ya existe la infraestructura transversal:

- **OAuth + persistencia cifrada:** `apps/web/src/app/api/auth/github/{start,callback,disconnect}` y `apps/web/src/lib/github/oauth.ts` como referencia de flujo.
- **Cifrado de tokens:** `packages/db/src/crypto.ts` — AES-256-GCM con `OAUTH_ENCRYPTION_KEY`. Reutilizable tal cual.
- **Tabla `user_integrations`:** ya persiste `provider`, `encrypted_tokens`, `provider_account_id`, `provider_account_login`, `updated_at` (migration `00002`). Soporta `provider = "google"` sin cambios de esquema.
- **Confirmación estructurada:** `ConfirmationRequiredError` + arista `shouldContinueAfterTools` en `packages/agent/src/graph.ts` + `pendingConfirmation` en el resultado del grafo + endpoint `POST /api/chat/confirm`. Provider-agnóstico.
- **Tokens en runtime:** `IntegrationsContext` (`packages/agent/src/types.ts`) lleva los tokens descifrados al agente sin pasar por el historial de mensajes; `apps/web/src/lib/agent/integrations-context.ts` los carga en cada request de `/api/chat` y del webhook de Telegram.
- **UI de Settings:** sección de integraciones ya existente; agregar Google es un panel nuevo dentro del mismo patrón.
- **UI de confirmación:** card en chat web e *inline buttons* en Telegram ya soportados.

Toda la spec funcional original vive en [`./README.md`](./README.md) (este brief la operacionaliza).

### Problema

El agente no puede agendar, consultar ni modificar reuniones. Hoy no sabe cuándo el usuario está ocupado, no puede crear eventos a partir de una conversación, y no puede manejar reuniones recurrentes (*"todos los lunes a las 10am"*, *"de lunes a viernes a las 9"*) — que son la mayor parte del calendario real de un usuario.

### Objetivo

El usuario conecta su cuenta de Google desde *Settings*, autoriza un scope acotado a eventos, y el agente —con sus permisos— puede listar, crear, modificar y eliminar eventos del calendario primario, incluyendo series recurrentes con manejo correcto de scope (instancia vs. serie). Toda acción de escritura pasa por confirmación humana estructurada antes de ejecutarse.

### Usuarios / Consumidores

Usuarios del agente que ya tienen cuenta de Google y quieren delegarle gestión de calendario desde el chat (web o Telegram).

---

## 3. Alcance

### Dentro del alcance

- [ ] **Conectar / desconectar Google desde *Settings***: panel con botón de conectar, *callback* de OAuth 2.0, mostrar email vinculado y opción de desconectar.
- [ ] **OAuth con `access_type=offline` y `prompt=consent`** para garantizar *refresh token* en la primera conexión.
- [ ] **Scope inicial acotado**: `https://www.googleapis.com/auth/calendar.events`. La arquitectura debe permitir agregar más scopes (Sheets, Drive, etc.) sobre el mismo `client_id` y la misma fila de `user_integrations` sin migración.
- [ ] **Persistencia cifrada** de `access_token`, `refresh_token`, fecha de expiración y scopes concedidos en `user_integrations.encrypted_tokens` (AES-256-GCM, mismo `OAUTH_ENCRYPTION_KEY`).
- [ ] **Refresh automático del access token** antes de cada llamada (umbral: < 60s para expirar). Re-cifrado y re-persistencia transparentes.
- [ ] **Marcar integración como desconectada** si el *refresh token* deja de ser válido (revocado, scopes cambiados); notificar al usuario en la siguiente interacción.
- [ ] **Cinco tools de Calendar** sobre el calendario `primary`: `gcal_list_events`, `gcal_get_event`, `gcal_create_event`, `gcal_update_event`, `gcal_delete_event`.
- [ ] **Soporte de eventos recurrentes** con un esquema de alto nivel (`frequency`, `interval`, `byDay`, `byMonthDay`, `count`, `until`) que la capa de tools traduce a `RRULE` (RFC 5545) antes de llamar a la API.
- [ ] **Interpretación de lenguaje natural** para recurrencias comunes (*"todos los lunes a las 10am"*, *"de lunes a viernes a las 9"*, *"cada dos semanas los miércoles"*, *"el primer día de cada mes"*).
- [ ] **Scope de modificación/eliminación** sobre series: parámetro `scope: "instance" | "series"`, inferido desde la frase del usuario, mostrado explícitamente en el card de confirmación. En caso de ambigüedad, el agente pregunta antes de pedir confirmación.
- [ ] **Expansión de recurrencias** en `gcal_list_events` (`singleEvents=true`) para razonar sobre instancias concretas y detectar conflictos.
- [ ] **Detección de conflictos** antes de crear un evento recurrente: revisar las primeras N ocurrencias (default 8 semanas) e informar al modelo en el resumen del card.
- [ ] **Manejo correcto de zonas horarias**: pasar la zona del usuario (o `Etc/UTC` por defecto) y respetar formato RFC3339.
- [ ] **Confirmación estructurada** en `gcal_create_event`, `gcal_update_event`, `gcal_delete_event` reutilizando `ConfirmationRequiredError` y `pendingConfirmation`. Card en web, inline buttons en Telegram.
- [ ] **Token al agente vía `IntegrationsContext`** en campo `google.accessToken` (separado de `github.accessToken`); nunca en el historial de mensajes.
- [ ] **Tools filtradas por integración activa**: si el usuario no conectó Google, las tools de Calendar no se exponen al modelo (mismo filtro que ya hace `buildLangChainTools()` para GitHub).

### Fuera del alcance

- [ ] Soporte para **múltiples calendarios** del usuario (sólo `primary` en esta entrega).
- [ ] Otras APIs de Google (**Sheets, Drive, Gmail, Meet, Tasks**) — la arquitectura debe permitirlas a futuro sin migración, pero no se implementan ahora.
- [ ] **Modificación de configuración del calendario** (color, sharing, recordatorios por defecto).
- [ ] **Agregar/quitar invitados** sobre eventos existentes como flujo dedicado (se cubre indirectamente vía `gcal_update_event`).
- [ ] **Free/busy multi-cuenta** o consultas a calendarios de terceros.
- [ ] **Webhooks / push notifications** de Google Calendar (`watch` API).
- [ ] **Caché local de eventos**: cada llamada va a la API en vivo.
- [ ] **Soporte de timezones por evento** distinto al del usuario (en esta entrega, todos los eventos se crean en la zona del usuario).

---

## 4. Stack & Arquitectura

### 4.1 Stack

| Capa                       | Tecnología                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------- |
| OAuth                      | Endpoints en `apps/web/src/app/api/auth/google/{start,callback,disconnect}`           |
| Cliente HTTP a Google      | `packages/agent/src/integrations/google-calendar.ts` (REST mínimo, igual que GitHub)  |
| Cifrado                    | `packages/db/src/crypto.ts` (AES-256-GCM, ya existente)                               |
| Persistencia               | Tabla `user_integrations` con `provider = "google"`                                   |
| Runtime del agente         | LangGraph JS — grafo y arista de confirmación ya existentes                           |
| Validación de inputs       | `zod` en los schemas de las tools                                                     |
| Confirmación               | `ConfirmationRequiredError` + `pendingConfirmation` (provider-agnóstico)              |
| UI                         | Next.js App Router — Settings y card de chat                                          |
| Canal Telegram             | Webhook existente, inline buttons ya soportados                                       |

### 4.2 Arquitectura — diagrama en texto

```
[ Usuario — Web / Telegram ]
        ↓
[ /api/chat  |  Telegram webhook ]
        ↓
[ integrations-context.ts ]
   ├── carga user_integrations (provider="google")
   ├── descifra access_token (AES-256-GCM)
   ├── refresca si expira en < 60s → re-cifra → persiste
   └── arma IntegrationsContext { google: { accessToken, ... } }
        ↓
[ runAgent() — LangGraph ]
   ├── tools filtradas por integración activa
   ├── modelo decide tool call
   ↓
[ gcal_* tools ]
   ├── lectura → ejecuta directo → resultado al modelo
   └── escritura → ConfirmationRequiredError → grafo se detiene
        ↓
[ pendingConfirmation persistido ]
        ↓
[ UI: card (web) / inline buttons (Telegram) ]
        ↓ aprobación
[ POST /api/chat/confirm ]
        ↓
[ executeApprovedToolCall() ]
        ↓
[ Google Calendar API REST ]
```

### 4.3 Tools del agente

| Tool                | Operación API                                            | Riesgo | Confirmación |
| ------------------- | -------------------------------------------------------- | ------ | ------------ |
| `gcal_list_events`  | `events.list` con `singleEvents=true`                    | bajo   | No           |
| `gcal_get_event`    | `events.get` (incluye `recurrence`)                      | bajo   | No           |
| `gcal_create_event` | `events.insert` (acepta `recurrence` opcional)           | medio  | Sí           |
| `gcal_update_event` | `events.patch` con `scope: instance \| series`           | medio  | Sí           |
| `gcal_delete_event` | `events.delete` con `scope: instance \| series`          | alto   | Sí           |

### 4.4 Modelo de recurrencia (input al modelo)

```ts
type Recurrence = {
  frequency: "daily" | "weekly" | "monthly" | "yearly";
  interval?: number;          // default 1
  byDay?: ("MO"|"TU"|"WE"|"TH"|"FR"|"SA"|"SU")[]; // weekly
  byMonthDay?: number;        // monthly
  count?: number;             // mutuamente excluyente con until
  until?: string;             // RFC3339, mutuamente excluyente con count
};
```

La capa de tools traduce este objeto a una `RRULE` válida (RFC 5545). Si tanto `count` como `until` están vacíos, la serie es **abierta** (sin fin).

### 4.5 Variables de entorno requeridas

```
GOOGLE_OAUTH_CLIENT_ID=<client id desde Google Cloud Console>
GOOGLE_OAUTH_CLIENT_SECRET=<client secret>
GOOGLE_OAUTH_REDIRECT_URI=<https://.../api/auth/google/callback>
OAUTH_ENCRYPTION_KEY=<misma key usada por GitHub>
```

---

## 5. Constraints

### Reglas fijas (no negociables)

**Seguridad**

- [ ] El *access token* y *refresh token* se cifran antes de persistir; nunca se loguean ni se envían al cliente.
- [ ] El *refresh token* sólo se usa en servidor.
- [ ] El descifrado falla de forma explícita si `OAUTH_ENCRYPTION_KEY` cambia.
- [ ] Ningún token aparece en respuestas del cliente, en logs, ni en el historial de mensajes del agente.
- [ ] CSRF: el `state` del flujo OAuth se firma/valida igual que en el flujo de GitHub.

**Arquitectura**

- [ ] Reutilizar `packages/db/src/crypto.ts` y la tabla `user_integrations`. Nada de tablas nuevas para este provider.
- [ ] La capa de confirmación se mantiene **provider-agnóstica**: las tools de Calendar lanzan el mismo `ConfirmationRequiredError`; nada se ramifica por provider en el grafo.
- [ ] La API identifica "pendiente de confirmación" por el campo estructurado `pendingConfirmation`, **no** por *string matching*.
- [ ] El modelo NO recibe el token; lo recibe la tool desde `IntegrationsContext`.
- [ ] Las tools sólo se exponen al modelo si hay integración Google activa para ese usuario (filtrado en `buildLangChainTools()`).

**OAuth**

- [ ] `access_type=offline` + `prompt=consent` siempre que se pida un nuevo refresh token.
- [ ] El flujo soporta agregar scopes adicionales a futuro sin invalidar la conexión existente (se concatenan en el `state` y se reutiliza el mismo registro de `user_integrations`).
- [ ] Si la API responde `invalid_grant` durante un refresh, marcar la integración como desconectada y notificar al usuario.

**Calidad de código**

- [ ] TypeScript estricto, schemas de tools con `zod`.
- [ ] Cliente REST mínimo (mismo estilo que `packages/agent/src/integrations/github.ts`); no se introduce el SDK de `googleapis` en este alcance.
- [ ] Idiomas: código, variables, logs y comentarios en inglés. Mensajes al usuario y descripciones de tools en español.

### Reglas específicas de esta tarea

- [ ] El alcance de modificación/eliminación (`instance` vs `series`) es **inferido por el agente** desde el lenguaje natural; en caso de ambigüedad, el agente **pregunta** antes de invocar la tool.
- [ ] El card de confirmación indica explícitamente el alcance: *"Esta acción afectará **solo a esa ocurrencia**"* vs. *"Esta acción afectará **toda la serie**"*.
- [ ] Al crear un evento recurrente, la tool inspecciona las primeras N ocurrencias (default 8 semanas) y devuelve los conflictos relevantes en el `summary` del card.
- [ ] La fecha y hora del primer evento se calcula en la **zona del usuario** (o `Etc/UTC` por defecto) y se envía en RFC3339 con offset; ese instante es el **ancla** de la serie para Google.
- [ ] Las modificaciones a una sola instancia de una serie usan `recurringEventId` + `originalStartTime` (vía `events.patch` sobre la instancia expandida).
- [ ] La confirmación se resuelve **únicamente con botones de UI**, nunca con texto libre.
- [ ] Sólo el calendario `primary` en esta entrega. La capa de tools recibe el `calendarId` como parámetro interno con default `"primary"` para no cerrar la puerta a multi-calendario más adelante.

### Manejo de errores de Google Calendar API

| Error                          | Condición                                       | Respuesta                                                                                                                          |
| ------------------------------ | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `invalid_grant` en refresh     | refresh token revocado o scopes cambiados       | Marcar integración como desconectada; mensaje al usuario: "Se perdió la conexión con Google. Vuelve a conectar desde Settings."  |
| `401 Unauthorized` en API call | access token vencido entre el check y la call   | Forzar refresh y un único reintento. Si vuelve a fallar, tratar como `invalid_grant`.                                              |
| `403 forbidden` por scopes     | scope no concedido para la operación pedida     | Mensaje al usuario explicando qué scope falta y pidiendo reconectar; no reintentar.                                                |
| `404` evento no encontrado     | el evento fue borrado fuera del agente          | Mensaje claro al modelo en el resultado de la tool, sin marcar la integración.                                                     |
| `429 rate limit`               | demasiadas requests                             | Backoff exponencial: hasta 2 reintentos (2s, 4s). Si persiste, error al modelo y se mantiene la sesión.                            |
| Timeout de red (>10s)          | la request no responde                          | 1 reintento inmediato. Si falla, error al modelo y se mantiene la sesión.                                                          |

---

## 6. Riesgos & Supuestos

| #   | Riesgo / Supuesto                                                                                                            | Probabilidad | Mitigación                                                                                                          |
| --- | ---------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------- |
| 1   | El refresh token puede ser revocado por el usuario desde su cuenta Google sin avisar al sistema.                             | Media        | Detectar `invalid_grant` y marcar la integración como desconectada; UI lo refleja en Settings.                      |
| 2   | El parsing de lenguaje natural a `Recurrence` puede ambiguar (*"el lunes"* — ¿este o todos?).                                | Alta         | El agente debe **preguntar** ante ambigüedad antes de invocar la tool; no asumir.                                   |
| 3   | Crear una serie larga (años) puede generar miles de instancias; expandirlas para detectar conflictos es caro.                | Media        | Limitar la ventana de expansión a 8 semanas (configurable). Sólo se expande para detectar conflictos, no se lista.  |
| 4   | Zonas horarias: el servidor corre en UTC, el usuario puede estar en otra zona; un mal manejo crea eventos a la hora errónea. | Alta         | El agente exige una zona explícita o usa la del perfil del usuario; las pruebas cubren al menos 2 zonas distintas.  |
| 5   | Eventos modificados fuera del agente pueden invalidar `recurringEventId` o `originalStartTime` cacheados.                    | Baja         | Cada tool consulta el evento en vivo antes de modificar; no hay caché local.                                        |
| 6   | Rate limit de Google Calendar (default ~1M queries/día por proyecto, ~600/min por usuario).                                  | Baja         | Backoff exponencial. Pocas llamadas por interacción de usuario en el patrón actual.                                 |
| 7   | El usuario podría intentar borrar la serie completa accidentalmente cuando sólo quería una instancia.                        | Media        | El card de confirmación muestra el alcance (`instance` vs `series`) de forma explícita y diferenciada.              |
| 8   | Supuesto: el usuario tiene cuenta Google y permisos para autorizar OAuth en el `client_id` configurado.                      | Alta         | Documentado en setup; el botón de conectar lleva al flujo estándar de Google.                                       |

---

## 7. Definition of Done

### Siempre se cumplen

- [ ] TypeScript compila sin errores en `apps/web` y `packages/agent`.
- [ ] Linter pasa sin errores.
- [ ] Schemas de tools validados con `zod`.
- [ ] Variables sensibles únicamente en `.env`; `.env.example` actualizado con las nuevas variables.
- [ ] CHANGELOG actualizado con la sección de Calendar.
- [ ] [`./README.md`](./README.md) marcada como **implementada** y enlazada desde el README del proyecto.

### Criterios específicos de esta tarea

- [ ] El usuario puede conectar y desconectar su cuenta de Google desde *Settings*; el estado (email, scopes) se refleja correctamente tras refrescar la página.
- [ ] En base de datos, ningún token aparece en texto plano; el cifrado funciona con `OAUTH_ENCRYPTION_KEY` y falla de forma explícita si la clave cambia.
- [ ] El *access token* se renueva automáticamente con el *refresh token* antes de expirar, sin intervención del usuario, y la nueva expiración se persiste cifrada.
- [ ] Si el *refresh token* deja de ser válido, la integración se marca como desconectada y el usuario es notificado en la siguiente interacción.
- [ ] Las cinco tools de Calendar operan contra la API real con los permisos del usuario y respetan la zona horaria del usuario.
- [ ] El agente puede crear eventos recurrentes a partir de frases en lenguaje natural (*"todos los lunes a las 10am"*, *"de lunes a viernes a las 9"*, *"cada dos semanas los miércoles"*), traduciéndolas a una `RRULE` válida.
- [ ] Modificar o eliminar un evento que pertenece a una serie permite distinguir entre **una sola ocurrencia** y **toda la serie**, y el alcance se muestra de forma explícita en el card de confirmación.
- [ ] `gcal_list_events` expande las recurrencias dentro del rango consultado para razonar sobre instancias concretas; los conflictos se reportan al modelo en el `summary` del card antes de crear una serie.
- [ ] Crear, modificar o eliminar un evento desde el agente dispara confirmación (card en web, inline buttons en Telegram) y no ejecuta hasta que el usuario aprueba.
- [ ] La API identifica el estado de "pendiente de confirmación" mediante el resultado estructurado del grafo, no por *string matching*.
- [ ] Ningún token de Google aparece en respuestas del cliente, en logs, ni en el historial de mensajes del agente.
- [ ] La arquitectura permite agregar nuevos scopes/APIs de Google (Sheets, Drive, etc.) sobre la misma conexión sin migración de datos.
- [ ] Las tools de Calendar **no se exponen al modelo** si el usuario no conectó Google.

---

## 8. Referencias & Notas

- Spec funcional original: [`./README.md`](./README.md)
- Patrón a replicar (ya implementado): [`github/README.md`](../github/README.md)
- Brief del producto: [`brief.md`](../../brief.md)
- Arquitectura general: [`architecture.md`](../../architecture.md)
- Google Calendar API — Events: https://developers.google.com/calendar/api/v3/reference/events
- RFC 5545 — RRULE: https://datatracker.ietf.org/doc/html/rfc5545
- Google OAuth 2.0 — server-side flow: https://developers.google.com/identity/protocols/oauth2/web-server
