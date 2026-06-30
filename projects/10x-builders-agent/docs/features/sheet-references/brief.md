# Technical Brief — Referencias de hojas (Sheet References)

## 0. Snapshot

| Campo | Valor |
|---|---|
| Fecha | 29-06-2026 |
| Tipo | `Feature` (persistencia + contexto del agente) |
| Stack principal | `Postgres/Supabase`, `LangGraph`, `Next.js` |
| Estado | `Implementado` |

---

## 1. Contexto

### ¿Qué existe hoy?

Las tools `gsheets_*` (ver [../google-sheets/brief.md](../google-sheets/brief.md)) reciben el `spreadsheetId` como parámetro en **cada** invocación y no lo persisten en ningún lado. El brief de Google Sheets lo fijó como regla: *"el spreadsheetId SIEMPRE lo provee el usuario … el agente NO debe inventar IDs ni buscar por nombre"*.

Consecuencia práctica: el usuario tiene que pegar el ID (o la URL) cada vez que arranca una conversación nueva. Dentro de una misma sesión el agente reusa el ID porque queda en el contexto, pero al abrir una conversación nueva (web, Telegram, o un disparo de `scheduled_tasks`) se pierde.

Hoy existen dos mecanismos parciales para "recordar" un ID, ambos insuficientes:

- **System prompt por usuario** (`profiles.agent_system_prompt`): editable en Ajustes, se inyecta cada turno vía `buildSystemPrompt` en `apps/web/src/lib/agent/load-context.ts`. Limitación: capado a 500 chars y mezcla "personalidad" con "datos". Sirve para 1–2 hojas, no más.
- **Memoria a largo plazo** (`memories` + pgvector): probabilística. Depende de que el retrieval por similitud (top-K, default 6) traiga el recuerdo. No es confiable para datos que el usuario espera disponibles *siempre*.

### Objetivo

Permitir que el usuario **registre sus hojas una vez** (alias legible + `spreadsheetId` + pestaña por defecto + descripción semántica de "cuándo usarla") y que el agente las **resuelva por nombre/intención** en cualquier conversación, sin que el usuario vuelva a pegar el ID. Ejemplos:

- *"Limpiá la hoja de progreso desde la fila 2"* → el agente resuelve `progreso` → `spreadsheetId` + pestaña `progress_tracker`.
- *"Anotá 20 kg en press banca en mi hoja del gym"* → resuelve `gym` → su `spreadsheetId`, y llama `gsheets_append_row`.

### Mecanismo de resolución elegido (Opción A)

**Inyección del catálogo en el contexto del turno** (determinista), NO búsqueda por embeddings. En cada turno, `loadAgentContext` agrega un bloque `[HOJAS DEL USUARIO]` al system prompt con la lista de hojas registradas. El LLM lee alias + descripción y mapea la intención del usuario al `spreadsheetId` correcto, luego llama las tools `gsheets_*` existentes con ese ID.

Se descartó la búsqueda semántica por embeddings (Opción B) por sobreingeniería: para un puñado de hojas el matching lo hace el modelo gratis, y mantenerlo determinista evita el comportamiento probabilístico que ya tiene la memoria. Reevaluar solo si un usuario llega a ~100+ hojas.

### Usuarios / Consumidores

- **Usuario final** (web y Telegram): registra y referencia sus hojas conversando con el agente.
- **El propio agente**: consume el bloque inyectado para resolver IDs; usa tools nuevas para gestionar el registro.

---

## 2. Alcance

### Dentro del alcance

- [ ] Tabla `user_sheets` en Postgres (migración nueva `00008`), con RLS por usuario.
- [ ] Inyección de un bloque `[HOJAS DEL USUARIO]` en el system prompt vía `loadAgentContext` / `buildSystemPrompt` (`apps/web/src/lib/agent/load-context.ts`), presente en todos los canales (web, Telegram, scheduled).
- [ ] Tools nuevas para que el agente gestione el registro conversando:
  - `gsheets_save_reference` (risk: medium) — registra/actualiza una hoja (alias, spreadsheet_id, default_tab?, description?).
  - `gsheets_list_references` (risk: low) — lista las hojas registradas del usuario.
  - `gsheets_delete_reference` (risk: medium) — elimina una referencia por alias.
- [ ] Funciones de acceso a DB en `packages/db` (`listUserSheets`, `upsertUserSheet`, `deleteUserSheet`) siguiendo el patrón de `getUserToolSettings`/`upsertToolSetting`.
- [ ] **Auto-registro al crear**: extender la tool existente `gsheets_create_spreadsheet` (de la feature Google Sheets) con un parámetro opcional `register_as` (alias). Si se pasa, tras crear el spreadsheet se registra automáticamente la referencia en `user_sheets` con el `spreadsheetId` recién devuelto, en la misma invocación (una sola confirmación HITL). Toca `packages/agent/src/tools/catalog.ts` y `tools/adapters.ts`.
- [ ] Documentación: CHANGELOG, sección breve en README, y este brief + plan.

