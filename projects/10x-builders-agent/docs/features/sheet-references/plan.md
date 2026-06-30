# Plan de Implementación — Referencias de hojas (Sheet References)

Documento de plan **previo a implementación**. Se basa en el [brief.md](brief.md) y replica patrones consolidados de [Google Sheets](../google-sheets/plan.md), [Scheduled Tasks](../scheduled-tasks/plan.md) y [Long-Term Memory](../long-term-memory/plan.md).

> **Estado:** `Implementado` (as-built). Fases 1–6 completas y verificadas con `type-check`/`lint`; el smoke manual de Fase 7 requiere `npm run dev` + reconexión OAuth.

---

## 0. Resumen

- Tabla nueva `user_sheets` (migración `00008`) con RLS por usuario y `unique(user_id, alias)`.
- 3 tools de gestión (`gsheets_save_reference` medium, `gsheets_list_references` low, `gsheets_delete_reference` medium).
- Resolución por **Opción A**: `loadAgentContext` inyecta un bloque `[HOJAS DEL USUARIO]` en el system prompt cada turno (determinista, todos los canales).
- Auto-registro: parámetro opcional `register_as` en la tool existente `gsheets_create_spreadsheet`.
- Sin embeddings, sin migración de tokens OAuth, sin dependencias nuevas.

---

## 1. Decisiones de diseño

| Tema | Decisión | Por qué |
|---|---|---|
| Almacenamiento | Tabla dedicada `user_sheets`, NO `user_tool_settings.config_json`. | Una fila por hoja escala mejor que un blob JSON; permite `unique(user_id, alias)` e índice por usuario. Patrón de `scheduled_tasks`. |
| Unicidad de alias | `unique(user_id, alias)` + **upsert** en save. | Evita ambigüedad al resolver ("¿cuál 'gym'?"). Re-guardar un alias actualiza en vez de duplicar. Brief, Constraints. |
| Normalización de alias | `trim().toLowerCase()` al guardar y al resolver. | "Gym" == "gym". Se hace en la capa de query (`packages/db`) para que aplique a todas las vías. |
| Resolución (uso) | **Opción A**: inyectar catálogo en el system prompt vía `loadAgentContext`. NO tool de resolución ni embeddings. | El LLM mapea alias/descripción → ID gratis. Determinista (a diferencia de la memoria pgvector). Brief, sección 1. |
| Punto de inyección | `loadAgentContext` (`apps/web/src/lib/agent/load-context.ts`), añadido al `Promise.all` existente; el bloque se concatena al `systemPrompt`. | Un solo lugar → aparece en web, Telegram y scheduled (el helper ya unifica los tres canales). |
| Formato del bloque | `[HOJAS DEL USUARIO] … [/HOJAS DEL USUARIO]`, 1 línea por hoja (alias → id, pestaña, uso). Se omite si no hay hojas. | Espejo de `[MEMORIA DEL USUARIO]` en `memory_injection_node.ts`. Compacto para no inflar el prompt. |
| Cota de tamaño | Inyectar máximo 50 hojas (orden `created_at`). | Defensa de contexto. Improbable superarlo en MVP. |
| Acceso a DB desde tools | `ctx.db` + `ctx.userId` (ya disponibles en `ToolContext`), funciones en `packages/db/src/queries/user-sheets.ts`. | Patrón idéntico a `createScheduledTask`/`listScheduledTasks`. |
| Riesgo/HITL | `save`/`delete` → `medium` (confirmación). `list` → `low`. | Escrituras a DB pasan por HITL, como las tools de scheduled tasks. |
| Auto-registro | `register_as?` opcional en `gsheets_create_spreadsheet`. Tras crear, llama `upsertUserSheet` con el id devuelto. Una sola confirmación. Si el registro falla, devolver id + error (no revertir la creación). | Brief, Alcance + Riesgo #6. |
| Validación de id | Reusar `assertSpreadsheetId` de `integrations/google-sheets.ts` antes de persistir en `save` y en `register_as`. | Evita guardar basura; mensaje legible. |
| Settings UI | Solo extender `TOOL_IDS` para que las 3 tools nuevas aparezcan como toggles. Sin panel CRUD (fuera de alcance). | Brief, Fuera del alcance. |

---

## 2. Contratos

### 2.1 Tabla `user_sheets` (migración `00008`)

```sql
create table public.user_sheets (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  alias           text not null,
  spreadsheet_id  text not null,
  default_tab     text,
  description     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, alias)
);

create index user_sheets_user_idx on public.user_sheets (user_id);

alter table public.user_sheets enable row level security;
create policy "Users can manage own sheet references"
  on public.user_sheets for all
  using (auth.uid() = user_id);

-- Trigger updated_at: reusar el patrón existente de otras tablas (00002).
```

### 2.2 Funciones DB (`packages/db/src/queries/user-sheets.ts`)

