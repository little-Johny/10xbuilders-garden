---
name: Tools de archivos
overview: Añadir tres tools de manipulación de archivos (`read_file`, `write_file`, `edit_file`) al agente, siguiendo el patrón catálogo + adaptadores + módulo de sistema, con sandbox propio (`FILE_TOOLS_WORKSPACE_ROOT`) y outputs JSON explícitos para errores.
todos:
  - id: file-ops-module
    content: "Crear packages/agent/src/tools/file-ops.ts: isFileToolsAllowed, resolveSafePath con realpath anti-symlink, FILE_TOOL_MAX_BYTES simétrico (lectura y escritura), readFileSafe, writeFileNew con escritura atómica (tempfile + rename), editFileExact con escritura atómica + hints de CRLF/BOM en MATCH_NOT_FOUND. Todas las salidas OK incluyen path absoluto resuelto."
    status: completed
  - id: catalog-entries
    content: Añadir entradas read_file (low), write_file (low) y edit_file (high) en catalog.ts con su parameters_schema
    status: completed
  - id: bash-addendum
    content: Añadir el bloque de PREFERENCIA al description de la entrada bash en catalog.ts para guiar al modelo a preferir las tools dedicadas
    status: completed
  - id: adapters
    content: "Añadir 3 adapters en adapters.ts: read_file y write_file con createToolCall/updateToolCallStatus, edit_file con handler limpio gated por isFileToolsAllowed + isToolAvailable"
    status: completed
  - id: summarise
    content: "Añadir caso edit_file en summariseToolCall que renderice un mini-diff unificado tipo git diff (2-3 líneas de contexto, bloque de código markdown compatible con web y Telegram) usando la dependencia diff de npm"
    status: completed
  - id: ui-tool-ids
    content: Registrar read_file/write_file/edit_file en TOOL_IDS de settings-form.tsx y AVAILABLE_TOOLS de step-tools.tsx
    status: completed
  - id: env-docs
    content: Documentar ALLOW_FILE_TOOLS y FILE_TOOLS_WORKSPACE_ROOT en apps/web/.env.example, dejando explícito que sin root el alcance lo dictan los permisos del proceso (asumir entorno confiable)
    status: completed
  - id: file-tools-smoke
    content: "Smoke script en packages/agent/scripts que ejercite: path absoluto OK, relativo sin root → REQUIRES_ABSOLUTE_PATH, symlink que apunta fuera del sandbox → OUT_OF_SANDBOX, write con flag wx sobre archivo existente → FILE_ALREADY_EXISTS, edit con match único, no encontrado y duplicado, archivo > FILE_TOOL_MAX_BYTES, hints de CRLF y BOM"
    status: completed
isProject: false
---

# Tools de archivos: read_file, write_file, edit_file

## Contexto del patrón existente

Toda capacidad nueva en el agente toca tres capas en `projects/10x-builders-agent/packages/agent/src/tools/`:

- **Definición** en [`catalog.ts`](projects/10x-builders-agent/packages/agent/src/tools/catalog.ts): id, descripción, `risk`, `parameters_schema` (JSON Schema).
- **Implementación pura** en un módulo aparte (como [`bash-exec.ts`](projects/10x-builders-agent/packages/agent/src/tools/bash-exec.ts)): expone gates de entorno y la lógica de sistema sin saber nada de LangGraph.
- **Adapter LangChain** en [`adapters.ts`](projects/10x-builders-agent/packages/agent/src/tools/adapters.ts): valida con Zod, decide si toca persistir el `tool_call` (low) o dejarlo al `toolExecutorNode` (medium/high), y devuelve siempre `JSON.stringify(...)`.

Para tools de riesgo medio/alto el flujo en [`graph.ts`](projects/10x-builders-agent/packages/agent/src/graph.ts) ya gestiona el `interrupt()` y el HITL automáticamente con solo poner `risk: "high"` en el catálogo, pero requiere un caso en `summariseToolCall` para que la tarjeta de confirmación sea legible.

