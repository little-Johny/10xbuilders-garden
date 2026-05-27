# Technical Brief — Implementación de Google Sheets tool

## 0. Snapshot

| Campo | Valor |
|---|---|
| Fecha | 22-05-2026 |
| Tipo | `Integración` |
| Stack principal | `LangGraph`, `Google Sheets API v4` |
| Estado | `Draft` |

---

## 1. Contexto

### ¿Qué existe hoy?

Tenemos un agente construido con LangGraph (`packages/agent/src/graph.ts`) con los nodos `_start_`, `_compaction_`, `_agent_`, `_tool_` y `_end_`. El catálogo de tools (`packages/agent/src/tools/catalog.ts`) ya incluye integraciones con GitHub y Google Calendar; ambas usan el mismo patrón: un módulo en `packages/agent/src/integrations/` que recibe el `accessToken` del usuario y golpea la API REST directamente, con manejo de errores que lanza con `status + path + body truncado`.

La integración con Google ya está cableada para OAuth (Calendar usa `requires_integration: "google"` con scope de calendar). El usuario ya autoriza Google al conectar Calendar, así que extenderemos esa autorización para incluir Sheets.

### Objetivo

Crear una nueva integración para consultar, modificar y crear archivos de Google Sheets desde el agente. El usuario debe poder pedir cosas como "lee la hoja X y dime el total de la columna Y", "anota esta fila en mi hoja de gastos", o "créame una hoja nueva para registrar lecturas".

### Usuarios / Consumidores

- **Usuario final del agente** (interfaz web y Telegram). Las tools se invocan desde el LLM dentro del nodo `_agent_`, no por API directa.
- La integración la consume **el propio agente**, no servicios externos.

---

## 2. Alcance

### Dentro del alcance

- [ ] Módulo `packages/agent/src/integrations/google-sheets.ts` con cliente REST mínimo, mismo patrón que `google-calendar.ts` (función `sheetsFetch` + tipos + funciones por operación).
- [ ] Tools nuevas en `packages/agent/src/tools/catalog.ts` con `requires_integration: "google"`:
  - `gsheets_read_range` (risk: low) — lee un rango A1 de una hoja.
  - `gsheets_append_row` (risk: medium) — añade una fila al final de una hoja.
  - `gsheets_update_range` (risk: medium) — sobreescribe un rango A1.
  - `gsheets_create_spreadsheet` (risk: medium) — crea un spreadsheet nuevo con título y opcionalmente hojas iniciales.
  - `gsheets_list_sheets` (risk: low) — lista las hojas (tabs) de un spreadsheet por id.
- [ ] Ampliación del scope OAuth de Google para incluir `https://www.googleapis.com/auth/spreadsheets` (y `drive.file` solo si crear archivos lo requiere).
- [ ] Wiring de las nuevas tools en `tools/adapters.ts` (o donde se resuelvan las invocaciones a la integración) siguiendo el patrón existente de Google Calendar.
- [ ] Documentación breve en el README de `packages/agent` listando las tools nuevas.

### Fuera del alcance

- [ ] UI para administrar permisos de Sheets (se asume que se reutiliza la pantalla actual de conexión a Google).
- [ ] Soporte de Google Drive completo (mover/borrar archivos, búsqueda por nombre). Solo se crea spreadsheets nuevos.
- [ ] Formato condicional, gráficos, validaciones de celdas, fórmulas avanzadas, named ranges, protección de rangos.
- [ ] Compartir el spreadsheet con otros emails (sólo queda en la cuenta del usuario que autorizó).
- [ ] Subida o exportación a CSV/XLSX.
- [ ] Streaming o cambios en tiempo real (webhooks de Sheets).

---

## 3. Stack & Arquitectura

### 3.1 Stack

| Capa | Tecnología |
|---|---|
| Lenguaje | TypeScript estricto |
| Orquestación | LangGraph (`@langchain/langgraph` ^0.2) |
| LLM | OpenRouter (modelo `:free` fijo, ver memoria del proyecto) |
| Persistencia checkpoint | Postgres (`@langchain/langgraph-checkpoint-postgres`) |
| Validación | Zod |
| Integración externa | Google Sheets API v4 (REST, `fetch` nativo) |
| Auth | OAuth 2.0 (token de acceso almacenado por el sistema de integraciones existente) |

