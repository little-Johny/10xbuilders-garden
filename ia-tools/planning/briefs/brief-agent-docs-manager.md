# Technical Brief — Desarrollo de agente para documentación del repositorio llamado `candace`

---

## 0. Snapshot

| Campo | Valor |
|---|---|
| Fecha | `11-04-2026` |
| Tipo | `Agente` |
| Modelo | `claude-sonnet-4-6` |
| Invocación | `Ambas` |
| Ubicación canónica | `ia-tools/agents/candace.md` |
| Plataformas | Claude Code (`.claude/agents/`) · Cursor (`.cursor/agents/`) via symlinks |
| Estado | `En progreso` |

---

## 1. Contexto

### ¿Qué existe hoy?

Un repositorio (`10xbuilders-garden`) que almacena todo el material de un curso de desarrollo con IA: lecciones semanales, proyectos prácticos, herramientas de IA (skills, agentes, briefs) y documentación general. Actualmente hay **3 semanas de lecciones**, **2 proyectos** y un ecosistema creciente de herramientas en `ia-tools/`.

En cuanto a documentación:
- Existe un `README.md` raíz pero se desactualiza cada vez que se añaden semanas, proyectos o herramientas nuevas.
- Los proyectos en `projects/` tienen sus propios READMEs pero con niveles de detalle inconsistentes.
- Los directorios `week-XX/` no tienen README ni índice — solo archivos `.md` sueltos sin contexto de navegación.
- `ia-tools/` no tiene documentación que explique qué skills y agentes existen ni cómo usarlos.
- No hay un proceso que detecte cuándo la documentación queda desalineada con los cambios reales del repo.

```
10xbuilders-garden/
├── .claude/                        # Configuración de agentes y skills para Claude Code
│   ├── agents/                     # Symlinks a ia-tools/agents/
│   └── skills/                     # Symlinks a ia-tools/skills/
├── .cursor/                        # Configuración de agentes y skills para Cursor
│   ├── agents/                     # Symlinks a ia-tools/agents/
│   └── skills/                     # Symlinks a ia-tools/skills/
├── docs/                           # Plantillas y prompts generales del curso
├── ia-tools/                       # Herramientas IA: planificación, skills y agentes
│   ├── agents/                     # Agentes compartidos (fuente canónica)
│   ├── planning/
│   │   ├── briefs/                 # Briefs técnicos de tareas específicas
│   │   ├── master-protocol-preview.md
│   │   └── master-technical-brief.md
│   └── skills/                     # Skills compartidos (fuente canónica)
│       └── commit-organizer/
├── projects/                       # Proyectos prácticos del curso
│   ├── 10X-Builders-langchain-agent/   # Agente LangChain con TypeScript
│   │   ├── docs/                   # Arquitectura, briefs y planes del agente
│   │   ├── src/agent/              # Lógica del agente, modelo y tools
│   │   └── tests/                  # Tests unitarios
│   └── twitter-clon/               # Clon de Twitter (monorepo)
│       ├── api/                    # Backend (Express / Node)
│       ├── app/                    # Frontend (Vite + React + Tailwind)
│       ├── supabase/               # Migraciones y config de Supabase
│       └── docs/                   # Timeline y mapa de aprendizaje
├── week-01/                        # Lecciones semana 1: copilot, briefs, planificación
├── week-02/                        # Lecciones semana 2: testing, debugging, workflows
├── week-03/                        # Lecciones semana 3: agentes y LangChain
├── .gitignore
└── README.md
```

### Problema

El repositorio crece con cada semana del curso (nuevas lecciones, proyectos, tools, skills) pero la documentación no se actualiza al mismo ritmo. Consecuencias concretas:
- El `README.md` raíz no refleja la estructura real — un visitante nuevo no sabe qué contiene cada directorio ni por dónde empezar.
- Al añadir archivos en `week-XX/` o `ia-tools/`, no se genera ningún índice o resumen que ayude a navegar el contenido.
- Los cambios estructurales (nuevos directorios, herramientas, proyectos) pasan desapercibidos para la documentación porque depende de que el usuario recuerde actualizar manualmente.
- Esto genera deuda de documentación acumulativa: cuanto más crece el repo, más difícil es ponerse al día.

