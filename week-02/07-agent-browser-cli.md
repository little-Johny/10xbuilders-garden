---
title: "Configurar CLI: Agent Browser de Vercel"
week: 2
lesson: 7
tags: [agent-browser, cli, testing, integration, automation, vercel]
date: 2026-03-24
status: draft
---

# Configurar CLI: Agent Browser de Vercel

> Integrar una CLI de automatización de navegador en el flujo de desarrollo permite que agentes de IA controlen Chrome directamente, encadenando acciones sin intermediarios LLM, lo que acelera y abarata los tests de integración y la verificación de features completas.

## Objetivos de Aprendizaje

- Instalar y usar agent-browser CLI para que un agente de IA controle un navegador real
- Distinguir entre tests unitarios (datos mock, sin navegador) y tests de integración (navegador real, clicks, UI)
- Crear skills especializados que documenten patrones de uso del CLI para que el agente no arranque de cero
- Encadenar comandos CLI sin round-trips a un LLM, reduciendo costo y tiempo drasticamente

## Conceptos Clave

- **Agent Browser CLI:** herramienta de Vercel pensada para que agentes de IA (no humanos) controlen navegadores. A diferencia de Puppeteer o Selenium, usa localizadores semanticos (busca por proposito, no por CSS selector) y manejo de incertidumbre, ideal para flujos agenticos.
- **CLI directo vs. intermediario LLM:** con intermediario, cada accion captura pantalla y consulta al LLM (lento, caro). Con CLI encadenado, se ejecutan N acciones en secuencia y solo al final se consulta al LLM para verificar. La diferencia puede ser 10x en velocidad y 25x en costo.
- **Skills contextualizados para browser:** un skill pre-documentado le dice al agente como usar el navegador (como esperar, que localizadores usar, como encadenar pasos). Esto evita que el agente improvise y cometa errores basicos.
- **Tests de integracion vs. unitarios:** los unitarios validan logica aislada con datos de prueba. Los de integracion abren un Chrome real, hacen clicks, escriben texto y verifican cambios en la UI. Agent-browser habilita este segundo tipo de forma automatizada.
- **Reactividad en formularios:** frameworks como React a veces no habilitan botones hasta que el estado interno cambia. Al automatizar, hay que agregar esperas o triggers especificos en el skill para que el formulario reaccione correctamente.
- **Sessions aisladas:** agent-browser puede mantener multiples sesiones independientes, util para probar flujos en paralelo sin interferencia.

## Puntos de Control

- Si un agente ejecuta 10 acciones de navegador, cual es la diferencia practica (en costo y velocidad) entre usar un intermediario LLM por cada accion vs. encadenar todo via CLI?
- Por que un skill contextualizado para agent-browser mejora la calidad de la automatizacion comparado con dejar que el agente descubra como usar el CLI por su cuenta?
- Como resolverian un caso donde el agent-browser hace click en "submit" pero el boton esta deshabilitado porque React no actualizo el estado?

## Notas Personales

<!-- Observaciones propias, conexiones con otros temas, ideas. -->
