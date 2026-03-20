---
title: "Planificación y Negociación (The Planner)"
week: 1
lesson: 4
tags: [planificación, the-planner, brief, arquitectura, negociación]
date: 2026-03-19
status: draft
---

# Planificación y Negociación (The Planner)

> Antes de que la IA escriba una línea, conviene tener un plan auditable en lenguaje natural: corregir la estrategia ahí cuesta segundos; arreglar código mal encaminado puede costar horas.

## Objetivos de Aprendizaje

- Pedir y obtener **solo un plan** (pasos, archivos a crear/modificar y lógica en prosa) a partir de un Technical Brief, sin deslizarse a implementación prematura.
- Revisar un plan como **auditor de arquitectura**: rutas y nombres, dependencias e imports, orden lógico (tipos/interfaces → implementación → integración/tests) y respeto a las restricciones del brief.
- **Negociar** ajustes en el plan con instrucciones explícitas (p. ej. qué archivo no tocar y qué alternativa usar) y dejar constancia del plan aprobado antes de implementar.

## Conceptos Clave

- **Implementación prematura:** si la IA arranca en código suele inventar módulos, imports rotos, mezclar capas sin orden o ignorar límites del proyecto. Un plan previo permite leer la lógica y fallas estructurales en poco tiempo.
- **Prompt de planificación:** anclar el **brief** y exigir un plan paso a paso **sin código**: qué archivos se crean, cuáles se modifican y por qué, con la lógica de cada parte en lenguaje natural. Si aparece código, cortar con “solo el plan, sin código”.
- **Checklist de revisión humana:** (1) **archivos y rutas** — ¿encajan con la convención del repo? (2) **dependencias e imports** — ¿existen y estaban alineadas al brief? (3) **orden lógico** — primero contratos/tipos, luego núcleo, después cableado y pruebas; (4) **constraints** — ¿se proponen cambios en zonas prohibidas o sensibles?
- **Negociación en la fase Plan:** el lugar barato para corregir es el plan. Ejemplo mental: en lugar de tocar `cart.py`, pedir un adaptador nuevo que integre el servicio; la IA actualiza el plan y se evita refactor y debugging evitable.
- **Flujo repetible:** brief → pedir únicamente el plan → revisar → iterar/negociar hasta alinear → **guardar el plan final** en un archivo (p. ej. `plan-implementacion-*.md`) como contrato para la implementación siguiente.
- **Rol del humano como Planner:** no es “escribir el plan a mano”, sino **evaluar, corregir y aprobar** la propuesta de la IA. La IA optimiza y a veces inventa; detectar eso en prosa es mucho más rápido que en diff.

## Puntos de Control

- *¿La última vez que pediste código a la IA, habías leído y aprobado un plan con archivos y orden explícitos?*
- *Mirando un plan hipotético: ¿qué dependencia o ruta revisarías primero para detectar alucinaciones?*
- *¿Hay algún archivo o capa en tu proyecto que deberías declarar como “no tocar” en el brief o negociar así en el plan antes de implementar?*

## Notas Personales

<!-- Observaciones propias, conexiones con otros temas, o ideas que surgieron durante el estudio. -->