```mermaid
flowchart LR
    LLM["LLM (toolCall)"] --> graph["graph.ts<br/>toolExecutorNode"]
    graph -->|"risk = low"| direct["adapter.handler<br/>createToolCall + executar"]
    graph -->|"risk = high"| pending["createPendingToolCall<br/>+ interrupt()"]
    pending --> hitl["UI confirma o rechaza"]
    hitl -->|"approve"| direct2["adapter.handler<br/>(side-effect limpio)"]
    direct --> fileOps["file-ops.ts"]
    direct2 --> fileOps
    fileOps -->|"resolveSafePath:<br/>sandbox si root, abs-only si no"| fs[("fs / fsPromises")]
```

## Decisiones acordadas

- **Sandbox opcional**, independiente de `bash`:
  - `ALLOW_FILE_TOOLS` (`"true" | "1"`): gate maestro **obligatorio**. Sin él las tools no se exponen al grafo.
  - `FILE_TOOLS_WORKSPACE_ROOT`: **opcional**. Activa dos modos distintos de resolución de paths:
    - **Con root configurado** → toda ruta debe resolverse dentro; los paths relativos se resuelven contra el root; las absolutas se aceptan si están dentro.
    - **Sin root** → solo se aceptan **paths absolutos**; los relativos se rechazan con `REQUIRES_ABSOLUTE_PATH` (evita ambigüedad respecto al CWD del proceso). El alcance pasa a estar dictado por los permisos del proceso del agente.
  - En ambos modos la tool devuelve siempre el path absoluto **resuelto** en el campo `path` para que el LLM pueda referenciarlo sin ambigüedad en llamadas posteriores.
- **`read_file` estilo Cursor/LC**: `offset` y `limit` opcionales, default lee el archivo completo. Salida con prefijo `LINE_NUMBER|content` y campos `total_lines`, `truncated`.
- **`write_file` solo crea archivos nuevos**: si el path existe, devuelve error explícito `FILE_ALREADY_EXISTS` (la mutación de existentes es responsabilidad de `edit_file`).
- **`edit_file` con match único**: reemplaza UNA ocurrencia exacta de `old_string`; si el match no es único o no existe, devuelve error explícito.
- **Errores como outputs estructurados**: en lugar de `throw`, los handlers devuelven `{ ok: false, code, message, ... }` para que el LLM pueda razonar y reintentar (mismo enfoque que `runBash` con `stderr`/`exitCode`). Solo se hace `throw` cuando el problema impide siquiera arrancar (sandbox no configurado).
- **Salida OK consistente**: las tres tools (`read_file`, `write_file`, `edit_file`) incluyen siempre `path` (absoluto y resuelto vía `realpath`) en la respuesta, para que el LLM pueda referenciar el archivo sin ambigüedad en llamadas posteriores.
- **Symlink hardening**: `resolveSafePath` aplica `fs.realpath` después de `path.resolve` para que symlinks dentro del sandbox que apunten fuera fallen con `OUT_OF_SANDBOX`. En `write_file` el `realpath` se aplica al directorio padre (porque el archivo destino aún no existe).
- **Cap simétrico de tamaño**: `FILE_TOOL_MAX_BYTES` (default `1_000_000`) aplica tanto a `read_file` como a `write_file` (sobre `Buffer.byteLength(content, "utf-8")`); supera el cap → `FILE_TOO_LARGE`.
- **Escritura atómica**: `write_file` y `edit_file` escriben a un tempfile en el mismo directorio (`<file>.tmp-<rand>`) y luego `fs.rename`. Cierra la ventana TOCTOU entre count y write.
- **Hints de encoding en `edit_file`**: cuando `MATCH_NOT_FOUND`, si el archivo tiene `\r\n` (CRLF) o empieza con `﻿` (BOM), añadir `details.hint` para que el LLM ajuste `old_string` sin pedirle al usuario.
- **Entorno confiable**: este proyecto es personal y de aprendizaje. No se introducen flags adicionales para el modo sin sandbox; la disciplina del operador es: si no defines `FILE_TOOLS_WORKSPACE_ROOT`, asume que el agente puede leer/escribir cualquier ruta a la que tenga permisos el proceso.

