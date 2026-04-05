---
title: "Planificación y Negociación (The Planner)"
week: 1
lesson: 4
tags: [planificación, the-planner, brief, arquitectura, negociación]
date: 2026-03-19
status: done
---

# Planificación y Negociación (The Planner)

> **Síntesis.** Antes de que la IA escriba código, conviene contar con un **plan auditable** en lenguaje natural: corregir la estrategia ahí cuesta poco; reparar código mal encaminado puede costar órdenes de magnitud más.

## Introducción

La fase de planificación es el lugar **barato** para detectar rutas imposibles, imports inexistentes o violaciones de restricciones del brief. Si se salta y el modelo entra directo en implementación, aparecen módulos innecesarios, capas mezcladas y deuda evitable. La lección describe cómo pedir **solo un plan**, revisarlo como auditor de arquitectura y **negociar** ajustes antes de codificar.

## Objetivos de aprendizaje

1. Pedir y obtener **únicamente un plan** —pasos, archivos a crear o modificar y lógica en prosa— a partir de un Technical Brief, sin deslizarse a implementación prematura.
2. Revisar un plan como **auditor de arquitectura**: rutas y nombres, dependencias e imports, orden lógico (contratos antes que implementación, integración y tests al final) y respeto a las restricciones del brief.
3. **Negociar** cambios con instrucciones explícitas (qué archivo no tocar, qué alternativa usar) y dejar **constancia del plan aprobado** antes de implementar.

## Marco conceptual

### Implementación prematura

Si la IA arranca en código, suele inventar módulos, romper imports o ignorar límites del proyecto. Un plan previo permite leer la lógica y fallas **estructurales** en minutos, no en diffs enormes.

### Cómo pedir el plan

El **prompt de planificación** debe anclar el brief y exigir un plan paso a paso **sin código**: qué archivos se crean, cuáles se modifican y por qué, con la lógica de cada parte en prosa. Si aparece código, conviene cortar con una instrucción del tipo «solo el plan, sin código».

> **Ejemplo de prompt:**
> *"A partir del siguiente Technical Brief, generá únicamente un plan de implementación paso a paso. No escribas código. Para cada paso indicá: qué archivo se crea o modifica, por qué, y la lógica en prosa. Respetá las restricciones del brief."*

### Checklist humana sobre el plan

Al revisar, conviene mirar en primer lugar **archivos y rutas** frente a las convenciones del repositorio; luego **dependencias e imports** —¿existen y eran compatibles con el brief?—; después el **orden lógico** —primero contratos y tipos, luego núcleo, después cableado y pruebas—; por último las **restricciones** —¿se proponen cambios en zonas prohibidas o sensibles?—.

| ✅ | Verificar | Pregunta clave |
|---|-----------|----------------|
| ⬜ | **Archivos y rutas** | ¿Siguen las convenciones del repositorio? ¿Los nombres son consistentes? |
| ⬜ | **Dependencias e imports** | ¿Existen realmente? ¿Son compatibles con lo que pide el brief? |
| ⬜ | **Orden lógico** | ¿Primero contratos y tipos, luego núcleo, después cableado y pruebas? |
| ⬜ | **Restricciones del brief** | ¿Se proponen cambios en zonas prohibidas o sensibles? |
| ⬜ | **Alcance** | ¿El plan resuelve lo que pide el brief, sin agregar cosas que nadie pidió? |

### Negociación y registro

La negociación en fase Plan es el lugar idóneo para corregir: por ejemplo pedir un adaptador nuevo en lugar de tocar un módulo delicado. Cuando el plan está alineado, conviene **guardarlo** en un archivo (por ejemplo `plan-implementacion-*.md`) como contrato para la implementación siguiente. El rol humano no es escribir todo el plan a mano, sino **evaluar, corregir y aprobar** la propuesta del modelo: detectar alucinaciones en prosa sigue siendo mucho más rápido que en código.

## Síntesis

**The Planner** no es una herramienta aparte: es la **disciplina** de no aceptar código hasta tener un plan revisado, negociado y documentado que el brief habría aprobado en términos de alcance y límites.

## Preguntas de repaso

1. ¿La última vez que pediste código a la IA, habías leído y aprobado un plan con archivos y orden explícitos?
2. Mirando un plan hipotético, ¿qué dependencia o ruta revisarías primero para detectar alucinaciones?
3. ¿Hay algún archivo o capa en tu proyecto que deberías declarar como «no tocar» en el brief o negociar así en el plan antes de implementar?

## Notas Personales

### Iterar hasta que sea seguro implementar

La clave no es generar un plan y aceptarlo. Es revisarlo, corregirlo y repetir hasta que sea seguro pasar a código. Cada escalón filtra errores antes de que se conviertan en deuda técnica.

```
Brief
 └──▶ Plan
       └──▶ Review humano
             └──▶ Negociación
                   └──▶ Plan aprobado → Implementación
```