### Objetivo

Crear un agente (`candace`) que mantenga la documentación del repositorio sincronizada con su contenido real y genere cualquier documento `.md` que el usuario solicite. Concretamente:
- **Detectar** qué directorios o archivos tienen documentación faltante, desactualizada o inconsistente con los cambios recientes (`git log`).
- **Generar** archivos `.md` de cualquier tipo: READMEs por directorio, índices de contenido, resúmenes de semana, apuntes de clases, guías, o cualquier otro documento que el usuario solicite — siempre siguiendo los templates de `docs/` cuando apliquen.
- **Sincronizar** el `README.md` raíz con la estructura actual del repo (árbol de carpetas, descripción de cada sección, links a proyectos).
- **Proponer** todos los cambios al usuario antes de escribir — nunca actuar sin aprobación.
- **Delegar** a sub-agentes de proyecto cuando el directorio tiene su propio agente de documentación con contexto más preciso.

### Usuarios / Consumidores

- **Propietario del repositorio:** usuario principal que invoca a candace manualmente o recibe propuestas automáticas tras commits.
- **Visitantes del repositorio:** al ser público, cualquier persona que clone o navegue el repo se beneficia de documentación actualizada y consistente.

### Distribución entre plataformas

El agente vive en una ubicación canónica neutral dentro del repo y se expone a cada plataforma mediante symlinks. Ambas plataformas usan el mismo formato de archivo (`.md` con frontmatter `name`, `model` y `description`).

```
ia-tools/agents/candace.md        ← fuente de verdad

.claude/agents/candace.md         → symlink (Claude Code lo descubre aquí)
.cursor/agents/candace.md         → symlink (Cursor lo descubre aquí)
```

### Interconexión con otros agentes y skills

**candace → commit-organizer (dirección: candace invoca al skill):**
Al terminar de generar documentos y ser aprobados por el usuario, candace invoca al skill `commit-organizer` para proponer commits de la documentación generada. Esto solo ocurre cuando candace fue invocada **manualmente** — nunca cuando fue invocada automáticamente desde commit-organizer (para evitar loop circular).

**commit-organizer → candace (dirección: el skill invoca a candace):**
Tras completar los commits, `commit-organizer` evalúa si los cambios ameritan actualización de documentación y propone al usuario invocar a candace (ver paso 7 del SKILL.md de commit-organizer). En este modo, candace **no re-invoca** a commit-organizer al terminar.

**Mecanismo de invocación automática — contrato:**
Cuando `commit-organizer` invoca a candace, le pasa como contexto en el prompt de invocación:
- La indicación explícita: `"Invocación automática desde commit-organizer"` — candace usa esta frase para saber que está en modo automático y NO debe re-invocar a commit-organizer al terminar.
- El reporte final de commits realizados (tabla con hashes, mensajes y archivos afectados) — candace usa esta información para evaluar si amerita documentación sin necesidad de consultar `git log` de nuevo.

**candace → sub-agentes de proyecto (delegación con aprobación):**
Cuando candace necesita documentar cualquier directorio del repo, primero verifica si ese directorio tiene su propio agente de documentación. El mecanismo de descubrimiento es:
- Candace busca archivos de agente en `<directorio>/.cursor/agents/` y `<directorio>/.claude/agents/` cuyo nombre o descripción contenga (substring, case-insensitive) alguna de las palabras: `document`, `docs`, `documenter`, `documentador`, `documentación`.
- Si encuentra uno, **informa al usuario** qué agente encontró y le pregunta: ¿delegar a ese sub-agente o que candace documente directamente?
- Si el usuario elige delegar → candace cede el control al sub-agente para ese directorio.
- Si el usuario elige que candace lo haga → candace documenta directamente.
- Si no encuentra ningún sub-agente, candace documenta directamente sin preguntar.

---

## 2. Alcance

### Dentro del alcance