```ts
listUserSheets(db, userId) → UserSheet[]                       // orden created_at, cap 50
upsertUserSheet(db, userId, {
  alias, spreadsheetId, defaultTab?, description?
}) → UserSheet                                                 // normaliza alias; on conflict (user_id, alias) update
deleteUserSheet(db, userId, alias) → { deleted: boolean }      // alias normalizado
```

Tipo `UserSheet` en `packages/types`. Normalización de alias (`trim().toLowerCase()`) dentro de `upsertUserSheet`/`deleteUserSheet`.

### 2.3 Tools (`catalog.ts`)

```
gsheets_save_reference   (medium) { alias, spreadsheet_id, default_tab?, description? }
gsheets_list_references  (low)    { }
gsheets_delete_reference (medium) { alias }
gsheets_create_spreadsheet (medium, EXTENDER) { title, sheets?, register_as? }
```

### 2.4 Bloque inyectado

```
[HOJAS DEL USUARIO]
Hojas de Google Sheets que el usuario registró. Para operar por nombre/intención
usá el spreadsheet_id correspondiente (no inventes IDs ni busques fuera de esta lista):
- "gym" → spreadsheet 9XyZ…, pestaña por defecto "log". Uso: pesos y ejercicios.
- "progreso" → spreadsheet 1AbC…, pestaña por defecto "progress_tracker". Uso: avances semanales.
[/HOJAS DEL USUARIO]
```

---

## 3. Fases

### Fase 1: DB — tabla + queries ⬜

- [ ] Migración `packages/db/supabase/migrations/00008_user_sheets.sql` (tabla, índice, RLS, trigger `updated_at`).
- [ ] Tipo `UserSheet` en `packages/types`.
- [ ] `packages/db/src/queries/user-sheets.ts`: `listUserSheets`, `upsertUserSheet`, `deleteUserSheet` (con normalización de alias). Exportar desde `packages/db/src/index.ts`.
- [ ] `type-check` de `packages/db` y `packages/types`.

### Fase 2: Inyección en contexto (Opción A) ⬜

- [ ] `apps/web/src/lib/agent/load-context.ts`:
  - Agregar `listUserSheets(db, userId)` al `Promise.all` de `loadAgentContext`.
  - Construir el bloque `[HOJAS DEL USUARIO]` (helper `buildSheetsBlock(sheets)`); omitir si está vacío.
  - Concatenar el bloque al `systemPrompt` resultante de `buildSystemPrompt` (después del prompt del usuario, como hace la memoria).
- [ ] Verificar que el bloque llega en los tres canales (web `/api/chat`, webhook Telegram, `/api/scheduled-tasks/tick`) — todos pasan por `loadAgentContext`.

### Fase 3: Tools de gestión ⬜

- [ ] `catalog.ts`: agregar `gsheets_save_reference`, `gsheets_list_references`, `gsheets_delete_reference` (después del bloque `gsheets_*`). Descripciones en español; aclarar que el alias es case-insensitive y que `save` sobreescribe si el alias ya existe.
- [ ] `adapters.ts`: 3 wrappers con schemas Zod, usando `ctx.db`/`ctx.userId` y las funciones de Fase 1 (patrón `create_scheduled_task`/`list_scheduled_tasks`):
  - `list` → `low`, crea `toolCall` y reporta con `updateToolCallStatus`.
  - `save`/`delete` → `medium`, sin crear `toolCall` (lo maneja `toolExecutorNode` en HITL).
  - `save` valida `spreadsheet_id` con `assertSpreadsheetId` antes de persistir.
- [ ] Ramas en `summariseToolCall`:
  - `gsheets_save_reference` → *"Guardar hoja «<alias>» → `<id 8 chars>…`<pestaña?>."*
  - `gsheets_delete_reference` → *"Eliminar la referencia de hoja «<alias>»."*

### Fase 4: Auto-registro en `gsheets_create_spreadsheet` ⬜

- [ ] `catalog.ts`: añadir parámetro opcional `register_as` (string) al schema de `gsheets_create_spreadsheet`, con descripción ("si se indica, registra la hoja creada con ese alias para referenciarla luego por nombre").
- [ ] `adapters.ts`: en el wrapper de `gsheets_create_spreadsheet`, tras `createSpreadsheet(...)`, si viene `register_as` llamar `upsertUserSheet(ctx.db, ctx.userId, { alias: register_as, spreadsheetId: <devuelto>, defaultTab: <primera pestaña?> })`. Envolver el registro en try/catch: si falla, devolver al LLM el `spreadsheetId` + nota del error (NO revertir la creación).
- [ ] Actualizar la rama de `summariseToolCall` de `gsheets_create_spreadsheet` para mencionar el alias cuando `register_as` esté presente.

### Fase 5: Settings UI ⬜

- [ ] `apps/web/src/app/settings/settings-form.tsx`: agregar al array `TOOL_IDS`:
  ```ts
  "gsheets_save_reference",
  "gsheets_list_references",
  "gsheets_delete_reference",
  ```
- [ ] Sin panel nuevo (gestión vía conversación).

### Fase 6: Documentación ⬜

