---
title: "Aprendizajes — tercera semana (10x Builders)"
week: 3
lesson: 0
tags: [reflection, week-3]
date: 2026-03-31
status: draft
---

# Aprendizajes — tercera semana (10x Builders)

> **Síntesis.** Este espacio recoge una **reflexión personal** al cerrar la tercera semana: qué ideas quedaron instaladas, qué prácticas querés mantener y qué preguntas seguís arrastrando. Completarlo ayuda a anclar el curso en tu contexto real, no solo en el temario.

## Introducción

Las lecciones de la semana 3 abordan la diferencia entre **agentes autónomos y flujos de trabajo** (y la regla del límite del determinismo), la mecánica interna de un agente (**ReAct**, los cuatro pilares: cerebro, planificación, memoria, herramientas), el ecosistema **LangChain / LangGraph / LangSmith** y el ciclo de vida en producción, las **barreras de seguridad** (*guardrails*) como arquitectura distribuida y, finalmente, el proceso completo de **diseño e implementación** de un agente —del brief al despliegue. Este documento no resume el programa: es un **diario breve** para sintetizar *tu* lectura del material y de la práctica.

## Objetivos de aprendizaje

1. Redactar, al terminar la semana, un **balance** en prosa: qué entendiste mejor, qué te costó y qué vas a probar en el proyecto.
2. Conectar al menos **una idea** de las notas con una situación concreta de trabajo o estudio.

## Marco conceptual

### Para qué sirve esta reflexión

La semana 3 marca un cambio de escala: ya no se trata de usar herramientas dentro del IDE, sino de entender **cuándo construir un agente, cómo funciona por dentro y qué hace falta para que sobreviva en producción**. Es fácil quedarse con la impresión de que «agente = bueno, script = malo»; la reflexión fuerza a nombrar la frontera real: ¿dónde se rompe el determinismo en *tu* proyecto? ¿Qué guardrails necesitarías si tu agente operara sin supervisión?

### Qué podés incluir

Podés desarrollar un párrafo sobre el criterio que más te reorientó: quizá fue la regla del límite del determinismo y darte cuenta de que cierta tarea no necesitaba un agente. Otro eje útil: ¿cómo cambió tu forma de ver los frameworks después de armar (o estudiar) un agente con LangChain? Un tercer ángulo es la seguridad: ¿habías pensado en guardrails antes de esta semana, o diste por sentado que el modelo «no se equivoca»? Si preferís, respondé en prosa a: *si mañana tuvieras que diseñar un agente para un problema real, ¿arrancarías por el brief, por el código o por elegir el modelo? ¿Por qué?*

## Síntesis

Cerrar la semana con un texto propio —aunque sea medio folio— es un **acto de cierre** tan válido como repasar definiciones. La semana 3 empuja a pensar en arquitectura y proceso antes que en código: si no identificás dónde está el límite del determinismo en tu próximo proyecto, corrés el riesgo de sobrediseñar con IA lo que un script resolvería mejor.

## Preguntas de repaso

1. ¿Recordás algún momento en que estuviste a punto de usar un agente para algo que en realidad se resolvía con un script o un workflow simple? ¿Qué te hizo (o te haría) cambiar de opinión?
2. De los cuatro pilares de un agente (cerebro, planificación, memoria, herramientas), ¿cuál creés que es más fácil de subestimar en un diseño real? ¿Por qué?
3. ¿Qué guardrail implementarías primero en un agente que tuviera acceso a una base de datos con datos de usuarios? ¿Por qué ese y no otro?
4. Si tuvieras que explicar el ciclo construir → observar → evaluar → desplegar a alguien que nunca trabajó con agentes, ¿qué analogía usarías?

## Notas Personales

<!-- Observaciones propias, conexiones con otros temas, ideas. -->
