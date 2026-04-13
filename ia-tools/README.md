# ia-tools — Herramientas IA del Repositorio

Directorio transversal que contiene los agentes, skills y artefactos de planificación utilizados en todo el repositorio. Los directorios `.claude/` y `.cursor/` en la raíz son mirrors de estos archivos para que cada IDE los descubra automáticamente.

## Estructura

```
ia-tools/
├── agents/                  # Definiciones de agentes
│   └── candace.md           # Agente de documentación interna
├── planning/                # Artefactos de planificación
│   ├── master-protocol-preview.md
│   ├── master-technical-brief.md
│   └── briefs/              # Briefs técnicos específicos
│       ├── brief-agent-docs-manager.md
│       └── brief-skill-documenting-repository.md
└── skills/                  # Skills reutilizables
    └── commit-organizer/
        └── SKILL.md         # Organiza y agrupa commits con Conventional Commits
```

## Agentes

| Agente | Archivo | Descripción |
|--------|---------|-------------|
| candace | [agents/candace.md](agents/candace.md) | Documentación interna del repo: detecta docs faltantes, genera/actualiza READMEs e índices |

## Skills

| Skill | Archivo | Descripción |
|-------|---------|-------------|
| commit-organizer | [skills/commit-organizer/SKILL.md](skills/commit-organizer/SKILL.md) | Analiza cambios staged/unstaged, agrupa por temática y propone commits organizados |

## Planning

Briefs técnicos y protocolos que guían el desarrollo de nuevas herramientas:

- [master-protocol-preview.md](planning/master-protocol-preview.md)
- [master-technical-brief.md](planning/master-technical-brief.md)
- [brief-agent-docs-manager.md](planning/briefs/brief-agent-docs-manager.md)
- [brief-skill-documenting-repository.md](planning/briefs/brief-skill-documenting-repository.md)
