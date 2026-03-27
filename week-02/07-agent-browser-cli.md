---
title: "Configurar CLI: Agent Browser de Vercel"
week: 2
lesson: 7
tags: [agent-browser, cli, testing, integration, automation, vercel]
date: 2026-03-24
status: draft
---

# Configurar CLI: Agent Browser de Vercel

> **Síntesis.** Integrar una **CLI** de automatización de navegador permite que los agentes de IA controlen un **Chrome** real y encadenen acciones **sin** un intermediario LLM por cada paso, lo que acelera y abarata los **tests de integración** y la verificación de flujos completos en la UI.

## Introducción

Los tests **unitarios** suelen mockear el entorno y no abren navegador. Los tests de **integración** necesitan clicks, carga de página y aserciones sobre el DOM. **Agent Browser** (CLI de Vercel) está pensado para que **agentes** —no solo humanos— piloten el navegador, con localizadores orientados a **intención** y manejo de incertidumbre frente a selectores frágiles. Complementar eso con **skills** que documenten patrones del proyecto (esperas, formularios React, sesiones) reduce errores de improvisación.

## Objetivos de aprendizaje

1. **Instalar y usar** agent-browser CLI para que un agente de IA controle un navegador real en flujos reproducibles.
2. **Distinguir** tests unitarios (lógica aislada, mocks) de tests de integración (navegador real, UI, eventos).
3. Crear **skills** que capturen patrones de uso del CLI para no redescubrir la herramienta en cada tarea.
4. **Encadenar** acciones vía CLI reduciendo round-trips al LLM y midiendo el impacto en coste y tiempo.

## Marco conceptual

### Qué es Agent Browser CLI

**Agent Browser** es una herramienta orientada a **agentes**: automatiza Chrome con abstracciones más cercanas al propósito que a selectores CSS frágiles, y contempla variabilidad en la interfaz. Se diferencia de enfoques clásicos de automatización pensados solo para suites humanas predefinidas.

### CLI directa versus intermediario LLM

Con un **intermediario LLM**, cada acción puede implicar captura y consulta al modelo: es lento y caro. Con la **CLI encadenada**, muchas acciones se ejecutan en secuencia y solo al final hace falta un LLM para **verificar** o decidir el siguiente bloque. En la práctica pueden aparecer diferencias grandes en latencia y coste acumulado.

### Skills contextualizados

Un skill que documente **cómo** esperar elementos, qué localizadores usar en este proyecto y cómo encadenar pasos evita que el agente **improvise** y cometa errores evitables (por ejemplo asumir selectores que no existen).

### Integración frente a unitarios

Los **unitarios** validan lógica con datos de prueba sin navegador. Los de **integración** abren un navegador real, simulan usuario y comprueban el estado de la UI. Agent Browser habilita este segundo tipo de forma alineada con flujos **agénticos**.

### Formularios y frameworks reactivos

En frameworks como **React**, botones o envíos pueden quedar deshabilitados hasta que el estado interno cambia. La automatización debe incluir **esperas** o **disparadores** explícitos —documentados en el skill— para no fallar por condiciones de carrera entre el DOM y el estado.

### Sesiones aisladas

La herramienta puede mantener **sesiones** independientes, útil para paralelizar flujos de prueba sin interferencia entre contextos de login o datos.

## Síntesis

Agent Browser acerca la **automatización de navegador** al mundo de los agentes: CLI encadenable, menos dependencia de un LLM por micro-acción, y skills como capa de conocimiento del proyecto sobre la herramienta genérica.

## Preguntas de repaso

1. Si un agente ejecuta diez acciones de navegador, ¿qué diferencia práctica en coste y velocidad esperás entre un intermediario LLM por acción y encadenar todo vía CLI?
2. ¿Por qué un skill contextualizado para agent-browser suele mejorar la calidad frente a dejar que el agente descubra el CLI solo?
3. ¿Cómo abordarías un caso donde el clic en «submit» no surte efecto porque el botón sigue deshabilitado hasta que React actualiza el estado?

## Notas Personales

<!-- Observaciones propias, conexiones con otros temas, ideas. -->
