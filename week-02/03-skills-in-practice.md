---
title: "Skills en Practica: TDD y Setup del Clon de Twitter"
week: 2
lesson: 3
tags: [skills, tdd, cursor, rules, progressive-disclosure]
date: 2026-03-18
status: done
---

# Skills en Practica: TDD y Setup del Clon de Twitter

> **Síntesis.** Dominar la creación, implementación e iteración de **skills** en un entorno real permite pasar de la teoría a la práctica mediante **TDD** (desarrollo guiado por tests) y reglas de proyecto. El **skill** actúa como contrato verificable entre humano y agente; las **reglas** fijan el «cerebro» compartido del repositorio para un clon de red social u otro proyecto largo.

## Introducción

Trabajar con agentes en un codebase serio exige **verificabilidad**: el modelo debe poder comprobar si cumplió el encargo sin depender de supervisión continua línea a línea. El **TDD** (ciclo rojo → verde → refactor) y los tests como especificación se convierten en el lenguaje común. En paralelo, las **reglas** en `.cursor/rules/` estabilizan stack, carpetas y comandos de verificación. Los **skills** encapsulan procedimientos con **progressive disclosure** para no inundar el contexto. La sesión práctica recorre setup inicial, creación de skill con `/create skill` en Cursor e iteración cuando aparecen nuevos requisitos.

## Objetivos de aprendizaje

1. Explicar por qué el TDD es especialmente valioso cuando el implementador es un **agente**.
2. Crear **reglas de proyecto** en `.cursor/rules/` que guíen comportamiento, stack y verificación.
3. Definir un skill usando el flujo de creación en Cursor y aplicar el ciclo **Red → Green → Refactor**.
4. Explicar **progressive disclosure** frente a cargar todo el manual en cada mensaje.
5. **Iterar** skills al añadir rutas de tests, scripts (`npm test`, `npm run lint`) o dependencias nuevas.
6. Usar **tests como guía de debugging**: reproducir el bug en un test antes de «arreglar a ciegas».
7. Configurar la **estructura inicial** del proyecto: carpetas, convenios y stack acordado.

## Marco conceptual

### TDD con agentes como contrato

El TDD es central con IA porque los **tests** fijan comportamiento esperado —entradas, salidas y errores— de forma que el agente puede **autoverificar**. Cuando algo falla, el test aislado acota la causa. El ciclo clásico es: **Red**, escribir un test que falla porque la funcionalidad aún no existe; **Green**, implementar lo mínimo para pasar; **Refactor**, mejorar el código manteniendo los tests verdes. En conjunto, el test funciona como **contrato**: el humano define qué debe cumplirse; el agente propone implementaciones; la suite demuestra si se cumplen.

### Reglas de proyecto

Las **reglas** son instrucciones persistentes sobre cómo debe comportarse el agente en ese repositorio. Suelen incluir **stack** (por ejemplo React, Vite, Tailwind, Supabase), **estructura de carpetas** (`app/`, `api/`, `tests/`), **principios** (TDD, lint, convenciones de nombres) y **comandos de verificación** que el agente puede ejecutar para validar su trabajo. Colocarlas antes de implementar reduce discusiones implícitas sobre «cómo se hace acá».

### Progressive disclosure frente a full disclosure

En **progressive disclosure** (típico de skills bien diseñados), el agente ve primero **nombre y descripción breve** del skill, evalúa relevancia y solo entonces carga el cuerpo completo (checklist, pasos, detalles). Eso reduce ruido y tokens. En **full disclosure** (habitual en algunos catálogos **MCP**), el modelo ve todas las herramientas disponibles de una vez y elige cuál invocar; es adecuado para integraciones externas, pero no es el mismo patrón que un skill con índice liviano.

### Iteración de skills

Un skill **no** es estático. Un primer ciclo puede definir solo **estructura** y dejar tests en rojo que marcan el trabajo pendiente. Un segundo ciclo añade **contexto operativo**: rutas de tests, scripts de verificación, dependencias. Un tercero puede **integrar** referencias a otros skills o tipos compartidos. Esa evolución es normal cuando el proyecto crece.