**Análisis y detección:**
- Analizar el estado de la documentación del repo (READMEs, docs por directorio, índices)
- Detectar directorios sin README o con documentación desactualizada comparando contra `git log` reciente
- Evaluar si cambios recientes ameritan actualización de documentación (cuando es invocada automáticamente)

**Generación de documentos:**
- Generar y actualizar archivos `.md` de cualquier tipo: READMEs por directorio, índices de contenido, resúmenes de semana, apuntes de clases, guías, o cualquier otro documento `.md` que el usuario solicite
- Mantener el `README.md` raíz sincronizado con la estructura actual del repo (árbol de carpetas, descripción de secciones, links)
- Seguir los templates existentes en `docs/` cuando apliquen al tipo de documento (ej: `lesson-note-template.md` para apuntes de clases, `LESSON-PROMPT.md` para prompts de lecciones)

**Delegación y orquestación:**
- Delegar al sub-agente específico del proyecto cuando el directorio tiene uno propio (descubierto via `.cursor/agents/` y `.claude/agents/`)
- Invocar `commit-organizer` tras aprobación del usuario para commitear la documentación generada (solo en invocación manual)

**Modos de operación:**
- **Manual:** el usuario invoca a candace directamente para analizar y documentar
- **Automática:** `commit-organizer` invoca a candace tras commits para evaluar si se requiere documentación

### Fuera del alcance

- Modificar código fuente o cualquier archivo que no sea `.md`
- Documentar en detalle APIs o arquitectura interna de proyectos (responsabilidad del sub-agente de cada proyecto)
- Crear branches, abrir PRs o hacer push al remoto
- Ejecutar tests o linters
- Crear estructura de directorios nueva
- Re-invocar a `commit-organizer` cuando candace fue invocada automáticamente desde él (prevención de loop circular)

---

## 3. Flujo

### Invocación manual

```
[Usuario invoca a candace directamente]
        ↓
[1. Análisis: estructura del repo, git log reciente, READMEs existentes]
        ↓
[2. Identifica qué necesita documentación o actualización]
        ↓
[3. Por cada directorio que necesita docs:]
   [¿Tiene sub-agente propio en .cursor/agents/ o .claude/agents/?]
      ↓ Sí                              ↓ No
   [Informa al usuario:              [Genera/actualiza docs
    "Encontré el agente X para        directamente]
     este directorio. ¿Delegar
     a él o que yo lo haga?"]
      ↓ Delegar           ↓ Candace
   [Marca directorio   [Genera docs
    como "Delegado"]    directamente]
        ↓
[4. Propone documentos al usuario con preview del contenido]
    (incluye filas "Delegado" para visibilidad)
        ↓                             ↑
   ┌────┴──────────┐                  │
[Aprueba]  [Ajustar] ────────────────┘    [Cancelar] → Aborta sin escribir nada
   ↓
[5a. Escribe los archivos .md directos aprobados]
[5b. Invoca al sub-agente para cada directorio marcado como "Delegado"]
        ↓
[6. Invoca commit-organizer para commitear la documentación]
```

### Invocación automática (desde commit-organizer)

```
[commit-organizer invoca a candace con:
 - Frase "Invocación automática desde commit-organizer"
 - Reporte de commits realizados (hashes, mensajes, archivos)]
        ↓
[1. Detecta modo automático por la frase de invocación → NO re-invocará commit-organizer]
        ↓
[2. Evalúa si los cambios ameritan documentación según criterios:]
   - ¿Se crearon/eliminaron directorios o archivos significativos?
   - ¿Se modificó la estructura del repo (nuevos projects, weeks, tools)?
   - ¿Se modificaron archivos fuera de `docs/` o `week-XX/` (proyectos, ia-tools, configuración)?
   - ¿El README raíz quedó desactualizado respecto a la estructura real?
   - ¿Se añadieron features/tools/skills sin documentación asociada?
        ↓
   ↓ No amerita                       ↓ Sí amerita
[Informa al usuario que         [Continúa con el flujo manual desde
 no se requiere documentación    el paso 2, PERO al terminar de
 y termina]                      escribir NO invoca commit-organizer
                                 (los .md quedan pendientes de commit
                                  para que el usuario decida)]
```

