---
title: "MCP en Practica: Supabase Local + Skills"
week: 2
lesson: 6
tags: [mcp, supabase, docker, skills, cursor, postgresql, migraciones]
date: 2026-03-22
status: draft
---

# MCP en Practica: Supabase Local + Skills

> Conectar una base de datos local Supabase con Cursor mediante MCP para operar sobre datos reales sin salir del editor, usando skills como capa de orquestacion inteligente.

## Objetivos de Aprendizaje

- Levantar una instancia local de Supabase con Docker y gestionar migraciones versionadas en git.
- Configurar MCP en Cursor para que el editor se comunique con herramientas externas de forma estructurada.
- Usar MCP Inspector para depurar conexiones, explorar esquemas y validar respuestas antes de automatizar.
- Disenar skills especializados que orquesten llamadas MCP y CLI, manejando errores y fricciones reales.

## Conceptos Clave

- **Docker como entorno aislado:** Empaqueta toda la infraestructura (OS, dependencias, servicios) en contenedores. Permite desarrollar destructivamente: romper cosas sin afectar produccion ni el sistema local. Otro dev hace `supabase start` y obtiene exactamente tu estado.

- **Supabase local = PostgreSQL + tooling:** Supabase CLI levanta PostgreSQL, Auth y Storage localmente. Las migraciones son archivos SQL incrementales que quedan versionados en git, haciendo cada cambio auditable y reversible.

- **MCP (Model Context Protocol):** Estandar abierto de Anthropic que estructura la comunicacion entre Claude y herramientas externas. Define dos primitivas: **recursos** (lecturas: esquemas, archivos, APIs) y **herramientas** (escrituras: comandos, queries, migraciones). Incluye control de permisos sobre quien puede hacer que.

- **`.cursor/mcp.json`:** Archivo de configuracion donde cada entrada es un servidor MCP disponible en Cursor. Especifica el comando para levantar el servidor, sus argumentos y si esta habilitado.

- **MCP Inspector:** Herramienta CLI (`npx @modelcontextprotocol/inspector`) que abre una interfaz web para probar MCPs interactivamente. Muestra recursos y herramientas disponibles, permite testear parametros y validar respuestas sin tocar la DB real. Esencial para depurar antes de integrar en skills.

- **Skills como orquestacion:** Un skill no es solo un wrapper de MCP. Combina logica condicional, composicion de pasos (CLI + MCP + verificacion), manejo de errores robusto y feedback progresivo. Ejemplo del proyecto: un skill de **modificacion** (crea migraciones via CLI) y otro de **inspeccion** (queries read-only via MCP).

- **Fricciones reales y sus soluciones:** Comandos interactivos de Supabase bloquean Cursor (solucion: `--non-interactive`). Errores SQL silenciosos pasan desapercibidos (solucion: verificar con skill de inspeccion). Timeouts en operaciones largas (solucion: dividir en sub-pasos).

- **Arquitectura del flujo:** Cursor -> `.cursor/mcp.json` -> Servidor MCP -> Supabase CLI -> Docker (PostgreSQL). Cada capa tiene una responsabilidad clara y el skill orquesta el recorrido completo.

## Puntos de Control

- Si un comando de Supabase congela Cursor, cual es la causa probable y como lo resolverias?
- Que ventaja concreta tiene que las migraciones SQL vivan en git junto al codigo?
- Antes de integrar un MCP en un skill, que herramienta usarias para validar que funciona correctamente y por que?

## Notas Personales

<!-- Observaciones propias, conexiones con otros temas, ideas. -->
