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
    id: "gsheets_list_sheets",
    name: "gsheets_list_sheets",
    description:
      "Lista las pestañas (hojas) de un spreadsheet de Google Sheets dado su id. Devuelve título, sheetId interno y dimensiones de cada pestaña. El spreadsheet_id lo debe proveer el usuario (o haber sido devuelto por gsheets_create_spreadsheet); no se busca por nombre.",
    risk: "low",
    requires_integration: "google",
    parameters_schema: {
      type: "object",
      properties: {
        spreadsheet_id: {
          type: "string",
          description: "ID del spreadsheet (la cadena base64-like de la URL).",
        },
      },
      required: ["spreadsheet_id"],
    },
  },
  {
    id: "gsheets_read_range",
    name: "gsheets_read_range",
    description:
      "Lee un rango A1 de un spreadsheet (ej. 'Hoja 1!A1:C20' o 'A:A'). Devuelve filas como arreglos. value_render_option controla cómo se formatean: FORMATTED_VALUE (default) entrega lo que ve el usuario, UNFORMATTED_VALUE da el dato bruto, FORMULA muestra la fórmula original. No requiere confirmación.",
    risk: "low",
    requires_integration: "google",
    parameters_schema: {
      type: "object",
      properties: {
        spreadsheet_id: { type: "string" },
        range: {
          type: "string",
          description: "Rango A1, ej. 'Hoja 1!A1:C20' o 'A1:B10'.",
        },
        value_render_option: {
          type: "string",
          enum: ["FORMATTED_VALUE", "UNFORMATTED_VALUE", "FORMULA"],
        },
      },
      required: ["spreadsheet_id", "range"],
    },
  },
  {
    id: "gsheets_append_row",
    name: "gsheets_append_row",
    description:
      "Añade una fila al final de la hoja indicada por el rango (ej. 'Gastos!A:D'). Inserta SIN sobrescribir filas existentes. value_input_option: 'USER_ENTERED' (default) interpreta strings que empiezan con '=' como fórmulas y formatea fechas/números; 'RAW' las guarda literales. Requiere confirmación del usuario.",
    risk: "medium",
    requires_integration: "google",
    parameters_schema: {
      type: "object",
      properties: {
        spreadsheet_id: { type: "string" },
        range: {
          type: "string",
          description: "Rango de la hoja donde agregar, típicamente 'NombreHoja!A:D'.",
        },
        values: {
          type: "array",
          description: "Arreglo plano con los valores de la fila a agregar.",
          items: { type: ["string", "number", "boolean", "null"] },
        },
        value_input_option: {
          type: "string",
          enum: ["RAW", "USER_ENTERED"],
        },
      },
      required: ["spreadsheet_id", "range", "values"],
    },
  },
  {
    id: "gsheets_update_range",
    name: "gsheets_update_range",
    description:
      "Sobrescribe un rango A1 con los valores dados (matriz filas x columnas). Si el rango es más grande que los valores, las celdas restantes no se tocan. value_input_option: 'USER_ENTERED' (default) interpreta strings que empiezan con '=' como fórmulas; 'RAW' las guarda literales. Tope de seguridad: 10.000 celdas por llamada. Requiere confirmación del usuario.",
    risk: "medium",
    requires_integration: "google",
    parameters_schema: {
      type: "object",
      properties: {
        spreadsheet_id: { type: "string" },
        range: { type: "string", description: "Rango A1 a sobrescribir." },
        values: {
          type: "array",
          description: "Matriz 2D filas x columnas.",
          items: {
            type: "array",
            items: { type: ["string", "number", "boolean", "null"] },
          },
        },
        value_input_option: {
          type: "string",
          enum: ["RAW", "USER_ENTERED"],
        },
      },
      required: ["spreadsheet_id", "range", "values"],
    },
  },
  {
    id: "gsheets_create_spreadsheet",
    name: "gsheets_create_spreadsheet",
    description:
      "Crea un spreadsheet nuevo en el Drive del usuario con el título dado y, opcionalmente, una lista de pestañas iniciales. Devuelve el spreadsheetId, la URL y los sheetId internos. Si se indica register_as, además registra la hoja con ese alias para poder referenciarla luego por nombre (equivale a llamar gsheets_save_reference). Requiere confirmación del usuario.",
    risk: "medium",
    requires_integration: "google",
    parameters_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Nombre del nuevo spreadsheet." },
        sheets: {
          type: "array",
          description: "Pestañas a crear. Si se omite, Google crea una sola con nombre 'Sheet1'.",
          items: {
            type: "object",
            properties: { title: { type: "string" } },
            required: ["title"],
          },
        },
        register_as: {
          type: "string",
          description:
            "Opcional. Alias con el que registrar la hoja recién creada para referenciarla luego por nombre (ej. 'gym'). Si se omite, la hoja se crea pero no se registra.",
        },
      },
      required: ["title"],
    },
  },
  {
    id: "gsheets_save_reference",
    name: "gsheets_save_reference",
    description:
      "Registra (o actualiza) una hoja de Google Sheets del usuario bajo un alias legible, para poder referenciarla luego por nombre sin pegar el spreadsheet_id. El alias es case-insensitive; si ya existe, se sobrescribe. Útil cuando el usuario dice 'guardá esta hoja como X'. Requiere confirmación del usuario.",
    risk: "medium",
    parameters_schema: {
      type: "object",
      properties: {
        alias: {
          type: "string",
          description: "Nombre corto por el que el usuario llamará a la hoja (ej. 'gym', 'gastos').",
        },
        spreadsheet_id: {
          type: "string",
          description: "ID del spreadsheet (la cadena base64-like de la URL).",
        },
        default_tab: {
          type: "string",
          description: "Opcional. Pestaña por defecto a usar cuando se opere sobre esta hoja.",
        },
        description: {
          type: "string",
          description: "Opcional. Para qué sirve la hoja; ayuda a decidir cuándo usarla.",
        },
      },
      required: ["alias", "spreadsheet_id"],
    },
  },
  {
    id: "gsheets_list_references",
    name: "gsheets_list_references",
    description:
      "Lista las hojas de Google Sheets que el usuario tiene registradas (alias, spreadsheet_id, pestaña por defecto y descripción). No requiere confirmación.",
    risk: "low",
    parameters_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    id: "gsheets_delete_reference",
    name: "gsheets_delete_reference",
    description:
      "Elimina una referencia de hoja registrada por su alias (case-insensitive). No borra el spreadsheet en Google, solo la referencia local. Requiere confirmación del usuario.",
    risk: "medium",
    parameters_schema: {
      type: "object",
      properties: {
        alias: { type: "string", description: "Alias de la hoja a eliminar." },
      },
      required: ["alias"],
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
  {
    id: "create_scheduled_task",
    name: "create_scheduled_task",
    description:
      "Crea una tarea recurrente que el agente ejecutará automáticamente. La 'description' debe ser un PROMPT en lenguaje natural que el agente recibirá como mensaje del usuario cada vez que se dispare (p.ej. 'resúmeme mis issues abiertos en GitHub'). cron_expression usa formato estándar de 5 campos (minuto hora día-mes mes día-semana). Si el usuario dice 'mañana' o 'cada lunes', usa la fecha y zona horaria del contexto temporal del system prompt para resolverlo. autonomous=true ejecuta sin pedir confirmación al disparar; usa false (default) para tareas que invocan acciones medium/high. Requiere confirmación del usuario.",
    risk: "medium",
    parameters_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Nombre corto descriptivo (ej. 'Resumen de issues')." },
        description: {
          type: "string",
          description:
            "Prompt natural que el agente recibirá como mensaje cuando se dispare la tarea.",
        },
        cron_expression: {
          type: "string",
          description: "Cron 5-campos. Ej: '0 9 * * 1' = lunes 9am.",
        },
        timezone: {
          type: "string",
          description: "IANA timezone (ej. America/Bogota). Default: la del perfil del usuario.",
        },
        start_at: {
          type: "string",
          description: "RFC3339; la tarea no se dispara antes de esta fecha. Opcional.",
        },
        end_at: {
          type: "string",
          description: "RFC3339; la tarea deja de dispararse después de esta fecha. Opcional.",
        },
        autonomous: {
          type: "boolean",
          description: "Si true, ejecuta sin HITL en cada disparo. Default: false.",
        },
        notification_channels: {
          type: "array",
          items: { type: "string", enum: ["telegram"] },
          description: "Canales de notificación. Default: ['telegram'].",
        },
      },
      required: ["name", "description", "cron_expression"],
    },
  },
  {
    id: "list_scheduled_tasks",
    name: "list_scheduled_tasks",
    description:
      "Lista las tareas programadas del usuario. Útil para mostrar lo agendado, encontrar el id de una tarea antes de eliminarla, o auditar qué hay en cola.",
    risk: "low",
    parameters_schema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["active", "paused", "completed", "failed"],
          description: "Filtrar por estado. Opcional.",
        },
      },
      required: [],
    },
  },
  {
    id: "update_scheduled_task",
    name: "update_scheduled_task",
    description:
      "Activa o desactiva una tarea programada sin eliminarla. Usa enabled=false para PAUSAR (la tarea deja de dispararse pero conserva su historial, last_execution y configuración) y enabled=true para REANUDARLA. Para borrar permanentemente usa delete_scheduled_task. Antes de llamar a esta tool usa list_scheduled_tasks para confirmar el id correcto. Requiere confirmación del usuario.",
    risk: "medium",
    parameters_schema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "UUID de la tarea." },
        enabled: {
          type: "boolean",
          description: "true = reanudar; false = pausar.",
        },
      },
      required: ["task_id", "enabled"],
    },
  },
  {
    id: "delete_scheduled_task",
    name: "delete_scheduled_task",
    description:
      "Elimina permanentemente una tarea programada por su id. Antes de llamar a esta tool, usa list_scheduled_tasks para confirmar el id correcto. Requiere confirmación del usuario.",
    risk: "high",
    parameters_schema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "UUID de la tarea a eliminar." },
      },
      required: ["task_id"],
    },
  },
];

export function isScheduledTasksToolAllowed(): boolean {
  return process.env.ALLOW_SCHEDULED_TASKS_TOOL === "true";
}

export function getToolRisk(toolId: string): ToolRisk {
  return TOOL_CATALOG.find((t) => t.id === toolId)?.risk ?? "high";
}

export function toolRequiresConfirmation(toolId: string): boolean {
  const risk = getToolRisk(toolId);
  return risk === "medium" || risk === "high";
}