### Manejo de errores

- Si candace no puede leer un directorio o archivo, lo reporta y continúa con el resto.
- Si el sub-agente delegado falla o no está disponible, candace informa al usuario y ofrece documentar directamente ese directorio como fallback.
- Si la escritura de un archivo falla, informa cuáles se escribieron y cuáles quedan pendientes. No continúa con commit-organizer si hay archivos sin escribir.

### Output esperado

Candace presenta la propuesta al usuario con este formato antes de escribir:

```
Propuesta de documentación (N archivos):

| # | Acción      | Archivo                  | Descripción                                          |
|---|-------------|--------------------------|------------------------------------------------------|
| 1 | Crear       | week-03/README.md        | Índice de lecciones de la semana 3 con descripciones |
| 2 | Actualizar  | README.md                | Sincronizar árbol de carpetas y descripción general  |
| 3 | Delegado    | projects/twitter-clon/           | Delegado al sub-agente project-documenter            |

Preview de contenido:

### 1. week-03/README.md (nuevo)
───────────────────────────
# Semana 3 — Agentes y LangChain
...contenido propuesto...
───────────────────────────

### 2. README.md (actualización)
───────────────────────────
[diff o contenido actualizado]
───────────────────────────

¿Aprobar esta propuesta? (aprobar / ajustar / cancelar)
```

---

## 4. Constraints

### Reglas específicas de esta tarea

**Archivos y escritura:**
- Solo produce y modifica archivos `.md` — nunca código fuente ni archivos de configuración
- Siempre proponer antes de escribir, nunca escribir sin aprobación explícita del usuario
- No crear directorios nuevos — solo archivos dentro de la estructura existente
- Respetar `.gitignore` — no generar documentación en directorios ignorados (ej: `node_modules/`, `dist/`)

**Delegación:**
- Si el directorio tiene sub-agente propio (descubierto en `.cursor/agents/` y `.claude/agents/` con nombre/descripción que contenga — búsqueda substring, case-insensitive — alguna de: `document`, `docs`, `documenter`, `documentador`, `documentación`), informar al usuario y preguntarle si delegar al sub-agente o que candace documente directamente
- Si el usuario elige delegar y el sub-agente falla, ofrecer documentar directamente como fallback

**Contenido y formato:**
- Toda documentación generada en español
- Candace lee `docs/` en cada invocación para descubrir dinámicamente los templates disponibles y los usa cuando apliquen al tipo de documento (ej: `lesson-note-template.md` para apuntes de clases, `LESSON-PROMPT.md` para prompts de lecciones). Para tipos de documento sin template existente, candace usa su criterio siguiendo las convenciones del repo
- Convención de naming para archivos generados: `README.md` para índices de directorio, nombres descriptivos en kebab-case para documentos específicos (ej: `guia-de-uso.md`)
- El `README.md` raíz debe contener como mínimo: descripción del repo, árbol de carpetas actualizado con descripciones, links a los proyectos y sus READMEs, instrucciones básicas de navegación

**Prevención de loop circular:**
- Candace detecta su modo de invocación por la presencia de la frase `"Invocación automática desde commit-organizer"` en el prompt recibido
- Cuando detecta modo automático, **NO** re-invoca a `commit-organizer` al terminar — los archivos `.md` generados quedan pendientes de commit para que el usuario decida
- Cuando no detecta esa frase (invocación manual directa del usuario), sí invoca `commit-organizer` al terminar

**Evaluación automática:**
- Cuando es invocada por `commit-organizer`, evaluar primero si amerita documentación antes de actuar — no asumir que siempre hay algo que documentar
- Criterios para ameritar documentación: cambios estructurales (nuevos directorios, archivos eliminados), modificaciones fuera de `docs/` o `week-XX/`, nuevas features/tools/skills, README raíz desactualizado respecto a la estructura real
- Si no amerita, informar al usuario y terminar sin acción

**Prioridad de documentos:**
- El `README.md` raíz es el documento de mayor prioridad — siempre verificar si necesita actualización
- Orden de prioridad: README raíz > READMEs de directorios sin documentación > actualización de READMEs existentes > índices y resúmenes

