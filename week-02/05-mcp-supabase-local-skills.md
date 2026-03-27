---
title: "MCP en Practica: Supabase Local + Skills"
week: 2
lesson: 6
tags: [mcp, supabase, docker, skills, cursor, postgresql, migraciones]
date: 2026-03-22
status: draft
---

# MCP en Practica: Supabase Local + Skills

> **Síntesis.** Conectar una base **Supabase** local al editor mediante **MCP** permite operar sobre datos y esquemas reales sin abandonar el flujo de trabajo, mientras los **skills** orquestan **CLI**, llamadas al protocolo y verificaciones para que el agente no quede atrapado en comandos interactivos o errores silenciosos.

## Introducción

Desarrollar contra una base real —aunque sea local— exige **reproducibilidad**: mismas migraciones, mismos contenedores, mismo esquema versionado en git. **Docker** aísla la infraestructura; la **CLI de Supabase** levanta PostgreSQL y servicios asociados. **MCP** estructura el acceso desde Cursor u otro cliente. **MCP Inspector** permite depurar antes de automatizar. Los **skills** van un paso más allá del «wrapper»: combinan pasos, manejo de errores y comprobaciones. La lección recorre ese stack y las **fricciones** habituales (comandos interactivos, SQL que falla sin señal clara, timeouts).

## Objetivos de aprendizaje

1. Levantar una instancia **local de Supabase** con Docker y gestionar **migraciones** versionadas en git.
2. Configurar **MCP** en Cursor mediante el archivo de configuración del editor para hablar con herramientas externas de forma estructurada.
3. Usar **MCP Inspector** para depurar conexiones, explorar esquemas y validar respuestas antes de integrar todo en un skill.
4. Diseñar **skills** que orquesten llamadas MCP y CLI, con manejo explícito de errores y de modos no interactivos.

## Marco conceptual

### Docker y entorno reproducible

**Docker** empaqueta servicios en contenedores de modo que otro desarrollador puede recrear el mismo estado con comandos declarados. Eso permite experimentar sin contaminar el sistema host ni una base compartida accidentalmente.

### Supabase local y migraciones

**Supabase** en local aporta **PostgreSQL** y herramientas coherentes con el producto cloud. Las **migraciones** son archivos SQL incrementales versionados junto al código: cada cambio de esquema queda **auditable** y reversible, alineado con prácticas de equipo.

### MCP como capa de acceso

**MCP** define cómo el cliente descubre **recursos** (lecturas: esquemas, metadatos) y **herramientas** (acciones: consultas, comandos acotados) con permisos explícitos. En `.cursor/mcp.json` (o equivalente) se registran los **servidores** disponibles: comando, argumentos y habilitación.

### MCP Inspector

**MCP Inspector** (por ejemplo vía `npx @modelcontextprotocol/inspector`) abre una interfaz para probar servidores MCP: lista herramientas y recursos, permite ajustar parámetros y ver respuestas **sin** tocar aún la base productiva ni el skill final. Es el lugar indicado para validar conectividad y semántica antes de automatizar.

### Skills como orquestación

Un skill útil no se limita a «llamar al MCP». Combina **lógica condicional**, composición de pasos (CLI + MCP + verificación), manejo de fallos y mensajes claros. En proyectos de clase suele haber un skill más orientado a **modificación** (por ejemplo migraciones vía CLI) y otro a **inspección** (consultas de solo lectura vía MCP), lo que separa rutas peligrosas de exploración segura.

### Fricciones frecuentes

Los comandos **interactivos** de algunas CLIs pueden bloquear al agente: la mitigación típica es usar flags **no interactivos** donde existan. Los errores SQL a veces pasan **silenciosos** en flujos largos: conviene **verificar** con un paso de inspección o test. Las operaciones largas pueden **timeout**: partirlos en subpasos o acotar alcance reduce sorpresas.

### Flujo en capas

En líneas generales el recorrido es: **Cursor** lee configuración MCP → **servidor MCP** → **Supabase CLI** u operaciones sobre **Docker** (PostgreSQL). Cada capa tiene una responsabilidad; el **skill** documenta y encadena el recorrido para el agente.

## Síntesis

Supabase local más MCP más skills forma un **sistema**: datos reproducibles, acceso estructurado desde el editor y orquestación explícita que absorbe la complejidad operativa (incluidas las fricciones de terminal y SQL).

## Preguntas de repaso

1. Si un comando de Supabase **congela** Cursor, ¿cuál es una causa probable y cómo la abordarías?
2. ¿Qué ventaja tiene que las migraciones SQL vivan en **git** junto al código de aplicación?
3. Antes de integrar un MCP en un skill, ¿qué herramienta usarías para validar que responde como esperás y por qué?

## Notas Personales

<!-- Observaciones propias, conexiones con otros temas, ideas. -->