## Descripciones canónicas para el LLM

Las cuatro descripciones siguen el mismo molde — **qué hace · cuándo usarla · paths · proceso · salida OK · errores** — y se reutilizan idénticas en `catalog.ts` y en el `description` del `tool()` en `adapters.ts` para que la señal al modelo no se duplique con matices distintos.

### Política de paths (común a las tres tools)

Como `FILE_TOOLS_WORKSPACE_ROOT` es opcional, la guía sobre paths es la misma para `read_file`, `write_file` y `edit_file`. Conviene incluirla literal en cada descripción para que el modelo no tenga que recordarla por contexto:

> **PATHS**: usa preferentemente paths **absolutos** (ej. `/Users/johny/proyectos/foo/README.md`); funcionan en todos los entornos. Los paths relativos solo son válidos si el servidor tiene configurado `FILE_TOOLS_WORKSPACE_ROOT` (en cuyo caso se resuelven contra ese root). Si no estás seguro de la ubicación de un archivo, **pídele al usuario el path absoluto** o usa `bash` con `pwd`/`ls`/`find <dir> -name <patrón>` para localizarlo antes de invocar esta tool. La tool **siempre** devuelve el path absoluto resuelto en `path` para que puedas referenciarlo sin ambigüedad en llamadas posteriores.

### `read_file` (low)

> Lee el contenido de un archivo de texto UTF-8. ÚSALA siempre que necesites ver el contenido de un archivo: prefiérela sobre `bash` con `cat`, `head`, `tail` o `sed -n`. NO ejecuta comandos, NO sigue symlinks fuera del sandbox (si está activo) y NO lee binarios.
>
> [bloque de PATHS]
>
> PROCESO: resuelve y valida `path` (incluyendo `realpath` para resolver symlinks), lee el archivo completo o el rango `[offset, offset+limit)` si se proveen (líneas 1-indexed), y devuelve cada línea con prefijo `   N|`. SALIDA OK: `{ ok: true, path, content, total_lines, returned_lines, offset, truncated }`. ERRORES (`{ ok: false, code, message, details? }`): `REQUIRES_ABSOLUTE_PATH` (path relativo y no hay sandbox configurado — repítela con path absoluto), `FILE_NOT_FOUND`, `PATH_IS_DIRECTORY`, `OUT_OF_SANDBOX`, `FILE_TOO_LARGE`, `INVALID_RANGE`, `PERMISSION_DENIED`, `IO_ERROR`.

### `write_file` (low)

> CREA un archivo nuevo con el contenido literal dado (UTF-8). NO sobrescribe: si `path` ya existe falla con `FILE_ALREADY_EXISTS` — para modificar archivos existentes usa `edit_file`. NO crea directorios intermedios. ÚSALA para escribir archivos completos desde cero con contenido conocido; si necesitas heredocs, plantillas con variables de shell, generación masiva o `mkdir -p` previo, usa `bash`.
>
> [bloque de PATHS]
>
> PROCESO: valida path (incluyendo `realpath` del directorio padre) → escribe `content` a un tempfile en el mismo directorio → `fs.rename` atómico al destino con flag exclusivo `wx`. SALIDA OK: `{ ok: true, path, bytes_written }`. ERRORES: `REQUIRES_ABSOLUTE_PATH`, `FILE_ALREADY_EXISTS`, `PARENT_DIR_NOT_FOUND`, `OUT_OF_SANDBOX`, `FILE_TOO_LARGE`, `PERMISSION_DENIED`, `IO_ERROR`.

### `edit_file` (high — requiere confirmación)

