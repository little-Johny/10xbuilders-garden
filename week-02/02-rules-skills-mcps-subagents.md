---
title: "Los 4 Componentes: Reglas, Skills, MCPs, SubAgents"
week: 2
lesson: 2
tags: [reglas, skills, mcps, subagents, arquitectura, sistemas, orquestacion]
date: 2026-03-16
status: in-progress
---

# Los 4 Componentes: Reglas, Skills, MCPs, SubAgents

> **Síntesis.** Pasar de **promptear** en modo reactivo a **diseñar sistemas** sostenibles exige nombrar cuatro piezas que se combinan en el flujo: **Reglas**, **Skills**, **MCP** (Model Context Protocol) y **SubAgents**. Cada una responde a una necesidad distinta; mezclarlas o ignorarlas reproduce microgestión y contexto inflado.

## Introducción

La metáfora del **director técnico** implica dejar de controlar cada acción del modelo y empezar a **mejorar el sistema** que rodea al agente: qué se inyecta siempre, qué procedimientos están documentados, cómo se accede a datos externos y qué tareas se delegan en segundo plano. La lección presenta una **cancha** unificada: el código donde opera el agente, vos como quien fija el sistema, las acciones posibles (leer, escribir, ejecutar) y los cuatro tipos de «jugadores» o capacidades.

## Objetivos de aprendizaje

1. Entender la metáfora del director técnico: de microgestionar cada acción a **observar y mejorar el sistema**.
2. Diferenciar los **cuatro componentes**: qué es cada uno, cuándo usarlo y por qué importa en el largo plazo.
3. Describir cómo se **cargan y operan** en el contexto del agente (reglas persistentes, skills con despliegue progresivo, MCP con catálogo de herramientas, subagents con ámbito propio).
4. Aplicar **criterios de decisión** para elegir entre regla, skill, MCP o subagent en un flujo real.
5. Identificar **casos de uso** concretos de cada componente en el propio trabajo.

## Marco conceptual

### Reglas: principios que siempre aplican

Las **reglas** son principios de juego que se cargan **en cada** interacción relevante. Suele almacenarse en archivos como `claude.md` o `.cursor/rules`. Son el lugar adecuado para seguridad, estilo de código y principios de diseño que **no** querés renegociar en cada chat. Si una norma vale para todo el proyecto y se repite en cada sesión, es candidata a regla, no a recordatorio manual.

### Skills: jugadas ensayadas y progressive disclosure

Los **skills** son procedimientos reutilizables que enseñan al agente **cómo** hacer algo específico. Su rasgo típico es el **progressive disclosure**: al principio el modelo ve solo nombre y descripción breve; si el skill es relevante, carga el detalle completo. Eso ahorra tokens y reduce ruido frente a pegar un manual entero en cada mensaje. Conviene un skill cuando el procedimiento se repite, tiene pasos claros y un nombre que el agente pueda descubrir en el índice.

### MCP: conexión estructurada al mundo exterior

**MCP** (Model Context Protocol) estandariza cómo el cliente (editor o agente) descubre e invoca **herramientas** expuestas por un **servidor** que habla con sistemas externos: bases de datos, APIs, servicios internos. En este modelo suele predominar la **disclosure completa del catálogo** de herramientas disponibles para ese servidor: el agente ve todas y elige cuál invocar. Es la pieza adecuada cuando los datos viven fuera del repo y cambian con frecuencia.

### SubAgents: especialistas con contexto propio

Los **subagents** son agentes delegados para tareas concretas —a menudo en paralelo o en segundo plano— que **no** deberían secuestrar el hilo principal. Ejemplos típicos: revisión de seguridad, ejecución de tests, o generación de documentación paralela. Mantienen su propio scope y devuelven un resumen al flujo principal.

### Dinámica esperada frente a la tradicional

En un enfoque tradicional, el foco está en «qué hacer paso a paso» y el control en microgestión; la carga mental se dispara porque repetís instrucciones. En el enfoque esperado, el foco pasa a **mejorar el sistema** que el agente usa: el control es observar y ajustar reglas, skills, MCP y subagents; la carga baja y la escalabilidad mejora porque el sistema **se reutiliza**.

### Criterios de elección rápida

Si necesitás que un principio se aplique **siempre** sin debate, suele ser **regla**. Si un procedimiento con pasos definidos se repite más de unas pocas veces y merece nombre propio, suele ser **skill**. Si necesitás **datos o acciones** en sistemas externos con contrato estable, suele ser **MCP**. Si la tarea es secundaria pero importante, repetible y conviene **aislar contexto** (tests, review), suele ser **subagent**.

## Síntesis

Los cuatro componentes no compiten: se **combinan**. Las reglas fijan el terreno; los skills enseñan recetas; el MCP conecta con fuentes vivas; los subagents delegan trabajo pesado sin inflar el chat principal. Diseñar el sistema es elegir **dónde va cada responsabilidad**.

## Preguntas de repaso

1. ¿Qué instrucciones le repetís al agente en cada sesión? ¿Cuáles podrían ser **reglas**?
2. ¿Qué procedimiento hacés manualmente más de tres veces con variaciones mínimas? ¿Encajaría como **skill**?
3. ¿Qué datos copiás a mano desde fuentes externas? ¿Un **MCP** podría servirlos con menos fricción?
4. ¿Qué tareas secundarias te sacan del foco principal pero siguen siendo obligatorias? ¿Son candidatas a **subagent**?

## Notas Personales

<!-- Observaciones propias, conexiones con otros temas, ideas. -->
