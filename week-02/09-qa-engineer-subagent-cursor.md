---
title: "Crear e integrar un SubAgent de QA Engineer"
week: 2
lesson: 9
tags: [subagents, qa, cursor, testing, delegación, agent-browser, rules]
date: 2026-03-26
status: done
---

# Crear e integrar un SubAgent de QA Engineer

> **Síntesis.** Un **subagente de QA Engineer** concentra en un hilo aparte la verificación después de cada cambio: ejecuta pruebas unitarias y de integración, acumula **evidencia** (por ejemplo capturas) y devuelve un **informe** al flujo principal. Integrarlo exige definir bien el agente, **reescribir las reglas de trabajo** para delegar el testing y **iterar** cuando el QA hace de más o de menos.

## Introducción

Hasta aquí el curso separó conceptualmente el contexto del hilo principal y el de los subagentes. Esta clase lo baja a **Cursor**: se crea un subagente especializado en QA, se conecta con la «forma de trabajo» del repo (reglas siempre aplicadas) y se ajusta el comportamiento cuando el primer intento sobrepueba o no acota bien los casos. El material de práctica del repositorio del curso puede seguirse en el tag **`v2.9-subagent-qa`** (`git checkout v2.9-subagent-qa`).

## Objetivos de aprendizaje

1. Crear un subagente de tipo **QA Engineer** con el flujo de creación de agentes en Cursor (por ejemplo **Create Subagents**) y ubicar la **definición** en el árbol del proyecto (p. ej. bajo `.cursor/agents/`).
2. Entender qué campos definen al subagente —**nombre**, **descripción**, **modelo**— y por qué los dos primeros gobiernan **cuándo** el agente principal lo invoca.
3. **Modificar las reglas de forma de trabajo** para que la verificación deje de ser responsabilidad implícita del hilo principal y pase a estar **delegada** al subagente QA.
4. **Iterar** reglas y definición del subagente para acotar qué pruebas corre (por ejemplo pasando **casos de prueba explícitos** desde el principal y evitando suites desmesuradas).

## Marco conceptual

### Rol del subagente QA Engineer

Un **subagente de QA Engineer** tiene como foco la **calidad después del cambio**: tras implementar un feature o un fix, ejecuta pruebas **sanitarias** y de **integración** según lo que el flujo le encargue. Corre en **conversación separada**, de modo que comandos, salida de tests, navegador y generación de informes no inflan el hilo donde se diseña e implementa. El objetivo es pasar de un QA manual y disperso a un proceso **repetible** y **delegado**.

### Definición del agente: nombre, descripción y modelo

En entornos como Cursor, la creación guiada genera un archivo de definición (por convención algo como `.cursor/agents/qa-engineer.md` o equivalente según versión). Ahí importan sobre todo el **nombre** y la **descripción**: el **agente principal** decide si invoca al subagente leyendo esos campos, no el detalle interno de cada política. Una descripción clara —por ejemplo que debe actuar **tras** implementaciones o cambios de código, ejecutar tests y entregar un **reporte**— reduce llamadas omitidas o fuera de lugar. El **modelo** fija capacidad y coste: para ejecutar tests y seguir instrucciones acotadas no siempre hace falta el modelo más grande; es un trade-off concreto.

### Delegación vía reglas de «forma de trabajo»

Crear el archivo del subagente no alcanza. Hay que **actualizar las reglas** que gobiernan el trabajo cotidiano —la «forma de trabajo» o *always applied rules*— para que el hilo principal **ya no** asuma por defecto correr toda la batería de pruebas, sino que, al cerrar una entrega de código, **indique** o **dispare** al QA Engineer. Es el mismo principio que en otras lecciones: cambiar las **reglas del juego** para que el nuevo rol tenga cancha. Sin ese paso, el subagente existe pero el flujo sigue como antes.

### Hilo aislado y carpeta de evidencia

El subagente opera en un **contexto propio**: allí ocurren ejecución de tests, apertura del navegador para integración, capturas y redacción del informe. En la práctica del curso se usa una carpeta tipo **QA Evidence** (o nombre equivalente) donde se guardan **capturas por paso** o por caso, de forma que el resultado sea **auditable** sin reconstruir la sesión. Eso conecta con la idea de «otra dimensión»: el principal recibe un **resumen** y rutas a evidencia, no todo el ruido intermedio.

### Informe como entregable

El subagente no solo devuelve «pasó / falló»: conviene un **informe estructurado**: qué tests unitarios corrieron y su estado, qué pruebas de integración se hicieron con evidencia visual, **motivos** de fallo cuando los hay, y una **lectura** prudente (por ejemplo si el cambio parece listo para integración o merge). Eso formaliza el QA frente a mirar la consola a medias.

