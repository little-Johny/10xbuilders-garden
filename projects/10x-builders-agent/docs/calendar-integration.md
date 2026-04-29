# Integración de Google Calendar — Especificación

> **Estado: implementada.** El plan operativo vive en [`calendar-integration-brief.md`](./calendar-integration-brief.md). Esta página describe el diseño funcional; los criterios de aceptación al final están todos cubiertos por la implementación actual.

## Objetivo

Integrar Google Calendar en el producto para que el usuario pueda conectar su cuenta de Google desde *Settings* y el agente pueda leer y escribir eventos del calendario utilizando los permisos del propio usuario.
La integración debe seguir el mismo patrón ya establecido para GitHub (OAuth + token cifrado + tools en el agente + confirmación estructurada para acciones sensibles), de modo que la conexión de "Google" del usuario quede lista para extenderse a otras APIs de Google (Sheets, Drive, Gmail) en el futuro sin rehacer la base.

---

## Lo que se necesita

### 1. Conectar Google desde Settings

- Agregar una sección **Google** en *Settings* con un botón para conectar la cuenta.
- El flujo debe ser el estándar de OAuth 2.0 de Google:
  - El usuario es redirigido a la pantalla de consentimiento de Google.
  - Autoriza los scopes solicitados.
  - Regresa por el *callback* y se guarda la conexión.
- Si ya está conectado, debe mostrarse el email de la cuenta vinculada y debe existir opción para desconectar.
- La autorización debe pedir `access_type=offline` y `prompt=consent` para obtener siempre un *refresh token* en la primera conexión.

---

### 2. Scopes mínimos

- Iniciar con un scope acotado: `https://www.googleapis.com/auth/calendar.events` (lectura y escritura de eventos, sin tocar configuración del calendario).
- El consent screen y el flujo deben estar diseñados para que en el futuro se puedan agregar más scopes (Sheets, Drive, etc.) sobre el mismo `client_id` sin migración.

---

### 3. Guardar tokens de forma segura

- Tanto el *access token* como el *refresh token* deben cifrarse antes de guardarse en la base de datos usando **AES-256-GCM** y la misma `OAUTH_ENCRYPTION_KEY` que ya usa GitHub.
- Persistir además la fecha de expiración del *access token* y el conjunto de scopes concedidos.
- El *refresh token* sólo se utiliza en el servidor; nunca se expone al cliente.
- Reutilizar `packages/db/src/crypto.ts` y la tabla `user_integrations` con `provider = "google"`.

---

### 4. Refresh automático del access token

- El *access token* de Google expira en ~1 hora; este es el principal punto donde la integración difiere de GitHub.
- Antes de cada llamada a la API, si el token está vencido (o por vencer en < 60s), debe renovarse automáticamente usando el *refresh token*.
- El nuevo *access token* y su nueva expiración deben re-cifrarse y persistirse de forma transparente para las tools.
- Si el *refresh token* deja de ser válido (revocado por el usuario, scopes cambiados), la integración debe marcarse como desconectada y notificarse al usuario en la siguiente interacción.

---

### 5. Usar herramientas reales de Google Calendar

Implementar tools que cubran las operaciones esenciales sobre el calendario primario del usuario:

| Tool | Operación | Riesgo | Requiere confirmación |
|------|-----------|--------|-----------------------|
| `gcal_list_events` | Listar eventos en un rango de fechas (expandiendo recurrencias) | bajo | No |
| `gcal_get_event` | Obtener detalle de un evento (incluyendo `recurrence`) | bajo | No |
| `gcal_create_event` | Crear un evento, único o recurrente (título, fechas, descripción, invitados, RRULE) | medio | Sí |
| `gcal_update_event` | Modificar un evento existente (instancia única o serie completa) | medio | Sí |
| `gcal_delete_event` | Eliminar un evento (instancia única o serie completa) | alto | Sí |

- Manejo correcto de zonas horarias: el agente debe pasar la zona del usuario (o `Etc/UTC` por defecto) y respetar el formato RFC3339 que pide la API de Google.
- Por ahora se trabaja sobre el calendario `primary`. Soporte para múltiples calendarios queda fuera de alcance de esta especificación.

---

### 6. Eventos recurrentes

El agente debe poder agendar y manipular reuniones que se repiten en el tiempo (por ejemplo, *"agéndame una reunión todos los lunes a las 10am"* o *"daily stand-up de lunes a viernes a las 9"*).

#### 6.1. Modelado de la recurrencia

- Las recurrencias se expresan con **`RRULE`** según RFC 5545, que es el campo `recurrence` que admite la API de Google Calendar (ej. `RRULE:FREQ=WEEKLY;BYDAY=MO`).
- `gcal_create_event` y `gcal_update_event` aceptan un parámetro `recurrence` opcional, modelado a alto nivel para que el LLM no tenga que escribir RRULE crudo:
  - `frequency`: `daily` | `weekly` | `monthly` | `yearly`.
  - `interval`: número de unidades entre repeticiones (por defecto 1).
  - `byDay`: arreglo de días de la semana (`MO`, `TU`, …) para reglas semanales.
  - `byMonthDay`: día del mes para reglas mensuales.
  - `count`: número total de ocurrencias (opcional).
  - `until`: fecha límite en formato RFC3339 (opcional, mutuamente excluyente con `count`).
- La capa de tools traduce ese objeto a una RRULE válida antes de llamar a la API. Si tanto `count` como `until` quedan vacíos, la serie se considera **abierta** (sin fin).

#### 6.2. Interpretación de lenguaje natural

