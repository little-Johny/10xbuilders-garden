---
title: "El Arte del Technical Brief (Architecting)"
week: 1
lesson: 3
tags: [technical-brief, contexto, architecting, definition-of-done, constraints]
date: 2026-03-19
status: draft
---

# El Arte del "Technical Brief" (Architecting)

> La calidad del código que devuelve la IA sigue a la calidad del contexto que le das: un brief bien armado acota el espacio de soluciones y evita que el modelo invente; un pedido vago produce “código de demo”, no software que aguante sistema real.

## Objetivos de Aprendizaje

- Explicar por qué el cuello de botella suele ser el contexto (no “el modelo”) y adoptar el mantra: **contexto sólido → código más útil**.
- Completar un Technical Brief con las cinco secciones obligatorias (título, contexto, requerimientos técnicos, restricciones, Definition of Done) para una tarea concreta.
- Aplicar el flujo **brief → crítica por IA (sin código) → iteración del brief → recién después plan/implementación**, usando la IA como revisor de diseño antes que como generador.

## Conceptos Clave

- **De “pedir código” a “dirigir implementación”:** la formulación importa. “Hacé una función de impuestos” obliga a la IA a adivinar; describir el problema real (p. ej. lógica fiscal acoplada al carrito en un e-commerce legacy y necesidad de servicio desacoplado, stateless y extensible) alinea la solución con arquitectura y mantenimiento.
- **Technical Brief:** documento corto que fija alcance y criterios *antes* de escribir código. Las **cinco secciones** son: (1) **título** que encaje el alcance en una frase con intención clara; (2) **contexto** (por qué existe el problema y qué parte del sistema toca, para cortar suposiciones); (3) **requerimientos técnicos** (stack, patrones, entradas/salidas, contratos, tipos — intención → especificación operativa); (4) **constraints** (qué no hacer, estándos, herramientas de test/lint, casos borde esperados — frena dependencias inventadas y atajos); (5) **Definition of Done** (criterios verificables: lint, cobertura, documentación pública, etc. — el éxito se mide con evidencia, no con “se ve que anda”).
- **Flujo de trabajo:** elegir escenario real o sandbox → redactar el brief completo → **no pedir código aún**: entregar el brief y pedir **crítica** (qué falta, qué es ambiguo, qué restricción sumar) → incorporar feedback y reforzar el brief → solo entonces pasar a planificación o implementación. Saltarse la crítica suele dar una primera versión aparentemente linda pero frágil.
- **Tres ideas para llevar:** (1) un prompt de una línea suele mapear a una solución mentalmente superficial; (2) invertir en claridad no es burocracia, es menos retrabajo; (3) **no es magia, es brief** — en producción gana quien especifica y revisa el brief antes de generar.

## Puntos de Control

- *¿Tu último pedido a la IA incluía contexto de sistema, límites explícitos y criterios de “listo” medibles, o solo la intención en una frase?*
- *Si le pasás tu brief actual a la IA solo con “críticalo antes de código”, ¿qué huecos o ambigüedades anticipás que podría señalar?*
- *Elegí una tarea pequeña real: ¿el título del brief refleja alcance arquitectónico o solo el nombre de una función?*

## Notas Personales

<!-- Observaciones propias, conexiones con otros temas, o ideas que surgieron durante el estudio. -->
