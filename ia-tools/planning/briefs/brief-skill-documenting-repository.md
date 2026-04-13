# Technical Brief — Desarrollo e implementacion de skill para gestion de commits llamado ´commit-organizer´

---

## 0. Snapshot

| Campo | Valor |
|---|---|
| Fecha | `09-04-2026` |
| Tipo | `Skill` |
| Ubicación canónica | `ia-tools/skills/commit-organizer/SKILL.md` |
| Plataformas | Claude Code (`.claude/skills/`) · Cursor (`.cursor/skills/`) via symlinks |
| Estado | `Ready` |

---

## 1. Contexto


### ¿Qué existe hoy?

Actualmente tenemos este repositorio en el cual se esta almacenando la informacion de un curso.

```
10xbuilders-garden/
├── docs/                # Documentación + Templates
├── ia-tools/            # Herramientas de IA para el flujo de trabajo
│   ├── agents/          # Configuración de agentes de IA
│   ├── planning/        # Planificación y briefs técnicos
│   │   └── briefs/      # Briefs individuales de tareas
│   └── skills/          # Skills reutilizables para Cursor y/o Claude
├── projects/            # Proyectos prácticos del curso
│   ├── 10X-Builders-langchain-agent/  # Agente con LangChain (Node/TS)
│   └── twitter-clon/                  # Clon de Twitter (Next.js + Supabase)
├── week-01/             # Material y ejercicios semana 1
├── week-02/             # Material y ejercicios semana 2
└── week-03/             # Material y ejercicios semana 3
```

### Problema

Quiero que cada vez que haga muchos cambios haciendo una simple peticion a cursor o claude pueda segmentar y ver una sugerencia de organizacion para los commits en base a diferentes criterios de agrupacion y clasificacion, convenciones de commits, etc.

### Objetivo

Con una simple instruccion al chat de cursor o claude, se clasififcaran los cambios en staging y se dara una propuesta de los commits siguiendo la misma nomenclatura que ya se esta usando en el repositorio (conventional-commits). Y si se aprueba la propuesta se realizaran los commits indicados, de lo contrario se realizaran ajustes si el usuario lo indica.

### Usuarios / Consumidores

El usuario principal sera el dueño del repositorio(yo) pero al ser un repositorio que sera publico cualquiera lo podra usar y beneficiarse de este skill

### Distribución entre plataformas

El skill vive en una ubicación canónica neutral dentro del repo y se expone a cada plataforma mediante symlinks. Ambas plataformas usan el mismo formato de archivo (`SKILL.md` con frontmatter `name` + `description`), por lo que un solo archivo sirve a las dos sin modificación.

```
ia-tools/skills/commit-organizer/
└── SKILL.md                        ← fuente de verdad

.claude/skills/commit-organizer/    → symlink (Claude Code lo descubre aquí)
.cursor/skills/commit-organizer/    → symlink (Cursor lo descubre aquí)
```

**Referencia:** la documentación oficial de Claude Code confirma que los skills de proyecto se leen desde `.claude/skills/` y usan el mismo formato `SKILL.md` que Cursor.

---

## 2. Alcance 

### Dentro del alcance

- Leer `git status` y `git diff` para detectar todos los cambios (staged y unstaged)
- Agrupar los cambios por directorio, tipo de modificación y temática, según la estructura del repo (`week-XX/`, `docs/`, `projects/`, `ia-tools/`)
- Proponer mensajes de commit siguiendo Conventional Commits con descripciones en español, respetando la nomenclatura existente en el historial del repo
- Determinar el orden lógico de los commits (ej: `docs` antes que `feat`, apuntes antes que proyectos)
- Presentar la propuesta al usuario y esperar aprobación antes de ejecutar
- Aplicar ajustes si el usuario los solicita antes de confirmar
- Hacer staging de los archivos correspondientes a cada commit agrupado y ejecutar los commits en el orden propuesto
- Consultar commits previos para tener congruencia en formato, relacion de commits previos y tematicas

### Fuera del alcance

- Crear branches, abrir PRs o hacer push al remoto
- Resolver conflictos de merge
- Generar o actualizar documentación (responsabilidad del agente `candace`)
- Ejecutar linters o tests antes de commitear
- Configurar hooks de pre-commit o GitHub Actions (Fase 2-3)
- Modificar configuración de Git (`.gitconfig`, `.gitignore`)


---

## 3. Flujo