---

## 5. Riesgos & Supuestos

| # | Riesgo / Supuesto | Probabilidad | Mitigación |
|---|---|---|---|
| 1 | Loop circular: candace invoca commit-organizer que re-invoca a candace | Alta | Constraint explícita: candace no re-invoca commit-organizer cuando fue invocada automáticamente. Documentado en ambos briefs y en el SKILL.md |
| 2 | Sub-agente de proyecto no existe o no está disponible | Media | Fallback: candace documenta directamente el directorio e informa al usuario |
| 3 | El mecanismo de descubrimiento de sub-agentes no encuentra agentes con naming no convencional | Media | Buscar por nombre Y descripción. Si no encuentra, documentar directamente. Refinar criterios con el uso |
| 4 | Templates en `docs/` cambian o se agregan nuevos sin que candace lo sepa | Baja | Candace lee `docs/` en cada invocación para descubrir templates disponibles dinámicamente |
| 5 | Documentación generada es superficial o placeholder sin valor real | Media | Constraint de calidad: no generar documentos vacíos o con solo títulos. Todo archivo generado debe tener contenido útil y navegable |
| 6 | Candace genera documentación redundante con lo que ya produjo un sub-agente delegado | Baja | Tras delegar, candace no genera documentación adicional para ese directorio. Si el sub-agente ya actualizó archivos, candace los respeta sin sobreescribir |

---

## 6. Definition of Done

### Criterios específicos de esta tarea

**Invocación y operación:**
- [ ] Invocable con una instrucción simple desde Claude Code y Cursor
- [ ] Invocable automáticamente desde el skill `commit-organizer` (paso 7 del SKILL.md)
- [ ] Si no hay documentación que actualizar, lo comunica claramente y termina sin acción

**Detección y análisis:**
- [ ] Detecta correctamente qué directorios necesitan documentación o actualización
- [ ] Usa `git log` para identificar cambios recientes que afectan la documentación
- [ ] El `README.md` raíz refleja la estructura real del repo tras cada ejecución

**Delegación:**
- [ ] Descubre sub-agentes de proyecto buscando en `.cursor/agents/` y `.claude/agents/` del directorio (substring, case-insensitive)
- [ ] Informa al usuario cuando encuentra un sub-agente y le pregunta si delegar o que candace documente
- [ ] Delega correctamente si el usuario lo aprueba
- [ ] Documenta directamente como fallback si el sub-agente falla o si el usuario elige no delegar

**Propuesta y aprobación:**
- [ ] Propone los documentos al usuario con preview del contenido antes de escribir
- [ ] El usuario puede aprobar, rechazar o ajustar la propuesta
- [ ] Si cancela, no escribe ningún archivo

**Orquestación:**
- [ ] Invoca `commit-organizer` tras escribir los archivos aprobados (solo en invocación manual)
- [ ] NO re-invoca `commit-organizer` cuando fue invocada automáticamente (sin loop circular)

**Calidad:**
- [ ] Produce solo archivos `.md`
- [ ] Descubre y respeta dinámicamente los templates existentes en `docs/` cuando apliquen al tipo de documento
- [ ] Genera cualquier tipo de documento `.md` que el usuario solicite (apuntes, guías, índices, etc.)
- [ ] No genera documentos vacíos o placeholder — todo archivo tiene contenido útil
- [ ] Sigue convención de naming: `README.md` para índices, kebab-case para el resto

---

## 7. Referencias & Notas

- Brief de `commit-organizer`: `ia-tools/planning/briefs/brief-skill-documenting-repository.md` — contexto original del skill y referencia a la integración con candace
- SKILL.md de `commit-organizer`: `ia-tools/skills/commit-organizer/SKILL.md` — define la integración bidireccional y el paso 7 con los criterios de invocación automática a candace
- Templates disponibles en `docs/`: `LESSON-PROMPT.md`, `lesson-note-template.md`
- Sub-agente de ejemplo: `projects/twitter-clon/.cursor/agents/project-documenter.md`