> Reemplaza UNA ocurrencia literal y exacta de `old_string` por `new_string` en un archivo EXISTENTE. Pensada para cambios quirúrgicos y reproducibles: si el match no es único, amplía `old_string` con suficiente contexto (líneas antes/después) hasta que solo aparezca una vez. NO crea archivos (usa `write_file`). Para regex, múltiples reemplazos, mover/renombrar/borrar o ediciones batch usa `bash`. Requiere confirmación del usuario.
>
> [bloque de PATHS]
>
> PROCESO: lee el archivo → cuenta ocurrencias literales de `old_string` → si 0: `MATCH_NOT_FOUND` (con `details.hint` si el archivo usa CRLF o BOM y el `old_string` no); si >1: `MATCH_NOT_UNIQUE` con `details.count` (recupera contexto con `read_file` y reintenta con `old_string` más específico); si 1: reemplaza, escribe a tempfile y `fs.rename` atómico. SALIDA OK: `{ ok: true, path, replacements: 1, bytes_written, snippet }` donde `snippet` muestra 2-3 líneas de contexto antes/después del cambio para que verifiques el resultado. ERRORES: `REQUIRES_ABSOLUTE_PATH`, `FILE_NOT_FOUND`, `MATCH_NOT_FOUND`, `MATCH_NOT_UNIQUE`, `OUT_OF_SANDBOX`, `PERMISSION_DENIED`, `IO_ERROR`.

### `bash` (high — addendum a la descripción existente)

A la descripción actual de `bash` en [`catalog.ts`](projects/10x-builders-agent/packages/agent/src/tools/catalog.ts:177) se le agrega un párrafo de **preferencia** para evitar que el modelo lo elija cuando una tool dedicada cubre el caso:

> **PREFERENCIA**: si solo necesitas leer un archivo de texto usa `read_file`; si vas a crear un archivo nuevo con contenido conocido usa `write_file`; si vas a aplicar un find/replace exacto sobre un archivo existente usa `edit_file`. Reserva `bash` para: localizar archivos (`pwd`, `ls`, `find`), listar/mover/renombrar/borrar, crear directorios intermedios, cambiar permisos, ejecutar binarios, pipelines, regex con `sed`/`awk`, lectura binaria, o trabajo fuera de `FILE_TOOLS_WORKSPACE_ROOT`.

### Reglas rápidas de disambiguación

- Leer texto de un archivo conocido → `read_file` (nunca `bash cat`/`head`/`tail`).
- Crear archivo nuevo con contenido literal → `write_file` (nunca `bash echo >`/`cat > heredoc`).
- Cambio puntual con find/replace exacto sobre archivo existente → `edit_file` (nunca `bash sed -i`).
- **No saber dónde está un archivo** → `bash` con `pwd`/`ls`/`find` (o preguntar al usuario), luego usar la tool dedicada con el path absoluto.
- `mkdir`, `mv`, `rm`, `chmod`, ejecutar binarios, regex, múltiples reemplazos, contenido binario → `bash`.

## Archivos y cambios

### 1. Nuevo módulo `packages/agent/src/tools/file-ops.ts`

Análogo a [`bash-exec.ts`](projects/10x-builders-agent/packages/agent/src/tools/bash-exec.ts:1-83). Expone:

- `isFileToolsAllowed(): boolean` (lee `ALLOW_FILE_TOOLS`).
- `getFileToolsRoot(): string | null` (lee y normaliza `FILE_TOOLS_WORKSPACE_ROOT`, o `null`).
- `resolveSafePath(input, { kind: "read" | "write" })`: comportamiento bimodal según el root, con resolución de symlinks.
  - **Con root**: si `input` es absoluto, se normaliza con `path.resolve`; si es relativo, se resuelve contra `root`. En ambos casos se exige `resolved === root || resolved.startsWith(root + path.sep)` para evitar bypass por prefijos (`/root` vs `/root-evil`). Si se sale → `OUT_OF_SANDBOX`.
  - **Sin root**: si `input` es relativo → `REQUIRES_ABSOLUTE_PATH` (no se resuelve contra `process.cwd()` para evitar lecturas accidentales del directorio donde corre el proceso). Si es absoluto → se normaliza con `path.resolve` y se acepta tal cual.
  - **Anti-symlink (siempre que haya root)**: tras `path.resolve`, aplicar `fs.realpath` y volver a validar que el path real está dentro del root. Para `kind: "write"` el archivo destino aún no existe, así que se hace `realpath` sobre el directorio padre. Sin root no se hace `realpath` adicional, pero se acepta el path tal cual (entorno confiable).
  - En todos los casos retorna el path absoluto resuelto para que el handler lo use y lo devuelva al LLM.
