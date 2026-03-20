---
title: "Code Review Forense (Auditing)"
week: 1
lesson: 6
tags: [auditing, code-review, checklist, seguridad, bpir, alucinaciones]
date: 2026-03-19
status: draft
---

# Code Review Forense (Auditing)

> El cierre del trabajo con IA no es “compila y commit”: es **auditar con protocolo** (checklist + ejecución hostil en sandbox) para que el entregable aguante lógica sutil, límites y riesgos que el modelo no validó por vos.

## Objetivos de Aprendizaje

- Explicar por qué hay que actuar como **auditor escéptico** frente al código generado y contrastar siempre con **brief y plan**, no solo con la última respuesta del chat.
- Armar y usar una **checklist repetible** con al menos cinco ejes: dependencias/APIs reales, lógica de negocio y bordes, seguridad, **deriva de contexto** respecto al brief/plan, y un quinto criterio **específico del stack** (tests, linter, ruido en logs, dependencias de más, etc.).
- **Documentar** hallazgos (OK / riesgo bajo / corregir), **romper** el código en entorno aislado con entradas límite y, si no salta nada obvio, pedir a la IA una **autoevaluación guiada** con la misma checklist.

## Conceptos Clave

- **Optimismo del modelo:** la IA suele asumir coherencia sin demostrarla; el rol del dev pasa a **verificar** cumplimiento del brief, escenarios y riesgos antes de producción.
- **Checklist forense (ejes):** (1) **Alucinaciones técnicas** — imports inventados, APIs que no existen, versiones imposibles; (2) **Lógica de negocio** — floats y redondeos en dinero, condiciones incompletas, negativos, conversiones, topes; (3) **Seguridad** — SQL/command injection, secretos en código, validación de entrada, exposición en logs, superficies sin auth según aplique; (4) **Contexto / ventana** — requisitos del brief o el plan ignorados, tipos o constraints alterados “por el camino”; (5) **Quinto eje propio** — lo que tu repo exige (¿tests que tocan el código nuevo?, ¿lint ignorado?, etc.).
- **Aplicación = evidencia:** recorrer la checklist y anotar por ítem estado breve (**OK**, **riesgo bajo**, **corregir: …**). Eso convierte la revisión en **registro auditable**, no en una mirada vaga.
- **Romper en sandbox:** la auditoría no termina en lectura; forzar **montos cero, países inválidos, decimales extremos, tipos equivocados, negativos**, etc., en branch o entorno aislado; documentar fallo, arreglo y si la IA ayudó.
- **Si “no encuentro nada”:** encargar a la modelo una **revisión paso a paso con tu checklist**; el razonamiento explícito a menudo saca inconsistencias que una pasada rápida no vio.
- **Cierre del BPIR:** Brief → Plan → Implementación → **Review**: la IA implementa, el humano **audita**; sin esta fase el ciclo queda incompleto para código que deba ser confiable.

## Puntos de Control

- *¿Tu último merge de código “hecho con IA” contrastó explícitamente brief + plan, o solo confiaste en que la última versión “tenía pinta de bien”?*
- *De los cinco ejes, ¿cuál suele ser el más débil en tu proyecto real (p. ej. dinero con float, seguridad, drift del brief)?*
- *¿Qué tres entradas “maliciosas” o límite probarías mañana en sandbox sobre el servicio de impuestos de la práctica?*

## Notas Personales

<!-- Observaciones propias, conexiones con otros temas, o ideas que surgieron durante el estudio. -->
