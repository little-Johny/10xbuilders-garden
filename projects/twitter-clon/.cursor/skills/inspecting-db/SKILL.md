---
name: inspecting-db
description: Guía para inspeccionar la base de datos Supabase en solo lectura mediante el MCP local-supabase (esquema, consultas SELECT, logs, asesores, documentación). Usar al depurar, entender tablas/columnas/relaciones, revisar migraciones o extensiones, o cuando el usuario mencione inspecting-db, inspección de schema o consultas de solo lectura vía MCP. No usar para cambiar el esquema ni los datos por MCP.
---

# Inspeccionar la base de datos (MCP Supabase, solo lectura)

Este flujo es **exclusivamente de lectura**: depuración, consultas informativas y comprensión del esquema. Los cambios de esquema o datos se hacen fuera de este skill (p. ej. migraciones con CLI; ver skill **modifying-db**).

## Servidor MCP

- **Identificador:** `project-0-twitter-clon-local-supabase` (nombre visible: **local-supabase**).
- Antes de invocar una herramienta con `call_mcp_tool`, leer el descriptor JSON en la carpeta `mcps` de Cursor (`mcps/<servidor>/tools/<herramienta>.json`) para parámetros obligatorios y tipos.

## Herramientas permitidas (inspección)

| Herramienta | Uso |
|-------------|-----|
| `list_tables` | Tablas por esquema (`schemas`, p. ej. `["public"]`). `verbose: true` para columnas, PK y FK. |
| `execute_sql` | Solo consultas **de lectura** (ver sección siguiente). |
| `list_migrations` | Listar migraciones registradas en la base. |
| `list_extensions` | Extensiones instaladas. |
| `get_advisors` | Avisos `security` u `performance` (incluir URL de remediación como enlace al usuario). |
| `get_logs` | Logs recientes (~24 h): `api`, `postgres`, `auth`, `storage`, `realtime`, `edge-function`, `branch-action`. |
| `get_project_url` | URL del API del proyecto. |
| `get_publishable_keys` | Claves publicables; tratar como sensibles y no exponerlas sin necesidad. |
| `search_docs` | Búsqueda en documentación Supabase (`graphql_query` GraphQL válido). |

## `execute_sql`: solo lectura

- **Permitido:** `SELECT`, `EXPLAIN` de consultas de lectura, vistas a `information_schema` / `pg_catalog` para metadatos.
- **Prohibido:** `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, DDL (`CREATE`, `ALTER`, `DROP`, …), `GRANT`, funciones que muten datos o esquema.
- El descriptor del MCP indica usar `apply_migration` para DDL; en este skill **no** se usa `apply_migration` para nada.

## Herramientas que no se usan en este skill

| Herramienta | Motivo |
|-------------|--------|
| `apply_migration` | Aplica DDL y modifica la base. Para migraciones usar el flujo CLI (**modifying-db**), no el MCP. |

`generate_typescript_types` (MCP) genera tipos; no muta la DB, pero los cambios de tipos “oficiales” del repo siguen el script `npm run supabase:gen` en la raíz. No usar el MCP como sustituto de migraciones ni mezclar con flujos de escritura.

## Resumen de reglas

1. Comprender tablas/relaciones: `list_tables` con `verbose: true` cuando haga falta detalle.
2. Datos o comprobaciones puntuales: `execute_sql` solo con SQL de lectura.
3. Contexto de despliegue o cliente: `get_project_url` / claves solo si aportan al debugging (minimizar exposición de secretos).
4. Problemas de seguridad/rendimiento tras cambios: `get_advisors`.
5. Fallos en runtime: `get_logs` (elegir `service` acorde al síntoma).
6. Dudas de producto/API Supabase: `search_docs`.

Si hace falta **modificar** la base, dejar de usar este skill y aplicar **modifying-db** (migraciones locales con `npx supabase migration new`, etc.).
