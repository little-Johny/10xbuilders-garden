---
title: "Implementación y Lazy Iteration"
week: 1
lesson: 5
tags: [lazy-iteration, implementación, revisión-humana, bug-bash, tdd]
date: 2026-03-19
status: done
---

# Implementación y "Lazy Iteration"

> **Síntesis.** **Lazy iteration** no significa trabajar más despacio: significa ejecutar el plan en **entregas pequeñas y revisables** para que el humano siga validando estructura, supuestos y calidad antes de que el siguiente bloque oculte problemas.

## Introducción

Con un plan ya aprobado, la tentación es pedir «todo de una vez» al modelo. Eso concentra riesgo: errores de diseño aparecen tarde y el coste de corrección sube. La lección propone avanzar por **bloques lógicos** con revisión humana entre bloques, y usar escenarios tipo **bug bash** para observar si el diseño se extiende limpio o degenera en parches.

## Objetivos de aprendizaje

1. Implementar con IA en **bloques lógicos** —por ejemplo base estructural, luego regla de negocio acotada, luego tests— con **pausa y revisión** entre bloque y bloque.
2. Aplicar la regla **simplicidad primero**: rechazar el patrón «un prompt gigante → cientos de líneas» en favor de menos código por paso y más control.
3. Diseñar o interpretar un **bug bash** (requisito sorpresa) para ver si la IA **extiende el diseño** de forma ordenada o cae en **parcheado**, y saber cuándo pedir refactor explícito.

## Marco conceptual

### Qué es lazy iteration en este sentido

**Lazy iteration** parte del plan validado y avanza en pasos donde la IA entrega una porción acotada. Entre pasos, el humano audita nombres, tipos, coherencia con el brief y señales de deuda oculta. El objetivo es encontrar errores de **diseño** temprano y reducir sorpresa acumulada.

### Orden típico de bloques

Un orden habitual es: primero **interfaces, tipos y contratos** —si el modelo falla ahí, conviene corregir antes de seguir—; luego **una estrategia o regla de negocio concreta** (por ejemplo un solo país o caso) para revisar lógica y duplicación; después **tests unitarios** con casos normales, borde y error (monto cero, país no soportado, etc.). Los fallos de tests se corrigen antes de abrir el siguiente bloque.

### Simplicidad y tamaño de respuesta

Muchas líneas en una sola respuesta sacrifican control: estructuras no revisadas, suposiciones incorrectas y debugging difícil. Varias rondas pequeñas con revisión explícita suelen dominar a un monolito generado de una vez.

### Bug bash y señal de parche

Un **bug bash simulado** inyecta un requisito raro —por ejemplo una regla fiscal que depende del día— para observar **cómo** reacciona la IA. Un **refactor limpio** extiende contratos, estrategias o reglas separadas con bajo acoplamiento. Un **parche** muestra `if` sueltos, lógica pegada y duplicación; es señal de pedir **refactor o extracción de reglas** en lugar de aceptar el parche.

### Evidencia y rol del desarrollador

Guardar o versionar cada bloque (o el hilo por fase) ayuda a **volver atrás** si un paso desvía el diseño. El desarrollador pasa de **receptor** de bloques enormes a **revisor activo** del código generado; los cambios imprevistos ponen a prueba si el diseño inicial era realmente extensible.

## Síntesis

Lazy iteration acopla la velocidad del modelo a un **ritmo de validación humana**: el plan ya dijo qué hacer; la implementación lo confirma por entregas, no por volumen de código en un solo mensaje.

## Preguntas de repaso

1. ¿Tu última implementación con IA fue en un solo mensaje largo o en tres entregas con revisión explícita entre medias?
2. Si apareciera el requisito «los martes en California cambia el impuesto», ¿tu diseño actual lo absorbería con una nueva regla o estrategia, o caería en condicionales pegados?
3. Tras el bloque de tipos e interfaces, ¿qué tres cosas mirarías en un minuto antes de autorizar el siguiente bloque?

## Notas Personales

### Separar chat de planificación y de implementación

No implementar en el mismo chat donde se planeó o creó el brief. Usar un chat nuevo para la implementación optimiza la ventana de contexto y evita que el modelo arrastre ruido de la conversación de diseño.

### Bug Bash simulado como prueba de diseño

El Bug Bash simulado consiste en introducir un requisito inesperado a mitad de la implementación para evaluar cómo responde el agente de IA. No se busca que falle, sino observar **cómo** resuelve el cambio: si extiende el diseño de forma limpia (nuevas reglas, estrategias separadas) o si cae en parches frágiles (`if` sueltos, lógica duplicada, condicionales anidados). Es una forma práctica de medir si la arquitectura que se está construyendo es realmente extensible o solo funciona para el caso feliz. Si la respuesta es un parche, es señal de que hay que pedir un refactor antes de seguir avanzando.
