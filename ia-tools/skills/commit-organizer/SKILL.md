---
name: commit-organizer
description: >-
  Analiza cambios en el repositorio (staged y unstaged), los agrupa por
  directorio/tipo/temática, y propone commits organizados siguiendo
  Conventional Commits en español. Ejecuta los commits tras aprobación
  del usuario. Usar cuando el usuario pida organizar commits, agrupar
  cambios, preparar commits, o hacer commit de muchos archivos.
---

# Commit Organizer

Organiza cambios pendientes en commits agrupados por scope y tipo, siguiendo Conventional Commits en español.

## Regla de oro

**Nunca ejecutar commits sin aprobación explícita del usuario.** La fase de análisis es de solo lectura; no se modifica staging ni working tree hasta recibir confirmación.

## Flujo principal

### 1. Análisis (solo lectura)

Ejecutar estos comandos para recopilar información:

```bash
git status
git diff
git diff --cached
git log --oneline -15
```

Si no hay cambios (ni staged ni unstaged ni untracked), comunicarlo al usuario y detenerse.

### 2. Agrupación

Clasificar cada archivo modificado según estas reglas:

**Derivación de scope:**

| Directorio de primer nivel | Scope |
|---|---|
| `week-01/`, `week-02/`, `week-03/` | `(week-01)`, `(week-02)`, `(week-03)` |
| `docs/` | `(docs)` |
| `ia-tools/` | `(ia-tools)` |
| `projects/<nombre-proyecto>/` | `(<nombre-proyecto>)` — baja un nivel |

**Derivación de type:**

| Tipo | Cuándo usarlo |
|---|---|
| `docs` | Apuntes, lecciones, documentación (`week-XX/`, `docs/`) |
| `feat` | Funcionalidad nueva en proyectos |
| `fix` | Corrección de bugs |
| `test` | Tests |
| `refactor` | Reestructuración sin cambio funcional |
| `style` | Formato, estilos, sin cambio lógico |
| `chore` | Configuración, tooling, mantenimiento |
| `ci` | Pipelines, GitHub Actions |

No inventar tipos fuera de esta lista.

**Reglas de agrupación:**

- Nunca mezclar archivos de scopes de primer nivel distintos en un mismo commit
- Si un cambio afecta múltiples subdirectorios del mismo scope, agruparlos (ej: `feat(twitter-clon/app, api)`)
- Los archivos borrados (`D`) se incluyen en el commit del scope al que pertenecían
- Los archivos untracked (nuevos) se incluyen en la propuesta dentro del grupo correspondiente

### 3. Propuesta

Presentar la propuesta al usuario con este formato exacto:

```
Propuesta de commits (N):

| # | Commit | Archivos |
|---|--------|----------|
| 1 | docs(week-03): añadir lección sobre ecosistema LangChain | week-03/lesson-10.md, week-03/lesson-11.md |
| 2 | feat(langchain-agent): implementar herramienta de vuelos | src/agent/tools/flights.ts, tests/flights.test.ts |
| 3 | chore(ia-tools): añadir brief de skill commit-organizer | ia-tools/planning/briefs/brief-skill-*.md |

¿Aprobar esta propuesta? (aprobar / ajustar / cancelar)
```

**Orden lógico de los commits:**
1. `docs` / apuntes (`week-XX/`, `docs/`)
2. `feat` / `fix` (proyectos)
3. `test` / `refactor` / `style`
4. `chore` / `ci` (configuración y tooling)

### 4. Aprobación

Esperar la respuesta del usuario:

- **Aprobar** → continuar a ejecución
- **Ajustar** → aplicar los cambios solicitados y volver a presentar la propuesta
- **Cancelar** → abortar sin modificar nada

### 5. Ejecución

1. Si hay archivos pre-staged, ejecutar `git reset` (sin `--hard`) para limpiar el staging. Informar al usuario antes de hacerlo.
2. Para cada commit de la propuesta, en orden:
   - `git add <archivos del grupo>`
   - `git commit -m "type(scope): descripción"`
3. Si un `git commit` falla: detenerse inmediatamente, informar qué commits se completaron y cuáles quedan pendientes. No continuar automáticamente.

### 6. Reporte final

Mostrar un resumen de los commits realizados con sus hashes.

## Reglas de Conventional Commits

- Formato estricto: `type(scope): descripción`
- Descripciones siempre en **español**
- Consultar `git log` antes de proponer para mantener coherencia con el historial existente (formato, temas, relación con commits previos)
- Los tipos permitidos son exclusivamente: `feat`, `fix`, `docs`, `test`, `chore`, `refactor`, `style`, `ci`

## Fuera del alcance

Este skill NO debe:
- Crear branches, abrir PRs o hacer push al remoto
- Resolver conflictos de merge
- Ejecutar linters o tests antes de commitear
- Modificar configuración de Git (`.gitconfig`, `.gitignore`)
