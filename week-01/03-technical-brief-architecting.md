---
title: "El Arte del Technical Brief (Architecting)"
week: 1
lesson: 3
tags: [technical-brief, contexto, architecting, definition-of-done, constraints]
date: 2026-03-19
status: draft
---

# El Arte del "Technical Brief" (Architecting)

> **Síntesis.** La calidad del código que devuelve la IA sigue a la calidad del **contexto**: un **Technical Brief** bien armado acota el espacio de soluciones y reduce alucinaciones; un pedido vago produce código de demostración, no software que deba convivir con un sistema real.

## Introducción

El cuello de botella rara vez es «el modelo» en abstracto: es la **ventana de contexto** y la **especificación**. La lección propone el brief como instrumento de **architecting** previo a escribir código, y un mantra práctico: **contexto sólido → código más útil**.

## Objetivos de aprendizaje

1. Explicar por qué el límite práctico suele ser el contexto y adoptar el mantra **contexto sólido → código más útil**.
2. Completar un Technical Brief con las cinco secciones obligatorias —título, contexto, requerimientos técnicos, restricciones, Definition of Done— para una tarea concreta.
3. Aplicar el flujo **brief → crítica por IA (sin código) → iteración del brief → recién después plan o implementación**, usando la IA primero como revisor de diseño.

## Marco conceptual

### De «pedir código» a «dirigir implementación»

La formulación importa. Pedir «una función de impuestos» obliga al modelo a adivinar reglas de negocio y acoplamientos. Describir el problema real —por ejemplo lógica fiscal acoplada a un carrito legacy, necesidad de un servicio desacoplado y extensible— alinea la solución con mantenimiento y arquitectura. El brief es el puente entre intención vaga y **especificación operativa**.

### Las cinco secciones del Technical Brief

El **Technical Brief** es un documento corto que fija alcance antes de codificar. El **título** debe encajar el alcance en una frase con intención clara. El **contexto** explica por qué existe el problema y qué parte del sistema toca, para cortar suposiciones. Los **requerimientos técnicos** concretan stack, patrones, entradas y salidas, contratos y tipos: pasan de intención a algo que se puede verificar. Las **restricciones** listan qué no hacer, estándares, herramientas de test o lint y casos borde esperados; frenan dependencias inventadas y atajos. La **Definition of Done** fija criterios verificables —lint, cobertura, documentación pública— de modo que el éxito se mida con evidencia, no con «parece que anda».

### Flujo de trabajo con crítica previa

El flujo recomendado es elegir un escenario real o de práctica, redactar el brief completo y **no pedir código todavía**: entregar el brief y pedir **crítica** —qué falta, qué es ambiguo, qué restricción sumar—, incorporar el feedback y solo entonces pasar a planificación o implementación. Saltarse la crítica suele dar una primera versión aparentemente aceptable pero frágil ante borde y evolución.

### Ideas transversales

Un prompt de una línea suele mapear a una solución mentalmente superficial. Invertir en claridad no es burocracia gratuita: es menos retrabajo. En entornos exigentes, **no es magia, es brief**: quien especifica y revisa el brief antes de generar suele ganar en consistencia.

## Síntesis

El brief es el **instrumento de arquitectura** más barato: obliga a explicitar supuestos antes de que existan archivos y permite usar la IA como crítico de diseño antes de usarla como generador.

## Preguntas de repaso

1. ¿Tu último pedido a la IA incluía contexto de sistema, límites explícitos y criterios de «listo» medibles, o solo la intención en una frase?
2. Si le pasás tu brief actual a la IA solo con «críticalo antes de código», ¿qué huecos o ambigüedades anticipás que podría señalar?
3. Elegí una tarea pequeña real: ¿el título del brief refleja alcance arquitectónico o solo el nombre de una función?

## Notas Personales

<!-- Observaciones propias, conexiones con otros temas, o ideas que surgieron durante el estudio. -->
