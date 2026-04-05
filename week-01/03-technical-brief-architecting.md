---
title: "El Arte del Technical Brief (Architecting)"
week: 1
lesson: 3
tags: [technical-brief, contexto, architecting, definition-of-done, constraints]
date: 2026-03-19
status: done
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

El **Technical Brief** es un documento corto que fija alcance antes de codificar. Se compone de cinco secciones obligatorias:

1. **Título:** encaja el alcance en una frase con intención clara. No es el nombre de una función, sino una declaración de qué se va a resolver.
2. **Contexto:** explica por qué existe el problema y qué parte del sistema toca. Corta suposiciones del modelo antes de que las invente.
3. **Requerimientos técnicos:** concretan stack, patrones, entradas y salidas, contratos y tipos. Pasan de intención a algo que se puede verificar.
4. **Restricciones:** listan qué no hacer, estándares, herramientas de test o lint y casos borde esperados. Frenan dependencias inventadas y atajos.
5. **Definition of Done:** fija criterios verificables —lint, cobertura, documentación pública— de modo que el éxito se mida con evidencia, no con «parece que anda».

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

La clase propone usar un technical brief a la hora de desarrollar tareas que requieran mucho contexto previo. Con el brief podemos dar más contexto, delimitar el alcance de la tarea y agregar restricciones, lo cual produce un resultado de mayor calidad que solo solicitar un feature, un fix o una nueva implementación.

**Evaluar antes de ejecutar:**
Se recomienda evaluar el brief con una IA para poder encontrar vacíos argumentales y mejorar la primera versión. Entre más claro sea, mejor será el resultado.