- [ ] `CHANGELOG.md` → `[Unreleased]`:
  - `Added`: tabla `user_sheets`, 3 tools `gsheets_*_reference`, inyección `[HOJAS DEL USUARIO]`, parámetro `register_as` en `gsheets_create_spreadsheet`.
- [ ] README: sub-sección breve bajo Google Sheets explicando registrar/usar hojas por alias y el auto-registro.
- [ ] `docs/plan.md`: nueva fase apuntando a este documento.
- [ ] Marcar `brief.md` como `Implementado` y enlazar este plan al cierre.

### Fase 7: Verificación ⬜

- [ ] `type-check` en `packages/db`, `packages/types`, `packages/agent`, `apps/web`. `lint` en `apps/web`.
- [ ] Migración `00008` aplica limpio sobre las 7 anteriores.
- [ ] Smoke manual (`npm run dev`):
  1. "Guardá esta hoja como 'progreso': `<url>`" → HITL → aprobar → fila en `user_sheets`.
  2. "Listame mis hojas" → devuelve "progreso".
  3. **Conversación nueva**: "leé mi hoja de progreso" → el agente resuelve el id desde el bloque y llama `gsheets_read_range` sin pedir el id.
  4. "Creame una hoja 'Gym log' con pestaña 'log' y guardala como 'gym'" → una sola confirmación → hoja creada + registrada.
  5. "Borrá la referencia 'gym'" → HITL → eliminada.
  6. Alias case-insensitive: guardar "Gym", referenciar "gym" → misma hoja.
  7. Usuario sin hojas registradas → el bloque no aparece, nada se rompe.

---

## 4. Archivos esperados

### Nuevos (3)

- `packages/db/supabase/migrations/00008_user_sheets.sql`
- `packages/db/src/queries/user-sheets.ts`
- (tipo) entrada `UserSheet` en `packages/types`

### Modificados (~7)

- `packages/db/src/index.ts` — exportar las queries nuevas.
- `apps/web/src/lib/agent/load-context.ts` — fetch + bloque `[HOJAS DEL USUARIO]`.
- `packages/agent/src/tools/catalog.ts` — 3 tools nuevas + `register_as` en create.
- `packages/agent/src/tools/adapters.ts` — 3 wrappers + auto-registro + ramas en `summariseToolCall`.
- `apps/web/src/app/settings/settings-form.tsx` — `TOOL_IDS`.
- `CHANGELOG.md`, `README.md`, `docs/plan.md` — docs.

### Reusados sin tocar

- `packages/agent/src/integrations/google-sheets.ts` — `assertSpreadsheetId`, `createSpreadsheet`.
- `packages/agent/src/graph.ts` — `toolExecutorNode` ya intercepta `medium` para HITL.
- `ToolContext` (`adapters.ts`) — ya expone `db` y `userId`.

---

## 5. Riesgos durante la implementación

| # | Riesgo | Mitigación |
|---|---|---|
| 1 | El bloque infla el prompt | Cap de 50 hojas, 1 línea por hoja, se omite si vacío. |
| 2 | El LLM resuelve mal el alias | Descripciones claras + `unique(user_id, alias)`; el HITL de escritura muestra el id resuelto antes de ejecutar. |
| 3 | `register_as` falla tras crear la hoja | Upsert idempotente; si falla, devolver id + error sin revertir. |
| 4 | Olvidar exportar las queries desde `index.ts` → import roto en web | Checklist Fase 1; `type-check` lo detecta. |
| 5 | Olvidar `TOOL_IDS` → toggles no aparecen | Checklist Fase 5; smoke paso 1. |
| 6 | Trigger `updated_at` duplicado/ausente | Reusar exactamente el patrón de migración `00002`. |

---

## 6. Definition of Done (resumen del brief)

- [ ] `type-check` y `lint` verdes en los paquetes tocados.
- [ ] RLS activa en `user_sheets`; migración `00008` aplica limpio.
- [ ] Registrar, listar, borrar y resolver-por-nombre funcionan end-to-end (smoke Fase 7).
- [ ] Auto-registro con `register_as` en una sola confirmación; omitirlo no cambia el comportamiento actual.
- [ ] Alias case-insensitive; upsert idempotente.
- [ ] Usuario sin hojas no rompe nada.
- [ ] CHANGELOG y README actualizados.

---

## 7. Referencias

- Brief: [`brief.md`](brief.md).
- Patrón tabla + RLS: `packages/db/supabase/migrations/00005_scheduled_tasks.sql`.
- Patrón queries DB: `packages/db/src/queries/scheduled-tasks.ts`, `.../tools.ts`.
- Patrón tools con DB: `create_scheduled_task` / `list_scheduled_tasks` en `tools/adapters.ts`.
- Patrón bloque inyectado: `[MEMORIA DEL USUARIO]` en `packages/agent/src/memory_injection_node.ts`.
- Punto de contexto: `apps/web/src/lib/agent/load-context.ts`.
- Validación de id: `assertSpreadsheetId` en `packages/agent/src/integrations/google-sheets.ts`.
