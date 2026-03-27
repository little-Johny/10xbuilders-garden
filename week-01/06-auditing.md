---
title: "Code Review Forense (Auditing)"
week: 1
lesson: 6
tags: [auditing, code-review, checklist, seguridad, bpir, alucinaciones]
date: 2026-03-19
status: draft
---

# Code Review Forense (Auditing)

> **Síntesis.** El cierre del trabajo con IA no es «compila y listo»: es **auditar con protocolo** —checklist más ejecución hostil en entorno aislado— para que el entregable resista lógica sutil, límites del brief y riesgos que el modelo no validó por sí solo.

## Introducción

Los modelos optimizan coherencia superficial; el desarrollador debe actuar como **auditor escéptico**. La revisión contrasta el código con **brief y plan**, no solo con la última respuesta del chat. La lección propone una **checklist repetible**, registro de hallazgos y pruebas en sandbox; si nada obvio falla, una **autoevaluación guiada** del modelo con la misma checklist puede sacar inconsistencias que una lectura rápida no ve.

## Objetivos de aprendizaje

1. Explicar por qué hay que actuar como **auditor escéptico** y contrastar siempre con **brief y plan**, no solo con la última salida del asistente.
2. Armar y usar una **checklist repetible** con al menos cinco ejes: dependencias y APIs reales, lógica de negocio y bordes, seguridad, **deriva de contexto** respecto al brief o plan, y un quinto criterio **propio del stack** (tests, linter, ruido en logs, dependencias de más, etc.).
3. **Documentar** hallazgos (por ejemplo OK, riesgo bajo, corregir), **romper** el código en entorno aislado con entradas límite y, si hace falta, pedir a la IA una **autoevaluación guiada** con la misma checklist.

## Marco conceptual

### Optimismo del modelo

La IA suele asumir coherencia sin demostrarla. El rol del desarrollador en la fase de auditoría es **verificar** cumplimiento del brief, escenarios borde y riesgos antes de exponer el cambio a producción o a integración crítica.

### Ejes de una checklist forense

Un esquema útil recorre al menos lo siguiente. **Alucinaciones técnicas**: imports inventados, APIs inexistentes, versiones imposibles. **Lógica de negocio**: dinero y floats, redondeos, condiciones incompletas, negativos, conversiones y topes. **Seguridad**: inyección en SQL o comandos, secretos en código, validación de entrada, exposición en logs, superficies sin autenticación cuando el brief lo exige. **Contexto y deriva**: requisitos del brief o del plan ignorados, tipos o restricciones alterados «por el camino». **Quinto eje propio**: lo que el repo exige —¿hay tests que cubran el código nuevo?, ¿se ignoró el lint?, etc.

### Aplicación con evidencia

Recorrer la checklist y anotar por ítem un estado breve —**OK**, **riesgo bajo**, **corregir: …**— convierte la revisión en **registro auditable**, no en una impresión vaga.

### Romper en sandbox y cierre del BPIR

La auditoría no termina en lectura: conviene forzar en rama o entorno aislado **montos cero, países inválidos, decimales extremos, tipos equivocados, negativos**, y documentar fallo, arreglo y si la IA ayudó a diagnosticar. Si «no se encuentra nada», encargar al modelo una **revisión paso a paso con tu checklist** suele hacer explícito el razonamiento y sacar inconsistencias.

Sin esta fase, el ciclo **Brief → Plan → Implementación → Review** queda incompleto para código que deba ser confiable: la IA implementa, el humano **audita**.

## Síntesis

La auditoría forense cierra el BPIR con **criterios de ingeniería**: el modelo propone, el humano demuestra que el entregable cumple el contrato y resiste hostilidad razonable.

## Preguntas de repaso

1. ¿Tu último merge de código «hecho con IA» contrastó explícitamente brief y plan, o confiaste en que la última versión «tenía pinta de bien»?
2. De los cinco ejes, ¿cuál suele ser el más débil en tu proyecto real (por ejemplo dinero con float, seguridad, deriva del brief)?
3. ¿Qué tres entradas límite o «maliciosas» probarías mañana en sandbox sobre el servicio de impuestos de la práctica?

## Notas Personales

<!-- Observaciones propias, conexiones con otros temas, o ideas que surgieron durante el estudio. -->
