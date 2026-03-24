---
title: "MCP: Concepto y Arquitectura"
week: 2
lesson: 4
tags: [mcp, arquitectura, cliente-servidor, herramientas, stdio, http]
date: 2026-03-23
status: draft
---

# MCP: Concepto y Arquitectura

> MCP es el estandar abierto que permite a agentes de IA conectarse con herramientas y datos externos de forma estructurada, funcionando como un "puerto USB" entre el modelo y el mundo real.

## Objetivos de Aprendizaje

- Entender que problema resuelve MCP y por que un agente sin el esta limitado a codigo local e informacion en contexto.
- Distinguir los roles de cliente y servidor MCP, y como interactuan en el flujo de descubrimiento y ejecucion de herramientas.
- Comparar las dos formas de comunicacion (HTTP vs STDIO) y saber cuando usar cada una.
- Evaluar los trade-offs de MCP (tokens, latencia, mantenimiento) y como mitigarlos.

## Conceptos Clave

- **El problema que resuelve:** Sin MCP, un agente solo puede ejecutar codigo local y usar lo que ya tiene en contexto. Con MCP, puede consultar bases de datos, acceder a APIs externas (Jira, Slack, Google Ads), investigar bugs consultando logs y datos de usuario, todo sin intervencion manual.

- **Arquitectura cliente-servidor:** El **cliente** (Claude, Cursor, ChatGPT) pregunta "que herramientas tenes?" y las invoca. El **servidor** es el adaptador que expone herramientas de un servicio externo (Supabase, GitHub, Chrome), las ejecuta cuando se le pide y devuelve resultados. Cada servidor es especializado en un servicio.

- **Flujo de operacion en 3 pasos:** (1) El cliente descubre herramientas disponibles en el servidor. (2) El cliente elige y ejecuta una herramienta con parametros. (3) El agente procesa el resultado y decide si necesita otra llamada. Este ciclo se repite hasta resolver la tarea.

- **Comunicacion HTTP (hosteado):** El servidor vive en la nube, multiples clientes pueden conectarse simultaneamente. Ideal para produccion. Trade-off: requiere hosting, agrega 100-500ms de latencia por llamada.

- **Comunicacion STDIO (local):** El servidor corre en tu maquina, comunicacion directa por stdin/stdout. Mas ligero, baja latencia, sin dependencias de red. Ideal para desarrollo. Trade-off: solo un cliente a la vez, acoplado a tu maquina.

- **Consumo de tokens:** Cada herramienta expuesta suma tokens al contexto (descripcion, parametros, tipos, ejemplos). Con 50 herramientas, son ~2,500 tokens solo en descripciones. Mitigacion: exponer solo las herramientas relevantes para la tarea actual.

- **Latencia adicional:** MCP es una capa mas entre cliente y servicio externo. El recorrido completo es: Cliente -> MCP -> API externa -> resultado -> MCP -> Cliente. En HTTP hosteado esto puede sumar cientos de milisegundos por llamada.

- **MCP + Skill como combo:** El servidor MCP provee las herramientas, y un skill documenta como usarlas bien: patrones recomendados, ejemplos de uso, errores comunes. Esto acelera el aprendizaje del agente y reduce errores.

## Puntos de Control

- Cual es la diferencia fundamental entre un cliente MCP y un servidor MCP, y que responsabilidad tiene cada uno?
- En que situacion elegirias STDIO sobre HTTP para la comunicacion con un servidor MCP?
- Si tenes 50 herramientas MCP cargadas y tu agente se vuelve lento, cual es la causa probable y como lo mitigarias?

## Notas Personales

<!-- Observaciones propias, conexiones con otros temas, ideas. -->