### Fuera del alcance

- [ ] Tool de limpiar/borrar rangos (`gsheets_clear_range`) — es una feature independiente; esta solo resuelve *qué hoja*, no *qué acción*.
- [ ] Búsqueda semántica por embeddings sobre las descripciones (Opción B).
- [ ] UI dedicada en Ajustes para CRUD de hojas (nice-to-have; ver Riesgos). El MVP gestiona el registro vía tools conversacionales.
- [ ] Compartir referencias entre usuarios o equipos.
- [ ] Validar que el `spreadsheetId` guardado siga existiendo/accesible (se valida en el momento de uso, vía el error estándar de las tools `gsheets_*`).

---

## 3. Stack & Arquitectura

### 3.1 Stack

| Capa | Tecnología |
|---|---|
| Lenguaje | TypeScript estricto |
| Persistencia | Postgres / Supabase (RLS) |
| Orquestación | LangGraph (`@langchain/langgraph`) |
| Acceso DB | Cliente Supabase en `packages/db` |
| Validación | Zod (schemas de tools) |
| Contexto agente | `apps/web/src/lib/agent/load-context.ts` |

Sin dependencias nuevas. Sin pgvector ni embeddings (a diferencia de la memoria a largo plazo).

### 3.2 Arquitectura — diagrama en texto

```
[Registro]
[Usuario] "guardá esta hoja como 'gym': <url>"
    ↓ tool_call: gsheets_save_reference (medium → HITL)
[adapters.ts] → upsertUserSheet(db, userId, {...})
    ↓
[tabla user_sheets]

[Registro al crear (auto)]
[Usuario] "creame una hoja 'Gym log' y guardala como 'gym'"
    ↓ tool_call: gsheets_create_spreadsheet(title, sheets?, register_as="gym") (medium → HITL)
[adapters.ts] → createSpreadsheet(...) → upsertUserSheet(db, userId, {alias, spreadsheetId})
    ↓
[Google Sheets API + tabla user_sheets]  (una sola confirmación)

[Uso]
[Usuario] "anotá 20kg press banca en mi hoja del gym"
    ↓
[loadAgentContext] lee user_sheets → arma bloque [HOJAS DEL USUARIO]
    ↓ inyecta en system prompt (buildSystemPrompt)
[LangGraph: agent] el LLM mapea "gym" → spreadsheetId + default_tab
    ↓ tool_call: gsheets_append_row(spreadsheet_id, range, values)
[tools/adapters.ts → integrations/google-sheets.ts]
    ↓
[Google Sheets API]
```

### 3.3 Contrato de datos

**Tabla `user_sheets`:**

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | `default uuid_generate_v4()` |
| `user_id` | uuid | FK → `profiles(id) on delete cascade` |
| `alias` | text not null | Nombre legible por el que el usuario la llama ("gym", "progreso") |
| `spreadsheet_id` | text not null | El ID real que reciben las tools |
| `default_tab` | text | Pestaña por defecto (opcional) |
| `description` | text | Semántica: "cuándo usar esta hoja" (alimenta el matching del LLM) |
| `created_at` | timestamptz | `default now()` |
| `updated_at` | timestamptz | `default now()`, trigger de update |

- Constraint `unique (user_id, alias)` — un alias por usuario, evita ambigüedad al resolver.
- RLS: `using (auth.uid() = user_id)` para todas las operaciones (patrón de `scheduled_tasks`).
- Reusa la validación `assertSpreadsheetId` de `integrations/google-sheets.ts` antes de persistir.

**Bloque inyectado en el system prompt (formato tentativo):**

```
[HOJAS DEL USUARIO]
Estas son las hojas de Google Sheets que el usuario registró. Cuando pida operar
sobre una hoja por nombre o intención, usá el spreadsheet_id correspondiente
(no inventes IDs ni busques por nombre fuera de esta lista):
- "gym" → spreadsheet 9XyZ…, pestaña por defecto "log". Uso: pesos y ejercicios.
- "progreso" → spreadsheet 1AbC…, pestaña por defecto "progress_tracker". Uso: avances semanales.
[/HOJAS DEL USUARIO]
```

Si el usuario no tiene hojas registradas, el bloque se omite (igual que la memoria degrada elegante).

---

## 4. Constraints

### Reglas fijas

- TypeScript estricto, sin `any`.
- Acceso a DB encapsulado en `packages/db` (no consultas crudas desde adapters/web).
- RLS obligatoria en la tabla nueva.
- Tools que escriben en DB → `risk: "medium"` mínimo (pasan por HITL).
- `accessToken` y secretos nunca se loggean (no aplica directo aquí, pero la regla se mantiene).
- Sin valores hardcodeados.

### Reglas específicas de esta tarea

