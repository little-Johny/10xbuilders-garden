---
title: "Fundamentos: El Loop de Ingeniería Híbrida"
week: 1
lesson: 2
tags: [bpir, proceso, ia-asistida, brief, plan, review]
date: 2026-03-19
status: done
---

# Fundamentos: El Loop de Ingeniería Híbrida

> **Síntesis.** El valor no está en prompts ingeniosos aislados, sino en un **ciclo repetible** en el que el humano fija el qué y los límites, la IA ejecuta por fases, y cada entrega pasa por **revisión consciente** antes de avanzar. Sin ese proceso, el modelo tiende a inventar supuestos y soluciones desalineadas.

## Introducción

La **ingeniería híbrida** (humano + IA) necesita la misma disciplina que un flujo de software tradicional: si cada conversación improvisa el siguiente paso, el resultado depende del azar del modelo. La lección formaliza un bucle **BPIR** —Brief, Plan, Implementación, Review— y asigna responsabilidades claras en cada etapa.

## Objetivos de aprendizaje

1. Describir el ciclo **BPIR** y el rol del humano frente a la IA en cada fase.
2. Redactar un **brief** mínimo útil: problema, contexto, restricciones y criterio de terminado.
3. Exigir y revisar un **plan de implementación** antes de aceptar código, fragmentando la implementación en bloques revisables.
4. Aplicar una **checklist mental de review** (lógica, seguridad, rendimiento, alineación con brief y Definition of Done).

## Marco conceptual

### Por qué hace falta un proceso fijo

Sin proceso, la IA completa sintaxis pero puede introducir dependencias, capas o APIs que no calzan con el problema. **Ingeniería híbrida** significa elegir de antemano cómo se decide qué hacer en cada etapa, en lugar de renegociar todo en cada mensaje.

### Ciclo BPIR

El ciclo enlaza cuatro fases. En el **Brief**, el humano aporta contexto, límites y **Definition of Done**; sin eso, el modelo rellena lagunas con suposiciones. En el **Plan**, la IA propone pasos y estructura y el humano valida la lógica antes de que exista código; corregir el plan es barato frente a deshacer implementación. La **Implementación** la hace la IA en iteraciones acotadas. El **Review** es humano: auditoría de coherencia, riesgos y cumplimiento del brief. Tras el Review, la siguiente pieza de trabajo vuelve a empezar por Brief.

### Brief como contrato

Un brief sólido responde qué problema se resuelve, en qué entorno corre, qué no se puede asumir ni hacer, y cuándo la tarea se considera cerrada. Si faltan datos, el modelo inventa; el brief reduce esa **fantasía** a un espacio manejable.

### Plan antes que código

La regla operativa es no arrancar escribiendo código a ciegas. Primero se fijan pasos en lenguaje natural, archivos tocados, dependencias y orden lógico. Ajustar el plan cuesta poco frente a refactorizar un camino equivocado.

### Implementación en bloques y review serio

Conviene estructurar la implementación en secuencia revisable —por ejemplo esqueleto, luego lógica, luego tests o integración— con pausas de revisión. El **review** no termina en «compila»: incluye librerías extrañas, lógica de negocio, seguridad, rendimiento y huecos respecto al brief y al DoD.

## Síntesis

BPIR convierte el chat en **cadena de entregas gobernadas**: el brief fija el contrato, el plan expone la estrategia antes del coste del código, y el review cierra el ciclo con criterios de ingeniería, no solo de sintaxis.

## Preguntas de repaso

1. ¿Tu última tarea con IA empezó con un brief escrito o con un «haceme una función que…» sin contexto de sistema?
2. ¿Alguna vez aceptaste un plan sin leerlo y pagaste el costo en debugging? ¿Qué habrías cambiado en la fase Plan?
3. Para una microtarea (por ejemplo validar un email), ¿podés escribir en tres a cinco líneas el brief y enumerar mentalmente qué revisarías en Review sin leer línea a línea todo el código primero?

## Notas Personales

<!-- Observaciones propias, conexiones con otros temas, o ideas que surgieron durante el estudio. -->