- El agente debe poder convertir frases comunes a la estructura anterior:
  - *"todos los lunes a las 10am"* → `{ frequency: "weekly", byDay: ["MO"] }` con `start = lunes próximo 10:00` en la zona del usuario.
  - *"de lunes a viernes a las 9"* → `{ frequency: "weekly", byDay: ["MO","TU","WE","TH","FR"] }`.
  - *"cada dos semanas los miércoles"* → `{ frequency: "weekly", interval: 2, byDay: ["WE"] }`.
  - *"el primer día de cada mes"* → `{ frequency: "monthly", byMonthDay: 1 }`.
- La fecha y hora del primer evento (`start`/`end`) se calculan en la **zona horaria del usuario** y se envían en RFC3339 con offset; la API de Google trata esa primera ocurrencia como el ancla de la serie.

#### 6.3. Modificar y eliminar series

- Tanto `gcal_update_event` como `gcal_delete_event` aceptan un parámetro `scope`:
  - `scope = "instance"` → afecta sólo a la ocurrencia indicada (vía `recurringEventId` + `originalStartTime` en la API de Google).
  - `scope = "series"` → afecta al evento maestro y, por tanto, a todas las ocurrencias futuras.
- El agente debe **inferir el scope** desde la frase del usuario y reflejarlo en el resumen que se muestra en el card de confirmación:
  - *"cancela la reunión del lunes que viene"* → `scope: "instance"`.
  - *"cancela la reunión semanal de los lunes"* → `scope: "series"`.
  - En caso de ambigüedad, el agente debe preguntar antes de pedir confirmación.
- El card de confirmación debe indicar de forma explícita el alcance ("Esta acción afectará **solo a esa ocurrencia**" vs. "Esta acción afectará **toda la serie**").

#### 6.4. Listado y conflictos

- `gcal_list_events` debe expandir las recurrencias dentro del rango consultado (parámetro `singleEvents=true` de la API), de modo que el agente pueda razonar sobre instancias concretas y detectar conflictos de horario antes de crear una nueva serie.
- Antes de crear un evento recurrente, la tool debe revisar el rango cubierto por las primeras N ocurrencias (configurable, por defecto 8 semanas) e informar al modelo sobre conflictos relevantes en el resumen del card de confirmación.

---

### 7. Pedir confirmación en acciones sensibles

- Las acciones que crean, modifican o eliminan eventos deben pedir aprobación antes de ejecutarse.
  - En web: mostrar el mismo *card* de confirmación con botones de *Aprobar* y *Cancelar*.
  - En Telegram: usar los mismos *inline buttons*.
- Reutilizar el flujo `ConfirmationRequiredError` ya implementado para GitHub. La capa de confirmación debe ser provider-agnóstica.

---

### 8. Evitar el loop de confirmación

- Cuando una herramienta de Calendar necesite confirmación:
  - El grafo debe detenerse de inmediato.
  - Debe devolver el mismo resultado estructurado `{ pendingConfirmation: { ... } }` que GitHub.
  - La confirmación solo se resuelve con botones de UI, nunca con texto libre.
  - La API debe seguir identificando la confirmación pendiente por el campo estructurado, **no** por *string matching*.

---

### 9. Pasar el token al agente

- Las rutas que llaman al agente, como `/api/chat` y el *webhook* de Telegram, deben:
  - Cargar la integración de Google del usuario.
  - Descifrar el *access token* (refrescándolo si está vencido) en servidor.
  - Pasarlo al agente en el `IntegrationsContext` ya existente, en un campo separado (`google.accessToken`), nunca en el historial de mensajes.
- Las tools de Calendar deben leer ese campo, igual que las de GitHub leen `github.accessToken`.

---

## Criterios de aceptación

- [ ] El usuario puede conectar y desconectar su cuenta de Google desde *Settings*, y el estado (email, scopes) se refleja correctamente tras refrescar.
- [ ] En base de datos, ningún token aparece en texto plano; el cifrado funciona con `OAUTH_ENCRYPTION_KEY`.
- [ ] El *access token* se renueva automáticamente con el *refresh token* antes de expirar, sin intervención del usuario.
- [ ] Si el *refresh token* deja de ser válido, la integración se marca como desconectada de forma explícita.
- [ ] Las cinco tools de Calendar operan contra la API real con los permisos del usuario conectado y respetan la zona horaria.
- [ ] El agente puede crear eventos recurrentes a partir de frases en lenguaje natural (*"todos los lunes a las 10am"*, *"de lunes a viernes a las 9"*, *"cada dos semanas los miércoles"*), traduciéndolas a una `RRULE` válida.
- [ ] Modificar o eliminar un evento perteneciente a una serie permite distinguir entre **una sola ocurrencia** y **toda la serie**, y el alcance se muestra de forma explícita en el card de confirmación.
- [ ] `gcal_list_events` expande las recurrencias dentro del rango consultado para que el agente pueda razonar sobre instancias concretas y detectar conflictos antes de crear una nueva serie.
- [ ] Crear, modificar o eliminar un evento desde el agente dispara confirmación (card en web, inline buttons en Telegram) y no ejecuta hasta que el usuario aprueba.
- [ ] La API identifica el estado de "pendiente de confirmación" mediante el resultado estructurado del grafo, no por *string matching*.
- [ ] Ningún token aparece en respuestas del cliente, en logs, ni en el historial de mensajes del agente.
- [ ] La arquitectura permite agregar nuevos scopes/APIs de Google (Sheets, Drive, etc.) sobre la misma conexión sin migración de datos.