- `FileOpResult` discriminado:

```typescript
type FileOpOk<T> = { ok: true } & T;
type FileOpErr = {
  ok: false;
  code:
    | "OUT_OF_SANDBOX"
    | "REQUIRES_ABSOLUTE_PATH"
    | "FILE_NOT_FOUND"
    | "FILE_ALREADY_EXISTS"
    | "PARENT_DIR_NOT_FOUND"
    | "PATH_IS_DIRECTORY"
    | "PERMISSION_DENIED"
    | "MATCH_NOT_FOUND"
    | "MATCH_NOT_UNIQUE"
    | "INVALID_RANGE"
    | "FILE_TOO_LARGE"
    | "IO_ERROR";
  message: string;
  details?: Record<string, unknown>;
};
```

- `readFileSafe(path, offset?, limit?)`: usa `fsPromises.readFile` con encoding `"utf-8"`; aplica el cap `FILE_TOOL_MAX_BYTES` antes de decodificar; calcula `total_lines`, recorta por `[offset, offset+limit)` (1-indexed para el usuario, validando `INVALID_RANGE`), formatea cada línea como `${String(n).padStart(6)}|${line}`. Devuelve `{ ok: true, path, content, total_lines, returned_lines, offset, truncated }`.
- `writeFileNew(path, content)`: rechaza con `FILE_TOO_LARGE` si `Buffer.byteLength(content, "utf-8") > FILE_TOOL_MAX_BYTES`; escribe a un tempfile en el mismo directorio (`<file>.tmp-<random>`) y luego `fs.rename` con flag exclusivo `wx` (atómico). Mapea `EEXIST → FILE_ALREADY_EXISTS`, `EACCES → PERMISSION_DENIED`, `ENOENT` del padre → `PARENT_DIR_NOT_FOUND`. Limpia el tempfile en cualquier rama de error. Devuelve `{ ok: true, path, bytes_written }`.
- `editFileExact(path, old_string, new_string)`: lee con `readFileSafe` (sin truncar) → cuenta ocurrencias literales de `old_string` → si `0`: `MATCH_NOT_FOUND` (si el archivo usa `\r\n` o empieza con `﻿` y `old_string` no, añade `details.hint` con la sugerencia); si `>1`: `MATCH_NOT_UNIQUE` con `details.count`; si `==1`: reemplaza, valida tamaño post-edición contra el cap, escribe a tempfile + `fs.rename`. Construye un `snippet` con 2-3 líneas antes/después del reemplazo (truncando líneas individualmente si exceden ~200 chars). Devuelve `{ ok: true, path, replacements: 1, bytes_written, snippet }`.

Cap de tamaño defensivo simétrico (`FILE_TOOL_MAX_BYTES = 1_000_000` por defecto, override por env) aplicado a lectura, escritura nueva y al resultado de `edit_file` → `FILE_TOO_LARGE`.

### 2. Catálogo en [`packages/agent/src/tools/catalog.ts`](projects/10x-builders-agent/packages/agent/src/tools/catalog.ts)

Añadir tres entradas al `TOOL_CATALOG` y actualizar la descripción de `bash` con el addendum de preferencia. El campo `description` de cada una usa **literalmente** el texto canónico de la sección anterior; `properties.*.description` documenta los parámetros con la misma claridad que el modelo necesita para llamar bien la tool.