### Arquitectura típica de un skill

En la práctica, un skill puede organizarse como carpetas con `SKILL.md`, tests de ejemplo, código de referencia y scripts de verificación. La forma exacta depende del repo; lo importante es que **SKILL.md** describa objetivo y pasos de forma que el agente los descubra con progressive disclosure.

## Síntesis

TDD con IA no es solo «escribir tests»: es un **contrato explícito** entre humano y máquina. El test define **qué** se espera; el agente **implementa** para cumplirlo; la suite permite que la **máquina** verifique su trabajo de forma repetible. Ese trío hace que el proyecto sea más mantenible, escalable y auditable que un flujo solo de prompts.

## Preguntas de repaso

1. ¿Por qué el TDD encaja especialmente bien cuando quien programa es un agente?
2. ¿Qué distingue una **rule** de un **skill** en Cursor en términos de cuándo se carga y qué contiene?
3. ¿Qué problema resuelve el **progressive disclosure** para el contexto del agente?
4. ¿Cómo iterarías un skill cuando descubrís nuevos requisitos o comandos de verificación?

## Notas Personales

### Scaffolding y vínculo con la clase

En pedagogía, **scaffolding** (*andamiaje*) es el apoyo temporal que se retira cuando quien aprende ya puede sostener solo la tarea. En esta clase el paralelo es directo: no se espera que el agente «adivine» el flujo del repo desde cero cada vez. Las **reglas** fijan el terreno (stack, carpetas, principios), los **skills** despliegan procedimientos solo cuando aplican (**progressive disclosure**), y el **TDD** actúa como riel: el test dice qué debe cumplirse antes de que exista el código. Eso es andamiaje para el agente: estructura compartida que reduce improvisación y hace verificable el trabajo. Cuando el sistema está bien calibrado, el mismo proyecto necesita menos micromanagement en el chat porque el andamiaje ya «sostiene» buena parte del criterio.

En la práctica del curso, **andamiaje** fue también el **setup inicial** de `projects/twitter-clon/`: combinando las **reglas** del repo con el skill **`tdd-working`**, se le pidió al **agente de Cursor** que generara esa base (estructura del monorepo, convenciones, comandos de verificación, enfoque TDD). Una vez existió ese cuerpo común del proyecto, lo pertinente fue **volcar ese contexto dentro del propio skill** —rutas reales, scripts, dónde viven los tests— para que cada vez que se active `tdd-working` el agente no dependa de un chat previo. Es el mismo principio de **iteración** del marco conceptual: los **skills**, al igual que **reglas**, **MCPs** y **agentes** (subagents u otros), conviene **ir actualizándolos** cuando el proyecto cambia; si el sistema alrededor del LLM queda desactualizado, el andamiaje deja de sostener y vuelve la improvisación.

### Ejemplos de skills en este repositorio

En el clon de Twitter del workspace, los skills viven bajo:

**`projects/twitter-clon/.cursor/skills/`**

Cada carpeta contiene un `SKILL.md` (frontmatter con `name` y `description` + cuerpo del procedimiento):

| Carpeta | Rol breve |
|---------|-----------|
| [`inspecting-db/`](../projects/twitter-clon/.cursor/skills/inspecting-db/SKILL.md) | Inspección de Supabase en solo lectura vía MCP local (esquema, SELECT, depuración). |
| [`modifying-db/`](../projects/twitter-clon/.cursor/skills/modifying-db/SKILL.md) | Migraciones y cambios de esquema con la CLI de Supabase en este proyecto. |
| [`tdd-working/`](../projects/twitter-clon/.cursor/skills/tdd-working/SKILL.md) | TDD estricto con Jest (Red → Green → Refactor) acoplado a la estructura del monorepo. |
| [`executing-browser/`](../projects/twitter-clon/.cursor/skills/executing-browser/SKILL.md) | Uso del CLI **agent-browser** para snapshots, screenshots y pruebas ligeras en el navegador. |

Sirven como referencia concreta de cómo se documenta un flujo repetible para el agente en un proyecto real del curso.