Sin librerías cliente extra de Google: se usa `fetch` directo, igual que `google-calendar.ts`.

### 3.2 Arquitectura — diagrama en texto

```
[Usuario] (web / telegram)
    ↓
[LangGraph: _start_ → _compaction_ → _agent_]
    ↓ tool_call: gsheets_*
[Nodo _tool_]
    ↓ resuelve adapter
[tools/adapters.ts → integrations/google-sheets.ts]
    ↓ fetch(Authorization: Bearer <access_token>)
[Google Sheets API v4 — https://sheets.googleapis.com/v4]
    ↓ JSON
[Resultado serializado → _agent_]
    ↓
[Respuesta al usuario]
```

El `access_token` se obtiene del registro de integración del usuario (mismo path que ya usa Google Calendar). Si la integración no está conectada, el nodo `_tool_` debe responder con el error existente de "integración no configurada" antes de llegar a la API.

### 3.3 Contratos de datos

Las tools se invocan vía tool-calls del LLM; los `parameters_schema` viven en `catalog.ts` como JSON Schema. Estos son los contratos de la capa de integración (`integrations/google-sheets.ts`).

```ts
// READ
readRange(accessToken, {
  spreadsheetId: string;
  range: string;            // A1, ej: "Hoja 1!A1:C20"
  valueRenderOption?: "FORMATTED_VALUE" | "UNFORMATTED_VALUE" | "FORMULA";
}) → { range: string; values: string[][] }

// APPEND
appendRow(accessToken, {
  spreadsheetId: string;
  range: string;            // suele ser el nombre de la hoja, ej: "Gastos!A:D"
  values: (string | number | boolean | null)[];
}) → { updatedRange: string; updatedRows: number; updatedCells: number }

// UPDATE
updateRange(accessToken, {
  spreadsheetId: string;
  range: string;
  values: (string | number | boolean | null)[][];
  valueInputOption?: "RAW" | "USER_ENTERED";   // default USER_ENTERED
}) → { updatedRange: string; updatedRows: number; updatedCells: number }

// CREATE SPREADSHEET
createSpreadsheet(accessToken, {
  title: string;
  sheets?: { title: string }[];   // tabs iniciales
}) → { spreadsheetId: string; spreadsheetUrl: string; sheets: { title: string; sheetId: number }[] }

// LIST SHEETS
listSheets(accessToken, {
  spreadsheetId: string;
}) → { sheets: { title: string; sheetId: number; gridProperties?: { rowCount: number; columnCount: number } }[] }
```

Errores: todas las funciones lanzan `Error` con mensaje `"Google Sheets error <status> on <method> <path>: <body truncado a 200 chars>"`, igual que `google-calendar.ts`. El nodo `_tool_` ya tiene el manejo genérico para convertirlo en respuesta al LLM.

---

## 4. Constraints

### Reglas fijas (no negociables en todos los proyectos)

- TypeScript estricto, sin `any`. Interfaces definidas para request/response.
- Adapter Pattern: toda llamada a Sheets pasa por `integrations/google-sheets.ts`. El nodo `_tool_` nunca habla directo con la API.
- Sin valores hardcodeados: `GOOGLE_SHEETS_API` y scopes en constantes del módulo o en `.env` cuando corresponda.
- Credenciales (`accessToken`) recibidas por parámetro; nunca se loggean ni se almacenan dentro del módulo de integración.
- Errores con `status + path + body truncado`, no propagar el body completo (puede contener PII).
- Tools con efecto de escritura → `risk: "medium"` mínimo, para que pasen por la confirmación HITL existente.

### Reglas específicas de esta tarea

