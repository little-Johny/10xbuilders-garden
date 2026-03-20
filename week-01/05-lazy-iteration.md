---
title: "Implementación y Lazy Iteration"
week: 1
lesson: 5
tags: [lazy-iteration, implementación, revisión-humana, bug-bash, tdd]
date: 2026-03-19
status: draft
---

# Implementación y "Lazy Iteration"

> Lazy Iteration no es “ir más despacio”: es ejecutar el plan en **entregas chicas y revisables** para que vos sigas siendo quien valida estructura, supuestos y calidad antes de que el siguiente bloque tape problemas.

## Objetivos de Aprendizaje

- Implementar con IA en **bloques lógicos** (base estructural → lógica de negocio acotada → tests), con **pausa y revisión humana** entre bloque y bloque.
- Aplicar la regla **simplicidad primero**: rechazar el patrón “un prompt gigante → centenares de líneas” a favor de menos código por paso y más control.
- Diseñar o interpretar un **Bug Bash** (requisito sorpresa) para distinguir si la IA **extiende el diseño** de forma ordenada o **parcheado**; saber cuándo pedir refactor explícito.

## Conceptos Clave

- **Lazy Iteration:** partir del **plan ya validado** y avanzar en pasos donde la IA entrega una porción acotada; entre pasos, el humano audita nombres, tipos, coherencia con el brief y riesgo de deuda oculta. Objetivo: errores de diseño tempranos y menos “sorpresa” acumulada.
- **Orden típico de bloques:** (1) **interfaces, tipos y contratos** — revisar coherencia conceptual; si falla acá, corregir antes de seguir; (2) **una estrategia o regla de negocio concreta** (p. ej. un país) — chequear lógica, uso de interfaces y duplicación; (3) **tests unitarios** — normales, borde y error (monto cero, país no soportado, etc.); fallos en tests se arreglan antes del siguiente bloque.
- **Simplicidad / tamaño de respuesta:** muchas líneas de una sola vez sacrifican control: estructuras no revisadas, suposiciones incorrectas y debugging difícil. Preferir **varias rondas pequeñas** con revisión explícita.
- **Bug Bash simulado:** inyectar un requisito raro (p. ej. regla fiscal que depende del día) para ver **cómo** reacciona la IA. **Refactor limpio:** extender contratos, estrategias o reglas separadas, bajo acoplamiento. **Parche:** `if` sueltos, lógica pegada, duplicación — señal de que conviene pedir **refactor, extracción de reglas o nuevas estrategias** en lugar de aceptar el parche.
- **Evidencia y rollback:** guardar o versionar cada bloque (o el chat por fase) ayuda a **volver atrás** si un paso desvía el diseño.
- **Rol del dev:** pasar de **receptor** de bloques enormes a **revisor activo** del código generado; los cambios imprevistos ponen a prueba si el diseño inicial era realmente extensible.

## Puntos de Control

- *¿Tu última implementación con IA fue en un solo mensaje largo o en tres entregas con revisión explícita entre medias?*
- *Si apareciera el requisito “martes en California cambia el impuesto”, ¿es anticipable que tu diseño actual lo absorba con una nueva regla/estrategia o caería en condicionales pegados?*
- *Tras el Bloque 1 (tipos/interfaces), ¿qué tres cosas mirarías en 60 segundos antes de autorizar el Bloque 2?*

## Notas Personales

<!-- Observaciones propias, conexiones con otros temas, o ideas que surgieron durante el estudio. -->
