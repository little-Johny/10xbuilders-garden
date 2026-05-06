import type { ToolDefinition, ToolRisk } from "@agents/types";

const PATHS_BLOCK =
  "PATHS: usa preferentemente paths absolutos (ej. /Users/johny/proyectos/foo/README.md); funcionan en todos los entornos. Los paths relativos solo son válidos si el servidor tiene configurado FILE_TOOLS_WORKSPACE_ROOT (en cuyo caso se resuelven contra ese root). Si no estás seguro de la ubicación de un archivo, pídele al usuario el path absoluto o usa `bash` con `pwd`/`ls`/`find <dir> -name <patrón>` para localizarlo antes de invocar esta tool. La tool siempre devuelve el path absoluto resuelto en `path` para que puedas referenciarlo sin ambigüedad en llamadas posteriores.";

export const READ_FILE_DESCRIPTION = `Lee el contenido de un archivo de texto UTF-8. ÚSALA siempre que necesites ver el contenido de un archivo: prefiérela sobre \`bash\` con \`cat\`, \`head\`, \`tail\` o \`sed -n\`. NO ejecuta comandos, NO sigue symlinks fuera del sandbox (si está activo) y NO lee binarios.

${PATHS_BLOCK}

PROCESO: resuelve y valida \`path\` (incluyendo realpath para resolver symlinks cuando hay sandbox), lee el archivo completo o el rango [offset, offset+limit) si se proveen (líneas 1-indexed), y devuelve cada línea con prefijo "   N|". SALIDA OK: { ok: true, path, content, total_lines, returned_lines, offset, truncated }. ERRORES ({ ok: false, code, message, details? }): REQUIRES_ABSOLUTE_PATH (path relativo y no hay sandbox configurado — repítela con path absoluto), FILE_NOT_FOUND, PATH_IS_DIRECTORY, OUT_OF_SANDBOX, FILE_TOO_LARGE, INVALID_RANGE, PERMISSION_DENIED, IO_ERROR.`;

export const WRITE_FILE_DESCRIPTION = `CREA un archivo nuevo con el contenido literal dado (UTF-8). NO sobrescribe: si \`path\` ya existe falla con FILE_ALREADY_EXISTS — para modificar archivos existentes usa \`edit_file\`. NO crea directorios intermedios. ÚSALA para escribir archivos completos desde cero con contenido conocido; si necesitas heredocs, plantillas con variables de shell, generación masiva o \`mkdir -p\` previo, usa \`bash\`.

${PATHS_BLOCK}

PROCESO: valida path (incluyendo realpath del directorio padre cuando hay sandbox) → escribe content a un tempfile en el mismo directorio → fs.rename atómico al destino con flag exclusivo wx. SALIDA OK: { ok: true, path, bytes_written }. ERRORES: REQUIRES_ABSOLUTE_PATH, FILE_ALREADY_EXISTS, PARENT_DIR_NOT_FOUND, OUT_OF_SANDBOX, FILE_TOO_LARGE, PERMISSION_DENIED, IO_ERROR.`;

export const EDIT_FILE_DESCRIPTION = `Reemplaza UNA ocurrencia literal y exacta de \`old_string\` por \`new_string\` en un archivo EXISTENTE. Pensada para cambios quirúrgicos y reproducibles: si el match no es único, amplía \`old_string\` con suficiente contexto (líneas antes/después) hasta que solo aparezca una vez. NO crea archivos (usa \`write_file\`). Para regex, múltiples reemplazos, mover/renombrar/borrar o ediciones batch usa \`bash\`. Requiere confirmación del usuario.

${PATHS_BLOCK}

PROCESO: lee el archivo → cuenta ocurrencias literales de old_string → si 0: MATCH_NOT_FOUND (con details.hint si el archivo usa CRLF o BOM y old_string no); si >1: MATCH_NOT_UNIQUE con details.count (recupera contexto con read_file y reintenta con old_string más específico); si 1: reemplaza, escribe a tempfile y fs.rename atómico. SALIDA OK: { ok: true, path, replacements: 1, bytes_written, snippet } donde snippet muestra 2-3 líneas de contexto antes/después del cambio para que verifiques el resultado. ERRORES: REQUIRES_ABSOLUTE_PATH, FILE_NOT_FOUND, MATCH_NOT_FOUND, MATCH_NOT_UNIQUE, OUT_OF_SANDBOX, FILE_TOO_LARGE, PATH_IS_DIRECTORY, PERMISSION_DENIED, IO_ERROR.`;