```typescript
{
  id: "read_file",
  name: "read_file",
  description: /* descripción canónica de read_file (sección anterior) */,
  risk: "low",
  parameters_schema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Path absoluto (recomendado). Si el servidor configuró FILE_TOOLS_WORKSPACE_ROOT también acepta relativos resueltos contra ese root" },
      offset: { type: "number", description: "Línea inicial 1-indexed (opcional). Default: 1" },
      limit: { type: "number", description: "Número máximo de líneas a devolver (opcional). Default: archivo completo" },
    },
    required: ["path"],
  },
},
{
  id: "write_file",
  name: "write_file",
  description: /* descripción canónica de write_file */,
  risk: "low",
  parameters_schema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Ruta del archivo NUEVO a crear (no debe existir)" },
      content: { type: "string", description: "Contenido literal UTF-8; se escribe byte a byte sin interpolación" },
    },
    required: ["path", "content"],
  },
},
{
  id: "edit_file",
  name: "edit_file",
  description: /* descripción canónica de edit_file */,
  risk: "high",
  parameters_schema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Ruta del archivo existente a modificar" },
      old_string: { type: "string", description: "Texto literal a buscar; debe aparecer EXACTAMENTE una vez en el archivo" },
      new_string: { type: "string", description: "Texto que reemplazará a old_string (puede ser cadena vacía para borrar)" },
    },
    required: ["path", "old_string", "new_string"],
  },
},
```

Y la entrada de `bash` ya existente queda con su descripción actual + el párrafo de **PREFERENCIA** definido en la sección anterior.

### 3. Adapters en [`packages/agent/src/tools/adapters.ts`](projects/10x-builders-agent/packages/agent/src/tools/adapters.ts)

Añadir import:

```typescript
import { isFileToolsAllowed, readFileSafe, writeFileNew, editFileExact } from "./file-ops";
```

Patrón para `read_file` y `write_file` (low risk → handler persiste `tool_call`, similar a [`github_list_repos`](projects/10x-builders-agent/packages/agent/src/tools/adapters.ts:256-300)):

```typescript
if (isFileToolsAllowed() && isToolAvailable("read_file", ctx)) {
  tools.push(
    tool(
      async (input) => {
        const record = await createToolCall(
          ctx.db,
          ctx.sessionId,
          "read_file",
          input as Record<string, unknown>,
          false,
        );
        try {
          const result = await readFileSafe(
            input.path,
            input.offset ?? undefined,
            input.limit ?? undefined,
          );
          await updateToolCallStatus(
            ctx.db,
            record.id,
            result.ok ? "executed" : "failed",
            result.ok ? { total_lines: result.total_lines } : { error: result.code },
          );
          return JSON.stringify(result);
        } catch (e) {
          await updateToolCallStatus(ctx.db, record.id, "failed", {
            error: e instanceof Error ? e.message : String(e),
          });
          throw e;
        }
      },
      {
        name: "read_file",
        description: /* descripción canónica de read_file */,
        schema: z.object({
          path: z.string().min(1).describe("Path absoluto preferido; relativos solo si hay FILE_TOOLS_WORKSPACE_ROOT"),
          offset: z
            .number()
            .int()
            .min(1)
            .nullable()
            .optional()
            .describe("Línea inicial 1-indexed; default 1"),
          limit: z
            .number()
            .int()
            .min(1)
            .max(5000)
            .nullable()
            .optional()
            .describe("Líneas máximas a devolver; default archivo completo"),
        }),
      },
    ),
  );
}
```

`write_file` mismo patrón (low risk).

`edit_file` (high risk → handler "limpio", como [`github_create_issue`](projects/10x-builders-agent/packages/agent/src/tools/adapters.ts:350-380); la persistencia la hace el `toolExecutorNode` antes del `interrupt()`):

```typescript
if (isFileToolsAllowed() && isToolAvailable("edit_file", ctx)) {
  tools.push(
    tool(
      async (input) => {
        const result = await editFileExact(input.path, input.old_string, input.new_string);
        return JSON.stringify(result);
      },
      {
        name: "edit_file",
        description: /* descripción canónica de edit_file */,
        schema: z.object({
          path: z.string().min(1).describe("Ruta del archivo existente"),
          old_string: z
            .string()
            .min(1)
            .describe("Texto literal a buscar; debe ser único en el archivo"),
          new_string: z
            .string()
            .describe("Texto de reemplazo (cadena vacía para borrar el match)"),
        }),
      },
    ),
  );
}
```