- [ ] El `spreadsheetId` SIEMPRE lo provee el usuario (o se obtiene de una invocación previa de `gsheets_create_spreadsheet`). El agente NO debe inventar IDs ni intentar buscar por nombre.
- [ ] El rango A1 se valida superficialmente (regex `^[^!]+!?[A-Z]+\d*(:[A-Z]+\d*)?$` o similar) antes de llamar a la API, para fallar rápido con un error claro en vez de un 400 de Google.
- [ ] `gsheets_append_row` usa el modo `INSERT_ROWS` de la API (`insertDataOption=INSERT_ROWS`) — nunca `OVERWRITE` — para no pisar filas siguientes.
- [ ] `valueInputOption` default `USER_ENTERED` (interpreta `=SUMA(...)`, fechas, etc.). El agente puede pedir `RAW` explícitamente si lo necesita.
- [ ] Si el scope OAuth actual no incluye `spreadsheets`, la integración debe fallar con un mensaje accionable ("reconectá Google para autorizar Sheets") en vez de un 403 genérico.
- [ ] Si una operación de escritura devuelve >10.000 celdas afectadas, abortar antes de mandar el request (sanity check; las hojas grandes deberían dividirse en varias llamadas).

---

## 5. Riesgos & Supuestos

| # | Riesgo / Supuesto | Probabilidad | Mitigación |
|---|---|---|---|
| 1 | El scope OAuth de Google actual solo cubre Calendar; agregar `spreadsheets` invalida los tokens existentes y obliga a re-consentimiento | Alta | Documentar la migración; mostrar mensaje claro al usuario; reusar el flujo de reconexión ya existente |
| 2 | El LLM alucina `spreadsheetId` o nombres de hoja | Media | Validar formato del id (regex base64-like); en `read`/`update` devolver el error 404 de Google sin reintentar |
| 3 | El usuario pide modificar una hoja muy grande y se exceden los rate limits de Sheets (60 req/min/user) | Baja-Media | No reintentar agresivamente; propagar 429 al agente para que informe al usuario |
| 4 | `USER_ENTERED` interpreta strings como fórmulas si empiezan con `=` y rompe datos | Media | Documentar el comportamiento en el `description` de la tool; permitir `RAW` como override |
| 5 | Supuesto: el flujo de integraciones existente expone el `accessToken` de Google de la misma forma que para Calendar | Alta | Verificar en `tools/adapters.ts` antes de implementar; si no, ajustar primero |
| 6 | Crear spreadsheets sin scope `drive.file` puede fallar | Media | Validar en spike inicial; si requiere `drive.file`, agregarlo al scope |

---

## 6. Definition of Done

### Siempre se cumplen

- [ ] Linter pasa sin errores (`npm run type-check` en `packages/agent`).
- [ ] TypeScript estricto, sin `any`.
- [ ] Sin valores hardcodeados en lógica (ids, ranges).
- [ ] `accessToken` nunca se loggea.
- [ ] `.env.example` actualizado si se agregan variables nuevas (no esperado, pero verificar).
- [ ] README de `packages/agent` lista las nuevas tools `gsheets_*` con un ejemplo de uso por cada una.

### Criterios específicos de esta tarea

- [ ] Una conversación de prueba con el agente puede: (a) leer un rango de una hoja real, (b) añadir una fila, (c) actualizar un rango, (d) crear una hoja nueva, (e) listar las tabs de una hoja existente — todo sin tocar código adicional.
- [ ] Las tools de escritura (`append`, `update`, `create`) disparan la confirmación HITL existente (`toolRequiresConfirmation` devuelve true).
- [ ] Si el usuario no ha conectado Google, la tool falla con el mismo error estándar que ya devuelve Calendar al estar desconectado.
- [ ] Un `spreadsheetId` inválido produce un error legible para el LLM (no un stack trace crudo).
- [ ] Los errores 403 por scope insuficiente devuelven un mensaje accionable que mencione "reconectar Google".

---

## 7. Referencias & Notas

- Patrón de referencia (cliente REST): `packages/agent/src/integrations/google-calendar.ts`.
- Catálogo donde se registran las tools nuevas: `packages/agent/src/tools/catalog.ts`.
- API base: `https://sheets.googleapis.com/v4`.
- Docs principales:
  - `spreadsheets.values.get` (read)
  - `spreadsheets.values.append` (insert row)
  - `spreadsheets.values.update` (overwrite range)
  - `spreadsheets.create` (new file)
  - `spreadsheets.get` (list sheets / metadata)
- Issue relacionado: #6 — Tool: Google Sheets.
- Memoria de proyecto: el modelo del agente está fijado al tier `:free` de OpenRouter; cualquier prompt nuevo para el LLM debe poder correr ahí sin degradar la experiencia.
