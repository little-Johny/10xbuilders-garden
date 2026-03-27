---
title: "SubAgents: contexto fresco y delegación"
week: 2
lesson: 8
tags: [subagents, delegación, contexto, qa, code-review, cursor, flujo-de-trabajo, costo]
date: 2026-03-25
status: draft
---

# SubAgents: contexto fresco y delegación

> **Síntesis.** Los **subagents** permiten delegar tareas laterales o muy especializadas en conversaciones con contexto propio, de modo que el hilo principal conserva solo planes y resultados agregados. Así se limita el crecimiento del historial que el modelo debe reprocesar en cada turno y se mantiene legible el trabajo de diseño e implementación de features.

## Introducción

En sesiones largas con un asistente de código, cada nueva petición arrastra el historial completo: implementaciones, refactors, tests y optimizaciones conviven en el mismo hilo. Ese acumulado no solo cansa al lector humano; también aumenta tokens, latencia y coste, porque el sistema vuelve a “leer” todo lo anterior para responder. La clase presenta la **delegación en subagents** como forma de aislar trabajo repetible o especializado y devolver al chat principal solo un resumen compacto.

## Objetivos de aprendizaje

1. Reconocer cuándo una conversación acumula **ruido de contexto** y encarece o enlentece cada siguiente paso.
2. Explicar cómo un subagent mantiene un **ámbito de trabajo propio** y qué tipo de salida conviene devolver al agente principal.
3. Aplicar los roles habituales de **QA/testing** y **code review** como subagents, y valorar cuándo compensa abrirlos frente a seguir en el mismo hilo.
4. Relacionar el patrón con un proyecto tipo **clon de X**: feature en el principal, verificación y revisión delegadas cuando corresponda.

## Marco conceptual

### Contexto saturado y coste de releer el historial

**Contexto saturado** (a veces llamado “ensuciado”) no es solo “mucho texto”: es el efecto de encadenar en un solo hilo refactors, validaciones, suites de tests y ajustes de rendimiento. Cada mensaje añade material que el modelo considera en turnos posteriores, aunque la tarea actual sea acotada. Por eso el coste y el tiempo por respuesta pueden subir aunque el pedido nuevo sea pequeño: el sistema paga el reprocesamiento de un historial largo.

### Subagent como delegación con memoria aislada

Un **subagent** es una conversación o tarea delegada cuyo trabajo no tiene por qué expandirse línea a línea en el hilo principal. El agente principal describe una tarea acotada; el subagent opera con el código y las normas que necesita (por ejemplo convenciones de tests o de revisión) y, al terminar, devuelve un **resultado resumido**: por ejemplo que los tests pasan, o una lista breve de comentarios de revisión. El principal conserva el plan y los desenlaces, no el detalle de cada paso intermedio del subagent.

### Paralelismo, foco y economía del hilo principal

Varios subagents pueden trabajar en frentes distintos (por ejemplo uno ejecutando tests y otro revisando estilo y seguridad) mientras el hilo principal sigue orientado al siguiente feature o a decisiones de alcance. El total de tokens consumidos en el sistema puede ser parecido o distinto según el caso; lo que suele mejorar es que el **contexto del principal** permanece corto y barato de releer, y que las ramas de trabajo especializado no “contaminan” la siguiente instrucción de producto. En la práctica, el beneficio principal es claridad y foco, junto con evitar arrastrar historial de QA o review en cada mensaje de diseño.

### Patrones habituales: QA/testing y code review

El subagent orientado a **QA/testing** concentra la lectura del código bajo prueba, los patrones del framework (unitarias, integración, automatización de navegador, etc.) y la ejecución de la suite. Su salida típica es un informe agregado: pasos o fallos, cobertura si aplica, y un veredicto claro. Encaja después de implementar un feature o antes de abrir un pull request.

El subagent de **code review** adopta la perspectiva de revisión sistemática: convenciones del repositorio, riesgos de seguridad, acoplamiento, números mágicos, imports o consultas peligrosas. Devuelve observaciones priorizadas (por severidad o tipo), no una segunda transcripción larga del código en el chat principal. Ambos roles se benefician de una **especialización explícita**: el “personaje” de QA prioriza casos límite y evidencia ejecutable; el de revisión prioriza riesgos y consistencia arquitectónica frente a un agente genérico atrapado en un único hilo enorme.

### Cuándo conviene un subagent y extensiones del patrón

Conviene delegar cuando la tarea es **acotada**, **repetible** en esencia y **ajena** al siguiente paso creativo del principal (por ejemplo “ejecutar la suite y reportar”). Una consulta de una sola línea rara vez justifica abrir otro contexto: el coste de coordinación puede superar el beneficio.

Más allá de QA y revisión, cabe imaginar otros roles. Un ejemplo discutido en clase es un **subagent de documentación o bitácora**: mantener documentación técnica al día, una línea de tiempo de decisiones, apuntes de aprendizaje y una lista de lagunas (“qué investigar después”). Funciona como los anteriores: el conocimiento estructurado vive fuera del hilo de implementación y vuelve al principal en forma de resumen o enlaces a artefactos generados.

## Síntesis

Los subagents atacan el problema de la **saturación del contexto** separando el trabajo especializado del hilo donde se define el producto y el diseño. Los roles de QA y code review son patrones maduros porque acotan bien entrada y salida; otros roles (como documentación) siguen la misma lógica siempre que el resultado devuelto al principal sea breve y accionable.

## Preguntas de repaso

1. ¿Qué tipo de mensajes en una sesión larga suelen añadir ruido al contexto sin aportar al objetivo inmediato del turno siguiente?
2. Si delegas tests a un subagent y revisión a otro, ¿qué información mínima debería conservar la conversación principal para que puedas seguir planificando la siguiente feature con claridad?
3. ¿En qué situación preferirías no abrir un subagent y resolver todo en el mismo chat?

## Notas Personales

<!-- Observaciones propias, conexiones con otros temas, ideas. -->