Diferencia clave con bash: `throw` solo si el sandbox está mal configurado o hay un fallo de I/O inesperado; los errores semánticos (`MATCH_NOT_UNIQUE`, `FILE_NOT_FOUND`, etc.) viajan en el JSON con `ok: false`. Los low-risk usan `updateToolCallStatus(..., "failed", ...)` cuando `result.ok === false` para que la tabla `tool_calls` refleje fielmente lo ocurrido aunque el handler no haya tirado.

### 4. `summariseToolCall` para `edit_file` en [`adapters.ts`](projects/10x-builders-agent/packages/agent/src/tools/adapters.ts:134-208)

Renderiza un **mini-diff unificado** tipo `git diff` (2-3 líneas de contexto) dentro de un bloque de código markdown, para que la tarjeta de confirmación sea legible en web (con highlight) y en Telegram (que respeta ``` ``` ```). Usa la dependencia `diff` de npm (~10KB).

Añadir antes del `if (toolName === "bash")`:

```typescript
if (toolName === "edit_file") {
  const path = String(args.path);
  const oldStr = String(args.old_string ?? "");
  const newStr = String(args.new_string ?? "");
  // createPatch genera el formato unificado; truncamos cada línea
  // a ~200 chars para que cambios largos no rompan el render.
  const patch = createPatch(path, oldStr, newStr, "", "", { context: 3 });
  const truncated = patch
    .split("\n")
    .slice(2) // descarta el header "Index:" y "==="
    .map((l) => (l.length > 200 ? l.slice(0, 200) + "…" : l))
    .join("\n");
  return `Editar ${path}:\n\n\`\`\`diff\n${truncated}\n\`\`\``;
}
```

Notas de implementación:

- Importar `createPatch` desde `diff` en el top del archivo.
- Si la suma de líneas del patch supera ~40, truncar a las primeras 40 líneas + un "…" final, para que la tarjeta no sea ilegible cuando el cambio es enorme.
- El `path` se renderiza en texto plano (no dentro del bloque ```diff) para que sea seleccionable y se vea bien en ambos canales.

### 5. UI: catálogos auxiliares

- [`apps/web/src/app/settings/settings-form.tsx`](projects/10x-builders-agent/apps/web/src/app/settings/settings-form.tsx:16-29): añadir `"read_file"`, `"write_file"`, `"edit_file"` al array `TOOL_IDS`.
- [`apps/web/src/app/onboarding/steps/step-tools.tsx`](projects/10x-builders-agent/apps/web/src/app/onboarding/steps/step-tools.tsx:10-46): añadir las tres entradas en `AVAILABLE_TOOLS` con los `risk` correspondientes y `requiresIntegration: null`.

### 6. Documentación de variables

Añadir en [`apps/web/.env.example`](projects/10x-builders-agent/apps/web/.env.example) un bloque tipo:

```bash
# File tools (read_file / write_file / edit_file)
# Master gate: requerido para que las tools se expongan al grafo.
ALLOW_FILE_TOOLS=false

# (Opcional) Si se configura, todas las rutas se confinan dentro de este
# directorio y los paths relativos se resuelven contra él. Si NO se configura,
# las tools aceptan únicamente paths absolutos (los relativos fallan con
# REQUIRES_ABSOLUTE_PATH) y el alcance lo dictan los permisos del proceso —
# úsalo solo en entornos confiables (proyecto personal / dev local).
# FILE_TOOLS_WORKSPACE_ROOT=/Users/johny/Dev/personal

# (Opcional) Cap defensivo de bytes para read_file y write_file. Default 1_000_000.
# FILE_TOOL_MAX_BYTES=1000000
```

### 7. Smoke script

