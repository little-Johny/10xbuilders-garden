---
title: "Fundamentos: El Loop de Ingeniería Híbrida"
week: 1
lesson: 2
tags: [bpir, proceso, ia-asistida, brief, plan, review]
date: 2026-03-19
status: done
---

# Fundamentos: El Loop de Ingeniería Híbrida

> El valor no está en prompts ingeniosos sino en un ciclo repetible donde vos definís el qué y los límites, la IA ejecuta, y cada entrega pasa por validación humana antes de seguir.

## Objetivos de Aprendizaje

- Describir el ciclo BPIR (Brief → Plan → Implementación → Review) y el rol de humano vs. IA en cada etapa.
- Redactar un brief mínimo efectivo (problema, contexto, restricciones, criterio de terminado).
- Pedir y revisar un plan de implementación antes de aceptar código, y fragmentar la implementación en bloques revisables.
- Aplicar una checklist mental de review (lógica, seguridad, rendimiento, alineación con el brief y la Definition of Done).

## Conceptos Clave

- **Ingeniería híbrida:** no improvisar cada chat; usar un proceso fijo. Sin eso, la IA tiende a inventar supuestos, dependencias o soluciones que no calzan con el problema real.
- **Ciclo BPIR:** **B**rief (humano: contexto, límites, Definition of Done) → **P**lan (IA propone pasos y estructura; humano valida la lógica) → **I**mplementación (IA, en iteraciones chicas) → **R**eview (humano: auditoría). Después de Review, la siguiente tarea vuelve a empezar en Brief.
- **Brief como contrato:** si faltan datos, el modelo rellena con fantasía. Un brief sólido responde: qué problema, en qué contexto corre, qué no se puede hacer o asumir, y cuándo se da por cerrado.
- **Plan antes que código:** la regla es no arrancar escribiendo código a ciegas. Primero pasos en lenguaje natural, archivos, dependencias y orden lógico; corregir el plan sale mucho más barato que desarmar código mal encaminado.
- **Implementación en bloques:** estructura base → revisión → lógica → revisión → tests o integración → revisión. Menos sorpresas y más control sobre lo que aceptás.
- **Review serio:** no asumir que “compila = listo”. Mirar librerías raras, lógica de negocio, seguridad, performance y huecos respecto al brief y al DoD.

## Puntos de Control

- *¿Tu última tarea con IA empezó con un brief escrito o con “haceme una función que…”?*
- *¿Alguna vez aceptaste un plan sin leerlo y después pagaste el costo en debugging? ¿Qué hubieras cambiado en la fase Plan?*
- *Elegí una micro-tarea (por ejemplo validar un email): ¿podés escribir en 3–5 líneas el brief y enumerar qué revisarías en Review sin mirar el código línea a línea primero?*

## Notas Personales

<!-- Observaciones propias, conexiones con otros temas, o ideas que surgieron durante el estudio. -->
