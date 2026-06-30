# Plan de Implementación — Integración de Google Sheets

Documento de plan **previo a implementación**. Replica el patrón consolidado para Google Calendar ([../calendar/plan.md](../calendar/plan.md)) y se basa en el [brief.md](brief.md).

> **Estado:** `Draft`. Cuando se complete cada fase, marcar los checkboxes y al final consolidar como **as-built**.

---

## 0. Resumen

- Nueva integración Sheets sobre la base OAuth de Google existente (Calendar).
- 5 tools (`gsheets_*`): 2 de lectura (`low`), 3 de escritura (`medium`). Sin tools `high` en esta iteración.
- Cliente REST con `fetch` nativo, mirror exacto de `google-calendar.ts`.
- Cambio de scope OAuth: agrega `spreadsheets` (y `drive.file` solo si lo requiere `createSpreadsheet`). Esto invalida los tokens existentes — los usuarios deben reconectar Google.

---

## 1. Decisiones de diseño

| Tema | Decisión | Por qué |
|---|---|---|
| Scope OAuth | Agregar `https://www.googleapis.com/auth/spreadsheets` al array `GOOGLE_OAUTH_SCOPES` de `apps/web/src/lib/google/oauth.ts`. Validar en spike si `createSpreadsheet` requiere `drive.file` o si `spreadsheets` solo basta. | Reusar el mismo OAuth client + misma fila en `user_integrations` (ya lo previene el comentario actual de `oauth.ts:7-9`). |
| Manejo de re-consentimiento | Aceptar que los tokens existentes queden invalidados — el `prompt=consent` + scope nuevo fuerzan el flujo de re-conexión en Settings. Documentarlo en CHANGELOG y agregar mensaje en UI si detectamos scope insuficiente. | El brief lo marca como riesgo Alta (#1). No vale la pena un mecanismo separado de upgrade de scope. |
| Detección de scope insuficiente | El cliente Sheets debe traducir `403` con `error.status == "PERMISSION_DENIED"` o `error.errors[].reason == "insufficientPermissions"` en un mensaje accionable: *"Reconectá Google en Settings para autorizar Sheets."*. | Brief, sección 4 "Reglas específicas". |
| `spreadsheetId` | Siempre lo provee el usuario o lo devuelve `gsheets_create_spreadsheet`. NO se busca por nombre, NO se infiere. Validación: regex base64-like (`^[A-Za-z0-9_-]{20,}$`). | Brief, riesgo #2. |
| Rango A1 | Validación superficial con regex antes de llamar a la API. Acepta `Hoja!A1:B10`, `Hoja!A:A`, `A1:B10`, etc. | Brief, sección 4. |
| `valueInputOption` | Default `USER_ENTERED`. La tool de escritura expone el parámetro como `value_input_option` opcional con enum `["RAW", "USER_ENTERED"]`. | Brief, sección 4. |
| `append` insert mode | Hardcoded `insertDataOption=INSERT_ROWS` — no expuesto al LLM. | Brief, sección 4. |
| Sanity check de tamaño | Si una operación de escritura tiene >10.000 celdas (`rows × cols`), abortar antes de llamar a la API con error legible. | Brief, sección 4. |
| Riesgo y HITL | `read`/`list_sheets` → `low` (sin confirmación). `append`/`update`/`create_spreadsheet` → `medium` (confirmación). | Brief, sección 2. La capa HITL es genérica y ya soporta `medium`. |
| Summary HITL | Cada tool de escritura aporta su summary específico en `summariseToolCall` con: tipo de operación, spreadsheetId truncado, rango y nº de celdas afectadas (cuando aplica). | Consistencia con summaries de `gcal_*`. |
| Sin tests unitarios | El monorepo no tiene framework de tests. Postergado, igual que en Calendar. | Decisión heredada (../calendar/plan.md, Follow-ups). |

---

## 2. Contratos del cliente (`integrations/google-sheets.ts`)

API base: `https://sheets.googleapis.com/v4`

```ts
// Lectura
listSheets(token, { spreadsheetId }) →
  { sheets: { title: string; sheetId: number; gridProperties?: { rowCount; columnCount } }[] }

readRange(token, { spreadsheetId, range, valueRenderOption? }) →
  { range: string; values: (string | number | boolean)[][] }

// Escritura
appendRow(token, { spreadsheetId, range, values, valueInputOption? }) →
  { updatedRange: string; updatedRows: number; updatedCells: number }

updateRange(token, { spreadsheetId, range, values, valueInputOption? }) →
  { updatedRange: string; updatedRows: number; updatedCells: number }

createSpreadsheet(token, { title, sheets? }) →
  { spreadsheetId; spreadsheetUrl; sheets: { title; sheetId }[] }
```

Helpers internos:

- `sheetsFetch<T>(token, path, init)` — análogo a `gcalFetch`, error `"Google Sheets error <status> on <method> <path>: <body truncado a 200 chars>"`.
- `assertA1(range: string)` — regex permissive: `^([^!]+!)?[A-Z]+\d*(:[A-Z]+\d*)?$`. Lanza con mensaje claro si no matchea.
- `assertSpreadsheetId(id: string)` — regex `^[A-Za-z0-9_-]{20,}$`.
- `assertWriteSize(values: unknown[][])` — calcula celdas totales (recursivo si es 2D); lanza si >10.000.
- `mapSheetsError(err, status, body)` — detecta 403/insufficientPermissions y lanza con el mensaje accionable de re-conexión.

---

## 3. Fases

### Fase 1: Spike del scope OAuth ⬜

Antes de tocar código de producción:

- [ ] Verificar en docs si `spreadsheets.create` necesita `drive.file` además de `spreadsheets`. Si lo necesita, agregarlo a `GOOGLE_OAUTH_SCOPES`.
- [ ] Confirmar que crear un spreadsheet con sólo scope `spreadsheets` deja el archivo accesible al usuario (debería: la API de Sheets lo crea en el Drive del propietario del token).

**Salida**: lista definitiva de scopes a agregar.

### Fase 2: Cliente REST `integrations/google-sheets.ts` ⬜

- [ ] Crear `packages/agent/src/integrations/google-sheets.ts` espejo de `google-calendar.ts`:
  - Constante `GSHEETS_API = "https://sheets.googleapis.com/v4"`.
  - `sheetsFetch<T>` con `Authorization: Bearer`, `Content-Type: application/json` cuando hay body, manejo de 204, error con `status + method + path + body[0..200]`.
  - Helpers `assertA1`, `assertSpreadsheetId`, `assertWriteSize`, `mapSheetsError`.
  - Tipos exportados: `SheetTab`, `SpreadsheetSummary`, `ValueRange`, `AppendResult`, `UpdateResult`, `CreateSpreadsheetResult`.
  - Funciones públicas: `listSheets`, `readRange`, `appendRow`, `updateRange`, `createSpreadsheet`.
- [ ] No exporta `accessToken` ni lo loggea. Errores 403 por scope → mensaje "Reconectá Google en Settings para autorizar Sheets" propagado al LLM.

### Fase 3: Scope OAuth y reconexión ⬜

- [ ] `apps/web/src/lib/google/oauth.ts`:
  - Agregar `"https://www.googleapis.com/auth/spreadsheets"` (y `drive.file` si la Fase 1 lo confirma) al array `GOOGLE_OAUTH_SCOPES`.
  - Eliminar/actualizar el comentario de `oauth.ts:7-9` que dice "adding more scopes later (Sheets, Drive) reuses the same OAuth client" → mencionar que Sheets ya se agregó y Drive se agregará si futuras tools lo necesitan.
- [ ] Settings UI: mantener la lista de scopes mostrada al usuario en la sección Google ya conectada (debería rendererizar el nuevo scope automáticamente al venir del backend).
- [ ] No requiere migración de DB. La columna `scopes` en `user_integrations` ya almacena lo que devolvió Google en `tokenResponse.scope`.

### Fase 4: Catálogo de tools ⬜

Agregar a `packages/agent/src/tools/catalog.ts`, después del bloque `gcal_*`:

- [ ] `gsheets_list_sheets` — risk `low`, requires_integration `"google"`. Args: `{ spreadsheet_id: string }`.
- [ ] `gsheets_read_range` — risk `low`. Args: `{ spreadsheet_id, range, value_render_option? }`.
- [ ] `gsheets_append_row` — risk `medium`. Args: `{ spreadsheet_id, range, values: array, value_input_option? }`.
- [ ] `gsheets_update_range` — risk `medium`. Args: `{ spreadsheet_id, range, values: 2D array, value_input_option? }`.
- [ ] `gsheets_create_spreadsheet` — risk `medium`. Args: `{ title, sheets?: [{ title }] }`.

Descripciones en español claras: incluir el aviso de que `USER_ENTERED` interpreta strings empezando por `=` como fórmulas (riesgo #4 del brief).

### Fase 5: Adapters (`tools/adapters.ts`) ⬜

- [ ] Importar el nuevo cliente: `import { ... } from "../integrations/google-sheets"`.
- [ ] 5 wrappers `tool()` con schemas Zod (`nullable().optional()` en los opcionales, como en los wrappers de Calendar).
- [ ] Los 2 de lectura crean `toolCall` con `createToolCall` y reportan con `updateToolCallStatus` (patrón `gcal_list_events`).
- [ ] Los 3 de escritura NO crean `toolCall`: la pendiente la maneja `toolExecutorNode` cuando hay HITL.
- [ ] Agregar ramas en `summariseToolCall`:
  - `gsheets_append_row` → *"Agregar 1 fila a `<spreadsheetId 8 chars>…!<range>` (N celdas)."*
  - `gsheets_update_range` → *"Sobrescribir `<spreadsheetId 8 chars>…!<range>` con N filas × M cols (R celdas)."*
  - `gsheets_create_spreadsheet` → *"Crear spreadsheet «<title>» con N pestañas: <lista de títulos>."*
- [ ] Reusar `requireGoogleToken(ctx)` existente.
- [ ] El sanity check de 10.000 celdas vive en el cliente (no en el adapter), para protegerse también de invocaciones futuras (ej. tareas programadas).

### Fase 6: Settings UI ⬜

- [ ] `apps/web/src/app/settings/settings-form.tsx`: agregar las 5 tools al array `TOOL_IDS`:
  ```ts
  "gsheets_list_sheets",
  "gsheets_read_range",
  "gsheets_append_row",
  "gsheets_update_range",
  "gsheets_create_spreadsheet",
  ```
- [ ] Verificar que el panel Google ya renderice los scopes nuevos (debería: ya itera sobre `google.scopes`).
- [ ] No se necesita panel nuevo: Sheets reusa la conexión Google. Si la integración está conectada con scopes viejos (sin `spreadsheets`), las tools fallarán con el mensaje accionable del cliente; el usuario debe pulsar "Desconectar" y "Conectar" otra vez.
- [ ] **Opcional (nice-to-have)**: detectar en `settings/page.tsx` si el array `scopes` del integration no incluye `spreadsheets` y mostrar un banner "Reconectá Google para habilitar Sheets". Solo si encaja sin estirar el alcance.

### Fase 7: Documentación ⬜

- [ ] `README.md` principal — actualizar el actual *"Paso 9 — Google Calendar (opcional)"* (`README.md:157-170`) para que cubra la suite Google completa:
  - Renombrar a *"Paso 9 — Integraciones de Google (opcional)"*.
  - Mantener la sub-sección de Calendar tal cual.
  - Agregar sub-sección *"Google Sheets"* con los pasos en Google Cloud Console:
    1. Habilitar **Google Sheets API** en el proyecto (link a `console.cloud.google.com/apis/library/sheets.googleapis.com`).
    2. (Opcional preventivo) habilitar también **Google Drive API** y **Gmail API** para tools futuras; habilitarlas no otorga permisos por sí solo.
    3. En *OAuth consent screen → Scopes*, agregar `.../auth/spreadsheets` (clasificado como **sensitive** por Google).
    4. Confirmar que la cuenta de prueba sigue en *Test users* si el consent screen está en modo Testing.
    5. **Si ya tenías Google conectado por Calendar**: desconectar en *Ajustes → Google → Desconectar* y volver a conectar para autorizar el scope nuevo (el `prompt=consent` ya fuerza el re-consentimiento).
  - Mencionar el scope completo solicitado tras este PR: `openid email .../auth/calendar.events .../auth/spreadsheets`.
- [ ] `packages/agent/README.md`: nueva sección "Google Sheets tools" listando las 5 tools con un ejemplo de prompt cada una. Si no existe README de `packages/agent`, agregar la sección al README principal del proyecto.
- [ ] `CHANGELOG.md`: entrada en `[Unreleased]`:
  - `Added`: 5 tools `gsheets_*`, cliente `integrations/google-sheets.ts`.
  - `Changed`: `GOOGLE_OAUTH_SCOPES` ahora incluye `spreadsheets` (y `drive.file` si aplica) — **los usuarios deben reconectar Google**.
- [ ] `docs/plan.md`: agregar Fase 9 "Google Sheets" apuntando a este documento.
- [ ] Marcar el brief con `> Estado: implementado.` y enlazar a este plan al cierre.

### Fase 8: Verificación ⬜

- [ ] `npm run type-check` en `packages/agent` y `apps/web` sin errores.
- [ ] `npm run lint` en `apps/web`.
- [ ] Smoke manual (requiere `npm run dev` y reconexión OAuth):
  1. Desconectar y reconectar Google en Settings → el callback persiste los scopes nuevos.
  2. Tool `gsheets_list_sheets` sobre un spreadsheet real → devuelve las pestañas.
  3. Tool `gsheets_read_range` → devuelve los valores.
  4. Tool `gsheets_append_row` → dispara card HITL → aprobar → fila aparece en la hoja.
  5. Tool `gsheets_update_range` → HITL → aprobar → celdas actualizadas.
  6. Tool `gsheets_create_spreadsheet` → HITL → aprobar → spreadsheet nuevo en Drive del usuario.
  7. Usar un `spreadsheet_id` inválido → error legible (no stack trace).
  8. Con un usuario que NO reconectó Google → la primera tool de Sheets debe responder con "Reconectá Google en Settings…".

---

## 4. Archivos esperados

### Nuevos (1)

- `packages/agent/src/integrations/google-sheets.ts`

### Modificados (~6)

- `apps/web/src/lib/google/oauth.ts` — scopes nuevos.
- `packages/agent/src/tools/catalog.ts` — 5 entradas `gsheets_*`.
- `packages/agent/src/tools/adapters.ts` — 5 wrappers + ramas en `summariseToolCall`.
- `apps/web/src/app/settings/settings-form.tsx` — `TOOL_IDS` extendido.
- `README.md` (raíz del proyecto) — actualizar Paso 9 con la sub-sección de Google Sheets (Cloud Console + scope + reconexión).
- `packages/agent/README.md` — sección "Google Sheets tools" con las 5 tools y un ejemplo de prompt cada una.
- `CHANGELOG.md` — entrada en `[Unreleased]`.
- `docs/plan.md` — referencia a esta fase.
- `docs/features/google-sheets/brief.md` — header de estado.

### Reusados sin tocar

- `packages/db/*` — schema de `user_integrations`, cifrado, refresh-token flow.
- `apps/web/src/lib/google/access-token.ts` — `ensureFreshGoogleAccessToken` funciona igual con scopes extra.
- `apps/web/src/lib/agent/integrations-context.ts` — el bloque Google ya pasa `accessToken` y `timeZone`; Sheets no necesita nada más.
- `packages/agent/src/graph.ts` — `toolExecutorNode` ya intercepta `medium`/`high` con la HITL genérica.
- `apps/web/src/app/chat/chat-interface.tsx`, webhook de Telegram, `/api/chat/confirm` — confirmación genérica.

---

## 5. Riesgos durante la implementación

| # | Riesgo | Mitigación |
|---|---|---|
| 1 | `drive.file` resulta necesario para `createSpreadsheet` y no se descubre hasta el smoke | Spike Fase 1 antes de tocar nada. Si se descubre tarde, agregarlo al scope es una línea + reconexión. |
| 2 | El LLM manda `values` con tipos mezclados o forma rara (ej. objetos en vez de strings) | Schema Zod con `z.array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])))` en `update`; `z.array(...)` plana en `append`. |
| 3 | El summary de HITL para `update_range` puede ser ilegible si los valores son largos | El summary no muestra los valores, sólo dimensiones (filas × cols) y rango. Si se quiere preview, mostrar primeras 3 celdas truncadas a 40 chars cada una. |
| 4 | Olvidarse de actualizar `TOOL_IDS` en Settings → las toggles no aparecen | Checklist en Fase 6; verificación manual en Fase 8 paso 1. |
| 5 | Tokens existentes (Calendar) quedan inválidos en silencio si el usuario no reconecta antes de pedir Sheets | Mensaje accionable del cliente + opcional banner en Settings (Fase 6 opcional). |

---

## 6. Definition of Done (resumen del brief)

- [ ] `type-check` y `lint` verdes en `packages/agent` y `apps/web`.
- [ ] TypeScript estricto, sin `any` en código nuevo.
- [ ] Sin ids ni rangos hardcodeados.
- [ ] `accessToken` no aparece en ningún `console.log` nuevo.
- [ ] README lista las 5 tools con un ejemplo de prompt cada una.
- [ ] Smoke end-to-end (Fase 8) pasa.
- [ ] Las 3 tools de escritura disparan HITL (verificado vía `toolRequiresConfirmation`).
- [ ] Sin Google conectado → error estándar de "integración no configurada" (manejado por `requireGoogleToken`).
- [ ] `spreadsheet_id` inválido → mensaje legible para el LLM.
- [ ] 403 por scope → mensaje "reconectar Google".

---

## 7. Referencias

- Brief: [`brief.md`](brief.md).
- Patrón de cliente: `packages/agent/src/integrations/google-calendar.ts`.
- Patrón de plan: [`../calendar/plan.md`](../calendar/plan.md).
- Issue: #6 — Tool: Google Sheets.
- Docs API v4:
  - `spreadsheets.values.get`
  - `spreadsheets.values.append`
  - `spreadsheets.values.update`
  - `spreadsheets.create`
  - `spreadsheets.get`