Crear `packages/agent/scripts/smoke-file-tools.ts` (análogo al smoke del checkpointer en `6f2bb8a`). Debe ejercitar al menos:

- `read_file` con path absoluto válido → OK.
- `read_file` con path relativo y sin `FILE_TOOLS_WORKSPACE_ROOT` → `REQUIRES_ABSOLUTE_PATH`.
- `read_file` con path absoluto fuera del root configurado → `OUT_OF_SANDBOX`.
- `read_file` siguiendo un symlink (dentro del sandbox) que apunta fuera → `OUT_OF_SANDBOX`.
- `read_file` con archivo > `FILE_TOOL_MAX_BYTES` → `FILE_TOO_LARGE`.
- `write_file` sobre archivo nuevo → OK.
- `write_file` sobre archivo existente → `FILE_ALREADY_EXISTS`.
- `write_file` con `content` > cap → `FILE_TOO_LARGE`.
- `edit_file` con match único → OK con `snippet` y `bytes_written`.
- `edit_file` con `old_string` no presente → `MATCH_NOT_FOUND`.
- `edit_file` con `old_string` duplicado → `MATCH_NOT_UNIQUE` con `details.count`.
- `edit_file` sobre archivo CRLF con `old_string` LF → `MATCH_NOT_FOUND` con `details.hint` de CRLF.
- `edit_file` sobre archivo con BOM con `old_string` sin BOM → `MATCH_NOT_FOUND` con `details.hint` de BOM.

## Notas y trade-offs

- **Entorno confiable asumido**: este proyecto es personal y de aprendizaje. Sin `FILE_TOOLS_WORKSPACE_ROOT` el alcance lo determinan los permisos del proceso (todo lo que el usuario `node` pueda leer/escribir), incluyendo rutas sensibles como `~/.ssh` o `/etc/...`. La disciplina del operador es el control: si no defines el root, asume que confías plenamente en el contexto donde corre el agente. El gate `ALLOW_FILE_TOOLS=false` por defecto y la confirmación HITL en `edit_file` siguen siendo la red de seguridad.
- **Symlink hardening**: cuando hay root configurado, `realpath` cierra el bypass por symlinks "internos que apuntan fuera". Sin root no se aplica `realpath` extra (sería redundante: ya aceptamos cualquier path absoluto en modo confiable).
- **Por qué rechazamos relativos sin root**: resolverlos contra `process.cwd()` invita a errores donde el agente lee un archivo "del proyecto" pero apuntando al CWD del servicio. Forzar absolutos hace explícita la intención del modelo y permite que el LLM pida ayuda al usuario o use `bash` para localizar.
- **`write_file` como `low`**: solo crea archivos nuevos (flag `wx` + `fs.rename` atómico); nunca interviene flujos existentes. Si más tarde se quiere endurecer, basta con subir el `risk` en el catálogo y añadir un caso en `summariseToolCall`.
- **`edit_file` y race condition**: entre el `interrupt()` y el resume puede cambiar el archivo. Por eso reverificamos el match (count exacto) en el momento del side-effect; si ya no calza, devolvemos `MATCH_NOT_FOUND`/`MATCH_NOT_UNIQUE` y el LLM puede recuperar el contexto con `read_file`. La escritura es vía tempfile + `fs.rename` para que sea atómica respecto a otros lectores.
- **CRLF y BOM**: la comparación de `old_string` es **byte-exact**. No strippeamos BOM ni normalizamos line endings (hacerlo corrompería archivos generados en Windows/Excel). En su lugar, cuando el match falla y detectamos esa discrepancia, devolvemos un `details.hint` que le permite al LLM ajustar `old_string` y reintentar.
- **No persistencia de diff**: `edit_file` no guarda el contenido previo; si más adelante quieres deshacer ediciones, sería un módulo aparte (no pedido). La tarjeta de confirmación sí muestra el diff, y el resultado OK incluye `snippet` para que el LLM pueda comunicárselo al usuario.
- **Codificación**: solo UTF-8. Archivos binarios o no-utf8 disparan `IO_ERROR` con detalle claro.