```
[Usuario invoca el skill]
        ↓
[git status + git diff + git diff --cached (solo lectura)]
        ↓
[Consulta git log para coherencia con commits previos]
        ↓
[Agrupa cambios por directorio / tipo / temática]
        ↓
[Propone commits ordenados → espera aprobación]
        ↓                          ↑
   ┌────┴──────────┐               │
[Aprueba]  [Ajustar] ─────────────┘    [Cancelar] → Aborta sin modificar nada
   ↓
[Si hay staging previo → git reset (sin --hard), informar al usuario]
        ↓
[Ejecuta git add + git commit por cada grupo]
        ↓
[Reporta resultado final]
```

> Tras los commits, este skill evalúa si los cambios ameritan actualización de documentación y, de ser así, propone al usuario invocar al agente `candace`. Ver paso 7 del SKILL.md para los criterios y el flujo completo.

### Output esperado

El skill presenta la propuesta en este formato antes de ejecutar:

```
📋 Propuesta de commits (3):

| # | Commit                                                      | Archivos                                          |
|---|-------------------------------------------------------------|---------------------------------------------------|
| 1 | docs(week-03): añadir lección sobre ecosistema LangChain    | week-03/lesson-10.md, week-03/lesson-11.md        |
| 2 | feat(langchain-agent): implementar herramienta de vuelos    | src/agent/tools/flights.ts, tests/flights.test.ts  |
| 3 | chore(ia-tools): añadir brief de skill commit-organizer     | ia-tools/planning/briefs/brief-skill-*.md          |

¿Aprobar esta propuesta? (aprobar / ajustar / cancelar)
```

---

## 4. Constraints

### Reglas específicas de esta tarea

- Los mensajes de commit van siempre en español
- Seguir Conventional Commits estrictamente: `type(scope): descripción`
- Tipos permitidos: `feat`, `fix`, `docs`, `test`, `chore`, `refactor`, `style`, `ci` — no inventar tipos fuera de esta lista
- El scope se deriva del directorio de primer nivel afectado: `(week-01)`, `(docs)`, `(ia-tools)`
- Dentro de `projects/`, el scope baja un nivel al nombre del proyecto: `(twitter-clon)`, `(langchain-agent)`
- Si un cambio afecta múltiples subdirectorios del mismo scope, se permite agruparlos (ej: `feat(twitter-clon/app, api)`)
- Nunca mezclar archivos de scopes de primer nivel distintos en un mismo commit (ej: no mezclar `week-01/` con `projects/`)
- Orden lógico de commits: `docs`/apuntes (`week-XX/`, `docs/`) → `feat`/`fix` (proyectos) → `chore`/`ci`/`style` (configuración y tooling)
- Los archivos borrados (`D` en git status) se incluyen en el commit del scope al que pertenecían, usando el mismo type que corresponda al cambio
- Los archivos untracked (nuevos sin stage) se incluyen en la propuesta y se stagean automáticamente como parte del grupo correspondiente
- Nunca ejecutar commits sin aprobación explícita del usuario
- Si no hay cambios detectados (staged ni unstaged), comunicarlo claramente y no continuar
- Consultar `git log` antes de proponer para mantener coherencia con el historial existente
- La fase de análisis es de solo lectura (`git status`, `git diff`, `git diff --cached`, `git log`). No modificar staging ni working tree hasta tener aprobación
- Al ejecutar, si hay archivos pre-staged, hacer un `git reset` (sin `--hard`) antes de iniciar para reorganizar el staging por grupo. Informar al usuario antes de hacerlo
- Si un `git commit` falla durante la ejecución, detenerse inmediatamente, informar qué commits se completaron y cuáles quedan pendientes, y no intentar continuar automáticamente

---

## 5. Definition of Done

### Criterios específicos de esta tarea

- [ ] Invocable con una instrucción simple desde Claude Code y Cursor sin configuración adicional
- [ ] Detecta correctamente cambios staged y unstaged via `git status` y `git diff`
- [ ] Agrupa los cambios sin mezclar scopes de primer nivel distintos en un mismo commit
- [ ] Los mensajes propuestos siguen el formato `type(scope): descripción en español`
- [ ] El usuario puede aprobar, rechazar o pedir ajustes antes de que se ejecute cualquier commit
- [ ] Los commits se ejecutan en el orden propuesto, con staging correcto por grupo
- [ ] Si no hay cambios, el skill lo comunica sin errores ni comportamiento inesperado