### Iteración: evitar sobre‑prueba y sub‑prueba

El primer diseño suele ser imperfecto: el QA puede ejecutar **más** pruebas de las necesarias para el cambio concreto (por ejemplo regresiones amplias no pedidas). La respuesta es **iterar**: endurecer las reglas para que el **principal** pase una **lista explícita de casos** o alcance al subagente, y ajustar la definición del subagente para que **solo** ejecute lo recibido o lo acordado. Simétricamente, si queda corto, se amplía la descripción o los criterios de invocación.

### Otros subagentes y límites

Además del QA, en el material se menciona el **code review** como otro subagente frecuente. La regla general: tareas **repetidas**, que **desvían** el hilo principal y que admiten **contexto aislado** son candidatas. Conviene no multiplicar subagentes sin necesidad: cada uno es un contrato de mantenimiento (reglas, descripción, modelo).

## Síntesis

Integrar un QA Engineer es un ciclo **crear → enlazar reglas → delegar → iterar**: la definición nombra y describe el rol; las reglas transfieren la responsabilidad de verificación; la ejecución aislada preserva el hilo de desarrollo; la iteración alinea el alcance de pruebas con el cambio real. El salto pedagógico es el mismo que en el rol de director técnico: **diseñar el sistema** de verificación, no solo correr tests a mano en cada feature.

## Preguntas de repaso

1. ¿Por qué el **nombre** y la **descripción** del subagente pesan más que el modelo al decidir si se usa bien en el día a día?
2. ¿Qué cambio mínimo en las reglas de «forma de trabajo» separa «el principal corre todo» de «el principal delega en QA tras cada entrega»?
3. Si el subagente QA ejecuta demasiadas pruebas no relacionadas con el feature, ¿qué dos palancas ajustarías (reglas del principal vs. definición del subagente)?

## Notas Personales

En la práctica del curso conectamos la teoría de **delegación y contexto fresco** con dos **subagents** definidos en el `twitter-clon`: uno para **verificación** después de implementar y otro para **documentación** sin tocar código. Ambos viven en `projects/twitter-clon/.cursor/agents/` y el agente principal los invoca con una tarea acotada; ellos devuelven **informe resumido** al hilo principal, en línea con lo que describe el marco conceptual de la lección anterior.

### `qa-engineer`

- **Archivo:** [`projects/twitter-clon/.cursor/agents/qa-engineer.md`](../projects/twitter-clon/.cursor/agents/qa-engineer.md)
- **Rol:** Especialista en **QA post-cambio**: ejecuta `npm test` (Jest en `app/` y `api/`) y, cuando el cambio toca UI o flujos web, prueba en navegador con **agent-browser** siguiendo el skill [`executing-browser`](../projects/twitter-clon/.cursor/skills/executing-browser/SKILL.md).
- **Salida esperada:** Informe con casos (éxito/fallo), fragmentos de log útiles y **screenshots** como evidencia; si falta herramienta o puerto, lo declara explícitamente.
- **Cuándo conviene:** Tras una feature o cuando el usuario pida validación, regresión o «¿pasó QA?» —mantiene fuera del hilo principal el detalle de cada comando y captura.

### `project-documenter`

- **Archivo:** [`projects/twitter-clon/.cursor/agents/project-documenter.md`](../projects/twitter-clon/.cursor/agents/project-documenter.md)
- **Rol:** **Documentador técnico** con responsabilidad distinta a QA y a code review: analiza el repo (lectura) y **escribe o actualiza** documentación persistente en español —`README.md`, `docs/TIMELINE.md`, `docs/LEARNING_MAP.md`, u otros Markdown bajo `docs/` (templates de clase, guías, checklists). **No modifica código fuente** de aplicación.
- **Modos:** (A) mantenimiento de la documentación estándar del proyecto; (B) documentos personalizados bajo `docs/` con plantillas reutilizables.
- **Cuándo conviene:** Cuando haya que **sincronizar** la historia del proyecto con el código, preparar material de curso o dejar constancia sin mezclar esa tarea con el hilo de implementación.

### Cómo se complementan

| Subagent | Evita en el hilo principal | Entrega típica al principal |
|----------|-----------------------------|-----------------------------|
| **qa-engineer** | Logs largos de Jest, rutas de screenshots, iteraciones de agent-browser | Veredicto + lista de casos + evidencia mínima |
| **project-documenter** | Barridos del repo solo para redactar `docs/` | Resumen de qué archivos se crearon o actualizaron y dónde |

Ambos encajan en el patrón de la lección anterior: **contexto aislado**, **entrada clara** y **salida agregada** para que el chat donde se diseña el producto no arrastre el detalle operativo de cada rol.