- [ ] El `alias` se normaliza (trim + lowercase) antes de guardar y al resolver, para que "Gym" y "gym" sean la misma referencia.
- [ ] `spreadsheet_id` se valida con `assertSpreadsheetId` antes de insertar; si el usuario pasa una URL, el LLM extrae el ID (igual que en las tools `gsheets_*`).
- [ ] El bloque `[HOJAS DEL USUARIO]` se construye en `loadAgentContext` (un solo lugar) para que aparezca en web, Telegram y scheduled.
- [ ] Cota defensiva: inyectar como máximo N hojas (ej. 50) en el bloque para no inflar el prompt; si el usuario tiene más, loggear/avisar (improbable en MVP).
- [ ] El agente NUNCA opera sobre una hoja cuyo alias no esté en el registro o cuyo ID no haya provisto el usuario explícitamente en la conversación.
- [ ] `gsheets_save_reference` es idempotente por `(user_id, alias)`: si el alias existe, actualiza (upsert).

---

## 5. Riesgos & Supuestos

| # | Riesgo / Supuesto | Probabilidad | Mitigación |
|---|---|---|---|
| 1 | El bloque inyectado infla el system prompt y consume contexto | Baja | Cota de N hojas; el bloque es compacto (1 línea por hoja). La compaction ya protege el contexto general. |
| 2 | El LLM resuelve mal el alias (elige la hoja equivocada) | Media | Descripciones claras + `unique(user_id, alias)`. Para escrituras, el HITL muestra el spreadsheet_id resuelto antes de ejecutar, así el usuario detecta el error. |
| 3 | Sin UI, el usuario no sabe qué hojas tiene registradas | Media | Tool `gsheets_list_references` (low) para consultarlas conversando. UI queda como nice-to-have. |
| 4 | Colisión de alias al guardar | Baja | Upsert por `(user_id, alias)`: actualizar en vez de duplicar. |
| 5 | Supuesto: `loadAgentContext` es el único punto de armado de contexto en todos los canales | Alta | Verificado: el helper ya unifica web/telegram/scheduled (ver comentario en `load-context.ts`). |
| 6 | El parámetro `register_as` falla al registrar (ej. alias duplicado) después de que el spreadsheet ya se creó | Baja-Media | La creación NO se revierte (la hoja queda creada en Drive); el registro usa upsert idempotente, así que un alias repetido actualiza en vez de fallar. Si el registro falla por otra causa, devolver al LLM el `spreadsheetId` creado + el error de registro, para que el usuario lo guarde manualmente con `gsheets_save_reference`. |

---

## 6. Definition of Done

### Siempre se cumplen

- [ ] `type-check` y `lint` verdes en `packages/agent`, `packages/db` y `apps/web`.
- [ ] TypeScript estricto, sin `any` en código nuevo.
- [ ] RLS activa y verificada en `user_sheets`.
- [ ] Migración `00008` aplica limpio sobre un proyecto con las 7 anteriores.
- [ ] CHANGELOG y README actualizados.

### Criterios específicos de esta tarea

- [ ] El usuario puede pedir "guardá esta hoja como 'X': <url/id>" y queda en `user_sheets` (HITL dispara en `gsheets_save_reference`).
- [ ] En una conversación **nueva** (sin haber pegado el ID), el usuario dice "leé mi hoja X" y el agente resuelve el `spreadsheetId` desde el bloque inyectado y llama `gsheets_read_range`.
- [ ] "Listame mis hojas" devuelve los alias registrados (`gsheets_list_references`).
- [ ] "Borrá la referencia 'X'" la elimina (HITL).
- [ ] "Creame una hoja 'Y' y guardala como 'Z'" crea el spreadsheet **y** lo registra en `user_sheets` en una sola confirmación (parámetro `register_as`). Si `register_as` se omite, el comportamiento de `gsheets_create_spreadsheet` no cambia.
- [ ] Un usuario sin hojas registradas no rompe nada: el bloque se omite.
- [ ] El alias es case-insensitive ("Gym" == "gym").

---

## 7. Referencias & Notas

- Feature base: [../google-sheets/brief.md](../google-sheets/brief.md) y su [plan.md](../google-sheets/plan.md).
- Punto de inyección de contexto: `apps/web/src/lib/agent/load-context.ts` (`loadAgentContext`, `buildSystemPrompt`).
- Patrón de tabla + RLS: `packages/db/supabase/migrations/00005_scheduled_tasks.sql`.
- Patrón de funciones DB: `getUserToolSettings` / `upsertToolSetting` en `packages/db`.
- Patrón de bloque inyectado: `[MEMORIA DEL USUARIO]` en `packages/agent/src/memory_injection_node.ts`.
- Validación de IDs reutilizable: `assertSpreadsheetId` en `packages/agent/src/integrations/google-sheets.ts`.
- Decisión de diseño: Opción A (inyección determinista en contexto), Opción B (embeddings) descartada por sobreingeniería para el volumen esperado.
- Tool a extender (auto-registro): `gsheets_create_spreadsheet` en `packages/agent/src/tools/catalog.ts` y `tools/adapters.ts` — nuevo parámetro opcional `register_as`.
- Follow-ups posibles: UI de gestión en Ajustes; tool `gsheets_clear_range` (feature aparte).
