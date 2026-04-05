---
title: "Aprendizajes — primera semana (10x Builders)"
week: 1
lesson: 0
tags: [reflexión, semana-1]
date: 2026-03-17
status: done
---

# Aprendizajes — primera semana (10x Builders)

> **Síntesis.** Este espacio recoge una **reflexión personal** al cerrar la primera semana: qué ideas quedaron instaladas, qué prácticas querés mantener y qué preguntas seguís arrastrando. Completarlo ayuda a anclar el curso en tu contexto real, no solo en el temario.

## Introducción

Las lecciones de la semana 1 recorren mindset (copiloto pasivo), ciclo **BPIR**, **Technical Brief**, planificación, implementación por bloques y auditoría. Este documento no resume el programa: es un **diario breve** para sintetizar *tu* lectura del material y de la práctica.

## Objetivos de aprendizaje

1. Redactar, al terminar la semana, un **balance** en prosa: qué entendiste mejor, qué te costó y qué vas a probar en el proyecto.
2. Conectar al menos **una idea** de las notas con una situación concreta de trabajo o estudio.

## Marco conceptual

### Para qué sirve esta reflexión

Separar **contenido del curso** de **apropiación personal** reduce la sensación de haber «visto videos» sin cambio de hábito. Una reflexión corta obliga a nombrar acciones: por ejemplo «de ahora en más, no pido código sin plan escrito» o «voy a probar la checklist de auditoría en el próximo PR».

### Qué podés incluir

Podés desarrollar un párrafo sobre el tema que más te haya movido el piso (brief, plan, lazy iteration, auditoría). Otro párrafo puede listar mentalmente **compromisos** para la semana siguiente —sin exigirte un manifiesto largo. Si preferís, respondé en prosa a: ¿qué harías distinto la próxima semana con IA en un proyecto real?

## Síntesis

Cerrar la semana con un texto propio —aunque sea medio folio— es un **acto de cierre** tan válido como repasar definiciones: fija prioridades y deja rastro para releer dentro de un mes.

## Preguntas de repaso

1. ¿Cuál fue el concepto de la semana 1 que más chocó con cómo venías usando la IA hasta ahora?
2. ¿Qué práctica del BPIR (brief, plan, implementación, review) vas a reforzar primero, y por qué esa y no otra?

## Notas Personales

### El entregable de la semana

El objetivo de esta semana no fue solo aprender conceptos, sino producir **herramientas reutilizables** que queden en el repositorio. La idea es que cada nueva tarea con IA comience desde un sistema probado, no desde cero. Esto aumenta la consistencia en cómo se delega trabajo, reduce errores en código generado y mejora la calidad del resultado final.

Los dos artefactos entregables son:

1. **Plantilla Maestra de Briefs** — un archivo `.md` que funciona como molde reutilizable. No contiene una tarea específica; se copia y se completa cada vez. Sus secciones mínimas son: título, contexto, requerimientos técnicos, constraints y Definition of Done. Cada una cumple un rol concreto:
   - **Contexto** describe el sistema actual, el problema y el objetivo, para que la IA no genere soluciones genéricas.
   - **Requerimientos técnicos** delimitan stack, patrones, entradas/salidas e integraciones.
   - **Constraints** listan lo que no se debe hacer y los estándares a respetar (type hints, tests, linter, librerías permitidas).
   - **Definition of Done** fija criterios verificables (tests que pasan, métricas, formato de salida) para que "listo" sea medible.

2. **Protocolo de Review** — una checklist de puntos críticos que se revisan antes de hacer commit. Cubre: alucinaciones de librerías (imports que no existen), lógica de negocio (floats para dinero, redondeos, edge cases), seguridad (inyección SQL, inputs sin validar, credenciales expuestas), pérdida de contexto (constraints ignorados, deriva del brief) y un quinto punto personalizable según el stack del proyecto.

### Solución implementada

Ambos artefactos están en la carpeta `ia-tools/01-planning/` del repositorio:

```
ia-tools/
 └── 01-planning/
     ├── master-technical-brief.md
     └── master-protocol-preview.md
```

La plantilla de brief incluye secciones opcionales para alcance, arquitectura, contratos de datos, riesgos y referencias. El protocolo de review tiene tres niveles (rápido, estándar y profundo) que se escalan según el riesgo de la tarea.
