---
title: "MCP: Concepto y Arquitectura"
week: 2
lesson: 4
tags: [mcp, arquitectura, cliente-servidor, herramientas, stdio, http]
date: 2026-03-23
status: done
---

# MCP: Concepto y Arquitectura

> **Síntesis.** **MCP** (Model Context Protocol) es un estándar abierto que permite a los agentes de IA conectarse a **herramientas y datos externos** de forma estructurada, como un puerto común entre el modelo y sistemas que viven fuera del repo.

## Introducción

Sin un protocolo como MCP, un asistente queda limitado a lo que puede leer y ejecutar **localmente** y a lo que el usuario pega en el chat. Con MCP, el mismo agente puede consultar bases de datos, APIs corporativas, herramientas de issue tracking o investigar incidentes con datos reales, siempre que exista un **servidor MCP** que adapte ese sistema al contrato del protocolo. La lección separa los roles de **cliente** y **servidor**, describe el flujo de descubrimiento y ejecución de herramientas, y compara transportes **HTTP** y **STDIO**, además de los trade-offs de tokens y latencia.

## Objetivos de aprendizaje

1. Explicar **qué problema** resuelve MCP y por qué un agente sin integraciones estructuradas está acotado al código local y al contexto manual.
2. Distinguir **cliente** y **servidor** MCP y describir cómo interactúan en el descubrimiento y la invocación de herramientas.
3. Comparar comunicación **HTTP** (hosteada) frente a **STDIO** (local) y saber en qué situaciones favorece cada una.
4. Evaluar **trade-offs**: consumo de tokens, latencia, mantenimiento del servidor y mitigaciones (por ejemplo exponer solo herramientas relevantes).

## Marco conceptual

### Problema que resuelve

Sin MCP, el flujo típico es copiar datos a mano o escribir *glue* ad hoc. Con MCP, el agente invoca **herramientas** con parámetros tipados y recibe resultados que pueden alimentar el siguiente paso del razonamiento. Eso habilita flujos como consultar una base, listar issues o disparar acciones en un servicio, **sin** que cada integración reinvente un formato distinto.

### Arquitectura cliente-servidor

El **cliente** (por ejemplo el IDE o el runtime del agente) pregunta qué herramientas expone un servidor y las invoca con argumentos. El **servidor MCP** es el adaptador: traduce el protocolo a llamadas concretas al sistema externo (Supabase, GitHub, navegador, etc.) y devuelve resultados normalizados. Cada servidor suele estar **especializado** en un servicio o familia de operaciones.

### Flujo típico en tres movimientos

Primero el cliente **descubre** las herramientas disponibles en el servidor. Luego **elige y ejecuta** una herramienta con parámetros acordes al esquema. Después el agente **interpreta** el resultado y decide si necesita otra llamada. Ese ciclo se repite hasta cerrar la tarea o hasta topar límites de política.

### HTTP frente a STDIO

Un servidor **HTTP** vive en red: puede atender varios clientes y suele usarse cuando el servicio ya está hosteado o compartido. El coste típico incluye **latencia de red** adicional —del orden de cientos de milisegundos por ida y vuelta según topología— y requisitos de despliegue. Un servidor **STDIO** corre **localmente** y habla por entrada y salida estándar con el proceso cliente: suele ser más **liviano** en latencia y más simple para desarrollo, a cambio de acoplarse a la máquina local y, en general, a un cliente a la vez en esa configuración.

### Tokens, latencia y combo con skills

Cada herramienta expuesta consume **tokens** en el cliente —descripciones, parámetros, tipos, ejemplos—. Con muchas herramientas cargadas a la vez, solo el catálogo puede ocupar miles de tokens; una mitigación es **exponer solo** lo necesario para la tarea. La latencia total incluye cliente → MCP → API externa → vuelta. Por eso a menudo se combina un **servidor MCP** (herramientas) con un **skill** (cómo usarlas bien: patrones, errores frecuentes, ejemplos), de modo que el agente aprende más rápido y comete menos fallos en la invocación.

## Síntesis

MCP estandariza **cómo** se descubren y ejecutan capacidades externas; el cliente y el servidor tienen roles claros; el transporte elige un compromiso entre **despliegue** y **latencia**. El diseño consciente del catálogo de herramientas y la documentación en skills reduce fricción y coste de contexto.

## Preguntas de repaso

1. ¿Cuál es la diferencia fundamental entre un **cliente** MCP y un **servidor** MCP, y qué responsabilidad tiene cada uno?
2. ¿En qué situación elegirías **STDIO** sobre **HTTP** para comunicarte con un servidor MCP?
3. Si tenés muchas herramientas MCP cargadas y el agente se vuelve lento o costoso, ¿cuál es una causa probable y cómo la mitigarías?

