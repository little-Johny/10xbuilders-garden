# 10X Builders: Track Code

Repositorio personal de apuntes, conceptos, entregables y herramientas del curso **10X Builders: Track Code** en [LAB10](https://app.lab10.ai).

---

## Estructura

```
/
├── docs/              # Meta: cómo generar apuntes (prompt, plantilla)
├── week-01/           # Semana 1 — Fundamentos del loop de ingeniería híbrida
├── week-02/           # Semana 2 — Reglas, skills, MCPs y subagentes
├── week-03/           # Semana 3 — Agentes autónomos y LangChain
├── ia-tools/          # Agentes, skills y artefactos de planificación transversales
├── projects/          # Código de práctica y laboratorios
├── .claude/           # Agentes y skills para Claude Code (mirrors de ia-tools/)
├── .cursor/           # Agentes y skills para Cursor (mirrors de ia-tools/)
├── README.md
└── .gitignore
```

### Convención de apuntes

En `week-XX/`, los archivos siguen `NN-nombre-descriptivo.md` (número de lección + slug en inglés). El detalle está en [`docs/LESSON-PROMPT.md`](docs/LESSON-PROMPT.md).

---

## Progreso

| Semana | Carpeta    | Estado (notas) |
|--------|------------|----------------|
| 1      | `week-01/` | Lecciones 1–6 + reflexión |
| 2      | `week-02/` | Lecciones 1–10 completas |
| 3      | `week-03/` | Lecciones 1–4 (en progreso) |

---

## Proyectos

| Proyecto                          | Ruta                                                                        | Descripción |
|-----------------------------------|-----------------------------------------------------------------------------|-------------|
| Twitter Clon (práctica Lab10)     | [`projects/twitter-clon/`](projects/twitter-clon/)                          | Clon de X con React, Express y Supabase |
| LangChain Agent                   | [`projects/10X-Builders-langchain-agent/`](projects/10X-Builders-langchain-agent/) | Agente conversacional con LangChain y herramientas |

---

## Herramientas IA

El directorio [`ia-tools/`](ia-tools/) contiene agentes, skills y briefs técnicos que se usan transversalmente en el repo. Los directorios `.claude/` y `.cursor/` en la raíz son mirrors para que cada IDE los descubra automáticamente.

| Herramienta | Descripción |
|-------------|-------------|
| [`candace`](ia-tools/agents/candace.md) | Agente de documentación interna del repositorio |
| [`commit-organizer`](ia-tools/skills/commit-organizer/SKILL.md) | Skill para organizar y agrupar commits con Conventional Commits |