export const TOOL_CATALOG: ToolDefinition[] = [
  {
    id: "get_user_preferences",
    name: "get_user_preferences",
    description: "Returns the current user preferences and agent configuration.",
    risk: "medium",
    parameters_schema: { type: "object", properties: {}, required: [] },
  },
  {
    id: "list_enabled_tools",
    name: "list_enabled_tools",
    description: "Lists all tools the user has currently enabled.",
    risk: "low",
    parameters_schema: { type: "object", properties: {}, required: [] },
  },
  {
    id: "github_list_repos",
    name: "github_list_repos",
    description: "Lists the user's GitHub repositories.",
    risk: "low",
    requires_integration: "github",
    parameters_schema: {
      type: "object",
      properties: {
        per_page: { type: "number", description: "Results per page (max 30)" },
      },
      required: [],
    },
  },
  {
    id: "github_list_issues",
    name: "github_list_issues",
    description: "Lists issues for a given repository.",
    risk: "low",
    requires_integration: "github",
    parameters_schema: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        state: { type: "string", enum: ["open", "closed", "all"] },
      },
      required: ["owner", "repo"],
    },
  },
  {
    id: "github_create_issue",
    name: "github_create_issue",
    description:
      "Creates a new issue in a GitHub repository. Requires user confirmation before executing.",
    risk: "medium",
    requires_integration: "github",
    parameters_schema: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        title: { type: "string" },
        body: { type: "string" },
      },
      required: ["owner", "repo", "title"],
    },
  },
  {
    id: "github_create_repo",
    name: "github_create_repo",
    description:
      "Creates a new repository in the authenticated user's GitHub account. Requires user confirmation before executing.",
    risk: "high",
    requires_integration: "github",
    parameters_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        description: { type: "string" },
        private: { type: "boolean" },
      },
      required: ["name"],
    },
  },
  {
    id: "gcal_list_events",
    name: "gcal_list_events",
    description:
      "Lists Google Calendar events on the user's primary calendar within a time range. Recurrences are expanded into individual instances.",
    risk: "low",
    requires_integration: "google",
    parameters_schema: {
      type: "object",
      properties: {
        time_min: { type: "string", description: "RFC3339 start of range" },
        time_max: { type: "string", description: "RFC3339 end of range" },
        q: { type: "string", description: "Optional free-text query" },
      },
      required: ["time_min", "time_max"],
    },
  },
  {
    id: "gcal_get_event",
    name: "gcal_get_event",
    description:
      "Fetches the full details of a single Google Calendar event by id, including its recurrence rule if any.",
    risk: "low",
    requires_integration: "google",
    parameters_schema: {
      type: "object",
      properties: {
        event_id: { type: "string" },
      },
      required: ["event_id"],
    },
  },
  {
    id: "gcal_create_event",
    name: "gcal_create_event",
    description:
      "Creates an event on the user's primary Google Calendar. Supports recurring events. Requires user confirmation before executing.",
    risk: "medium",
    requires_integration: "google",
    parameters_schema: {
      type: "object",
      properties: {
        summary: { type: "string" },
        description: { type: "string" },
        start: { type: "string", description: "RFC3339 start datetime" },
        end: { type: "string", description: "RFC3339 end datetime" },
        time_zone: { type: "string", description: "IANA timezone (defaults to user's)" },
        attendees: { type: "array", items: { type: "string" } },
        recurrence: { type: "object" },
      },
      required: ["summary", "start", "end"],
    },
  },
  {
    id: "gcal_update_event",
    name: "gcal_update_event",
    description:
      "Modifies an existing Google Calendar event. Use scope='instance' to change a single occurrence (pass the instance id from gcal_list_events) or scope='series' to change the master event. Requires user confirmation.",
    risk: "medium",
    requires_integration: "google",
    parameters_schema: {
      type: "object",
      properties: {
        event_id: { type: "string" },
        scope: { type: "string", enum: ["instance", "series"] },
        summary: { type: "string" },
        description: { type: "string" },
        start: { type: "string" },
        end: { type: "string" },
        time_zone: { type: "string" },
      },
      required: ["event_id", "scope"],
    },
  },
  {
    id: "gcal_delete_event",
    name: "gcal_delete_event",
    description:
      "Deletes a Google Calendar event. Use scope='instance' to delete a single occurrence (pass the instance id) or scope='series' to delete the entire recurring event. Requires user confirmation.",
    risk: "high",
    requires_integration: "google",
    parameters_schema: {
      type: "object",
      properties: {
        event_id: { type: "string" },
        scope: { type: "string", enum: ["instance", "series"] },
      },
      required: ["event_id", "scope"],
    },
  },
  {
    id: "bash",
    name: "bash",
    description:
      "Ejecuta un comando en bash (sistemas unix-like) en el servidor. Cada llamada crea un proceso nuevo (`/bin/bash -lc`) sin estado persistente entre llamadas: variables, `cd`, exports solo viven dentro de esa ejecución. Usa `cwd` para fijar la carpeta base de esta invocación. Requiere confirmación del usuario.\n\nPREFERENCIA: si solo necesitas leer un archivo de texto usa `read_file`; si vas a crear un archivo nuevo con contenido conocido usa `write_file`; si vas a aplicar un find/replace exacto sobre un archivo existente usa `edit_file`. Reserva `bash` para: localizar archivos (`pwd`, `ls`, `find`), listar/mover/renombrar/borrar, crear directorios intermedios, cambiar permisos, ejecutar binarios, pipelines, regex con `sed`/`awk`, lectura binaria, o trabajo fuera de FILE_TOOLS_WORKSPACE_ROOT.",
    risk: "high",
    parameters_schema: {
      type: "object",
      properties: {
        command: { type: "string" },
        cwd: { type: "string" },
      },
      required: ["command"],
    },
  },
  {
    id: "read_file",
    name: "read_file",
    description: READ_FILE_DESCRIPTION,
    risk: "low",
    parameters_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            "Path absoluto (recomendado). Si el servidor configuró FILE_TOOLS_WORKSPACE_ROOT también acepta relativos resueltos contra ese root.",
        },
        offset: {
          type: "number",
          description: "Línea inicial 1-indexed (opcional). Default: 1.",
        },
        limit: {
          type: "number",
          description: "Número máximo de líneas a devolver (opcional). Default: archivo completo.",
        },
      },
      required: ["path"],
    },
  },
  {
    id: "write_file",
    name: "write_file",
    description: WRITE_FILE_DESCRIPTION,
    risk: "low",
    parameters_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Ruta del archivo NUEVO a crear (no debe existir).",
        },
        content: {
          type: "string",
          description: "Contenido literal UTF-8; se escribe byte a byte sin interpolación.",
        },
      },
      required: ["path", "content"],
    },
  },
  {
    id: "edit_file",
    name: "edit_file",
    description: EDIT_FILE_DESCRIPTION,
    risk: "high",
    parameters_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Ruta del archivo existente a modificar." },
        old_string: {
          type: "string",
          description:
            "Texto literal a buscar; debe aparecer EXACTAMENTE una vez en el archivo.",
        },
        new_string: {
          type: "string",
          description:
            "Texto que reemplazará a old_string (puede ser cadena vacía para borrar el match).",
        },
      },
      required: ["path", "old_string", "new_string"],
    },
  },
];

export function getToolRisk(toolId: string): ToolRisk {
  return TOOL_CATALOG.find((t) => t.id === toolId)?.risk ?? "high";
}

export function toolRequiresConfirmation(toolId: string): boolean {
  const risk = getToolRisk(toolId);
  return risk === "medium" || risk === "high";
}
