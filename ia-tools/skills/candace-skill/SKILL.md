---
name: candace-skill
description: >
  Genera y actualiza documentación `.md` del repo 10xbuilders-garden: apuntes de
  clase/lección/sesión en `week-XX/`, READMEs de directorios, índices y resúmenes.
  Lee templates de `docs/` y delega a sub-agentes cuando corresponde. INVÓCALA
  SIEMPRE que el usuario pida —con CUALQUIER redacción, aunque no use estas
  palabras exactas— crear, escribir, redactar o "ayudar con" apuntes/notas de una
  sesión, clase, lección o tema; convertir un temario a apuntes; o documentar una
  clase. Ejemplos que deben dispararla: "créame los apuntes de la sesión 4",
  "ayúdame a crear los apuntes de la semana 7", "documenta esta clase", "pásame
  este temario a apuntes", "necesito el apunte del tema X", "hazme las notas de
  la lección". También cuando pida crear/actualizar un README, generar un índice
  o sincronizar documentación tras cambios estructurales del repo. Para apuntes de
  lección, la redacción del archivo se delega a un sub-agente dedicado.
---

# candace-skill — Documentación del repo

Mantén la documentación `.md` del repositorio `10xbuilders-garden` sincronizada con su contenido real, y produce cualquier documento `.md` que el usuario solicite (apuntes de clase, READMEs, índices, resúmenes).

Toda la salida es en **español**.

---

## Reglas de oro

1. **Solo archivos `.md`.** Nunca modificar código fuente ni archivos de configuración.
2. **No crear directorios nuevos.** Solo escribir archivos dentro de la estructura existente.
3. **Respetar `.gitignore`.** No generar documentación en directorios ignorados (`node_modules/`, `dist/`, etc.).
4. **No generar documentos vacíos.** Todo `.md` producido debe tener contenido útil y navegable.
5. **Proponer antes de escribir.** Siempre presentar la lista de archivos y un preview del contenido al usuario, y esperar aprobación inline.
6. **Los apuntes de lección se escriben con un sub-agente.** Tras la aprobación, la redacción de un apunte `week-XX/` NO se hace en línea: se delega a un sub-agente dedicado (ver Paso 6). El resto de documentos (READMEs, índices, resúmenes) se escriben directamente.

---

## Cuándo usar este skill

- Generar apuntes de una clase o lección (`week-XX/`).
- Crear un README para un directorio que no lo tiene.
- Actualizar un README desactualizado tras cambios estructurales del repo.
- Generar índices o resúmenes que faciliten la navegación.
- Sincronizar documentación cuando se sospecha drift respecto al estado real del código.

---

## Flujo

### Paso 1 — Entender el encargo

Leer el prompt del usuario y clasificar el tipo de trabajo:

- **Apunte de lección** → la salida típica va a `week-XX/`.
- **README de directorio** → la salida es `<directorio>/README.md`.
- **README raíz** → `README.md` en la raíz del repo.
- **Índice o resumen** → archivo `.md` descriptivo con nombre en kebab-case.

### Paso 2 — Descubrir templates

Listar `docs/` para encontrar templates aplicables. Convenciones actuales:

- `docs/lesson-note-template.md` → estructura base para apuntes de clase.
- `docs/LESSON-PROMPT.md` → guía para producir apuntes a partir de un temario.

Si el encargo encaja con un template, usarlo como base. Si no hay template aplicable, seguir las convenciones de archivos existentes del mismo tipo.

### Paso 3 — Exploración (elegir el peso adecuado)

Decidir cuánto explorar según el alcance:

**Lectura directa con `Read` / `Grep`** cuando el target es conocido y acotado:

- Generar un apunte específico → leer el temario aportado, 1-2 apuntes existentes del mismo formato, y los archivos del repo que se vayan a referenciar.
- Actualizar un README concreto → leer ese README y los archivos del directorio que documenta.

**Delegar al sub-agent `Explore`** (vía tool `Agent`) cuando el alcance es difuso o requiere escanear muchos archivos:

- Sincronizar el `README.md` raíz tras cambios estructurales grandes.
- Auditar todo el repo en busca de directorios sin documentación.
- Mapear cambios distribuidos en múltiples directorios para decidir qué READMEs actualizar.

Al invocar `Explore`, pasar un objetivo concreto y pedir un reporte breve. No usar `Explore` para abrir archivos cuya ruta ya conoces — en ese caso `Read` directo es más eficiente.

### Paso 4 — Descubrir sub-agentes de proyecto

Si el encargo toca un directorio bajo `projects/<X>/`, verificar si ese proyecto tiene su propio agente de documentación:

1. Buscar `.md` en `projects/<X>/.cursor/agents/` y `projects/<X>/.claude/agents/`.
2. Leer el frontmatter de cada uno.
3. Si el `name` o la `description` contiene `document`, `docs`, `documenter`, `documentador` o `documentación` (case-insensitive) → es un sub-agente de documentación del proyecto.
4. Preferir delegarle esa parte vía la tool `Agent`, en lugar de documentar directamente.

### Paso 5 — Presentar propuesta al usuario

Antes de escribir, mostrar al usuario:

```
Propuesta de documentación (N archivos):

| # | Acción     | Archivo                | Descripción                              |
|---|------------|------------------------|------------------------------------------|
| 1 | Crear      | week-05/06-...md       | Apunte sesión 6 de la semana 5           |
| 2 | Actualizar | README.md              | Sincronizar árbol tras cambios recientes |
| 3 | Delegado   | projects/<X>/          | Sub-agente encontrado: <nombre>          |

Preview del contenido:

### 1. week-05/06-...md (nuevo)
───
[contenido propuesto, completo o esquemático según el largo]
───

### 2. README.md (actualización)
───
[diff o contenido actualizado]
───

¿Aprobar esta propuesta? (aprobar / ajustar / cancelar)
```

Esperar respuesta del usuario:

- **Aprobar** → ejecutar.
- **Ajustar** → aplicar cambios solicitados y volver a presentar la propuesta.
- **Cancelar** → no escribir nada.

### Paso 6 — Ejecutar

Tras aprobación explícita del usuario, ramificar según el tipo de documento:

#### 6a — Apuntes de lección (`week-XX/`) → SIEMPRE vía sub-agente

La redacción de un apunte no se hace en línea. Lanzar un sub-agente con la tool
`Agent` (`subagent_type: general-purpose`) para que escriba el archivo, y pasarle
un prompt **autocontenido** que incluya:

- **Objetivo**: crear `week-XX/<NN>-<slug-en-inglés>.md` (slug kebab-case en
  inglés, coherente con los apuntes vecinos del mismo `week-XX/`).
- **Temario/insumo** aportado por el usuario, íntegro.
- **Template a seguir**: `docs/lesson-note-template.md` (frontmatter + secciones).
  El frontmatter es `title, week, lesson, tags, date, status` — **NO incluir un
  campo `module`** (se eliminó de la convención).
- **Referencias de estilo**: 1-2 apuntes existentes del mismo `week-XX/` para
  calcar tono, profundidad, uso de tablas/diagramas mermaid y los cross-links
  ("Conexión interna: [...]") a sesiones previas.
- **Restricciones explícitas** que haya dado el usuario (p. ej. qué incluir o no
  en "Notas personales").
- Instrucción de **devolver la ruta del archivo escrito** y un resumen corto; el
  sub-agente escribe el `.md` pero NO hace commits ni toca código.

El preview y la aprobación (Paso 5) los hace SIEMPRE el runner del skill antes de
delegar — el sub-agente solo redacta lo ya aprobado.

#### 6b — READMEs, índices, resúmenes → escritura directa

Escribir los archivos con `Write` / `Edit` en línea (no requieren sub-agente).

#### 6c — Directorios de `projects/<X>/` con sub-agente propio

Si el Paso 4 encontró un sub-agente de documentación del proyecto, delegarle esa
parte con la tool `Agent`, pasándole un objetivo concreto y autocontenido.

#### Reporte final

Reportar: archivos escritos, archivos delegados (ruta + sub-agente), y cualquier
fallo.

Si la escritura falla → informar qué quedó escrito y qué no, sin reintentar
destructivamente.
Si un sub-agente delegado falla → ofrecer al usuario redactar directamente ese
apunte/directorio como fallback.

---

## Convenciones de output

- **Idioma**: español.
- **Naming**: `README.md` para índices de directorio; kebab-case descriptivo para documentos específicos (ej: `guia-de-uso.md`, `06-autonomous-agents-scheduled-tasks.md`).
- **Templates**: usar los de `docs/` cuando apliquen, no inventar formato propio.
- **Tono y profundidad**: alinear con archivos existentes del mismo tipo (mirar apuntes previos antes de escribir uno nuevo).

---

## Contenido mínimo del README raíz

Cuando se actualice el `README.md` raíz, debe contener al menos:

- Descripción del repositorio.
- Árbol de carpetas actualizado con descripciones por sección.
- Links a los proyectos y sus READMEs.
- Instrucciones básicas de navegación.

---

## Fuera del alcance

- Modificar código fuente o archivos que no sean `.md`.
- Crear estructura de directorios nueva.
- Documentar APIs internas o arquitectura detallada de proyectos (responsabilidad del sub-agente del proyecto).
- Crear branches, abrir PRs, hacer push al remoto.
- Ejecutar tests o linters.
- Gestionar commits (responsabilidad de `commit-organizer`).
