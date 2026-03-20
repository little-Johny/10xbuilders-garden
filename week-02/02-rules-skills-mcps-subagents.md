---
title: "Los 4 Componentes: Reglas, Skills, MCPs, SubAgents"
week: 2
lesson: 2
tags: [reglas, skills, mcps, subagents, arquitectura, sistemas, orquestacion]
date: 2026-03-16
status: in-progress
---

# Los 4 Componentes: Reglas, Skills, MCPs, SubAgents

> Pasar de "promptear" reactivamente a diseñar sistemas autónomos sostenibles, comprendiendo los 4 componentes fundamentales: Reglas, Skills, MCPs y SubAgents.

## Objetivos de Aprendizaje

- Comprender la metáfora del Director Técnico: de microgestionar cada acción a observar y mejorar el sistema
- Diferenciar los 4 componentes arquitectónicos: qué es cada uno, cuándo usarlo y por qué importa
- Entender las dinámicas de trabajo: cómo se cargan y operan en el contexto del agente
- Aplicar principios de decisión: cuándo crear una Regla, un Skill, un MCP o un SubAgent
- Identificar casos de uso reales para cada componente en tu workflow

## Conceptos Clave

- **La cancha (sistema completo):** código fuente donde opera el agente, el DT (vos) que diseña el sistema, la pelota (acciones: leer, escribir, editar, ejecutar) y los jugadores (el agente y sus capacidades).
- **Reglas = Principios de juego:** se cargan SIEMPRE en cada prompt. Se almacenan en `claude.md` o `.cursor/rules`. Ideales para seguridad, estilo de código, principios de diseño. No se negocian.
- **Skills = Jugadas preparadas:** procedimientos reutilizables que le enseñan al agente cómo hacer algo específico. Usan Progressive Disclosure: el agente solo ve nombre + descripción, los detalles se cargan al ejecutar.
- **MCPs = Ojeadores/Data externa:** conexiones a sistemas externos (DBs, APIs, servicios). Full disclosure: el agente ve todas las herramientas disponibles y las llama directamente. No contaminan el contexto principal.
- **SubAgents = Jugadores especiales:** agentes delegados que corren en paralelo o segundo plano para tareas específicas. Tienen su propio scope, no desvían el flujo principal.

## Dinámica Tradicional vs. Esperada

| Aspecto | Tradicional | Esperada |
|---|---|---|
| Enfoque | "Qué hacer paso a paso" | "Mejorar el sistema" |
| Control | Microgestión de cada acción | Observar y ajustar |
| Carga mental | Alta (repetís instrucciones) | Baja (sistema autosustentable) |
| Escalabilidad | No escala | Escala automáticamente |

## Deep Dive: Los 4 Componentes

### 1. Reglas: El Código de Juego

Principios que rigen SIEMPRE tu trabajo con el agente. Se cargan automáticamente en cada sesión.

**Almacenamiento:** `claude.md` (raíz del proyecto) o `.cursor/rules` (Cursor IDE)

**Ejemplo:**
```markdown
# Principios de seguridad
- Nunca ejecutar rm -rf sin confirmación explícita
- Siempre reviewar scripts bash antes de ejecutar
- Verificar permisos de archivo antes de editar
```

**Cuándo usarlas:**
- Tienés un principio que se repite en CADA interacción
- Es un criterio de seguridad o estilo
- Aplica a TODO el proyecto

### 2. Skills: Las Jugadas Ensayadas

Procedimientos reutilizables. Le enseñás al agente cómo hacer algo específico, como un manual de instrucciones guardado.

**Característica clave — Progressive Disclosure:**
- Al agente solo se le muestra nombre + descripción (ahorra tokens)
- Cuando se ejecuta, tiene acceso a los detalles completos

**Ejemplo de estructura:**
```
Nombre: "Generar Reporte Excel"
Descripción: "Crea un reporte formateado en Excel con datos y gráficos"

Detalles (ocultos inicialmente):
- Paso 1: Obtener datos de la fuente
- Paso 2: Transformar y validar
- Paso 3: Aplicar formato
- Paso 4: Insertar gráficos
- Paso 5: Guardar archivo
```

**Cuándo crearlos:**
- Usás el mismo procedimiento >3 veces
- Tiene >5 pasos bien definidos
- Tiene un nombre memorable y claro
- Lo usarás en distintos contextos

### 3. MCPs: Las Conexiones Externas

Model Context Protocol — puertas de conexión a sistemas externos. Permiten que el agente acceda a información sin contaminar tu contexto principal.

**Característica clave — Full Disclosure:** el agente ve TODAS las herramientas disponibles del MCP.

**Flujo típico:**
```
Vos: "Dame los clientes de la última semana"
  ↓
MCP (base de datos) lista herramientas: [get_clients, filter_by_date, export_csv]
  ↓
Agente: Elige get_clients + filter_by_date
  ↓
Respuesta: "Encontré 47 clientes nuevos"
```

**Cuándo crearlos:**
- Necesitás datos de una fuente externa (DB, API)
- Actualmente pedís datos "a mano" y los copiás
- La información es dinámica (cambia frecuentemente)
- Querés que el agente acceda directamente sin tu intervención

### 4. SubAgents: Los Especialistas

Agentes delegados que corren en paralelo o segundo plano para tareas específicas sin desviarte del flujo principal.

**Flujo típico:**
```
Tarea principal: Desarrollar nueva feature
  ↓
SubAgent (en paralelo): Revisar código de seguridad
SubAgent (en paralelo): Validar pruebas unitarias
SubAgent (en paralelo): Revisar documentación
  ↓
Reportes llegan cuando terminás la feature
```

**Cuándo crearlos:**
- Tenés validaciones/checks que se repiten pero desvían el flujo
- Necesitás ejecutar tareas en paralelo
- La tarea es "secundaria" pero importante (testing, review)
- Querés especialización sin aumentar contexto

## Matriz de Decisión Rápida

| Necesidad | Componente | Razón |
|---|---|---|
| Seguridad, principios recurrentes | **Regla** | Se aplica siempre, automáticamente |
| Procedimiento >3 veces, bien definido | **Skill** | Reduce complejidad, reutilizable |
| Datos externos, APIs, DBs | **MCP** | Acceso sin contaminar contexto |
| Validación/review paralelo, especializado | **SubAgent** | Delegación sin desviar flujo |

## Puntos de Control

- *¿Qué instrucciones le repetís al agente en cada sesión? → Candidatas a Regla*
- *¿Qué procedimientos hacés manualmente más de 3 veces? → Candidatos a Skill*
- *¿Qué datos copiás a mano de fuentes externas? → Candidatos a MCP*
- *¿Qué tareas secundarias te desvían del flujo principal? → Candidatas a SubAgent*

## Notas Personales

<!-- Observaciones propias, conexiones con otros temas, ideas. -->
