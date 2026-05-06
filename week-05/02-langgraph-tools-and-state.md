---
title: "Herramientas y Estado en LangGraph"
week: 5
lesson: 2
tags: [langgraph, tools, state, config, mcp, cursor, supabase, catalog, adapters, seguridad, contexto, json-schema]
date: 2026-05-03
status: draft
---

# Herramientas y Estado en LangGraph

> **Síntesis.** En LangGraph, el agente vive dentro de un **grafo de nodos** que comparten un **estado** efímero —la memoria de trabajo de una petición—; sobre ese estado actúan las **tools**, declaradas como contratos (nombre, descripción, esquema) y ejecutadas por adaptadores que reciben además un parámetro `config` con el contexto de seguridad. Separar lo que la herramienta *es* (catálogo) de lo que la herramienta *hace* (adaptadores) es la decisión de arquitectura que mantiene el agente extensible y seguro.

## Introducción

La lección anterior dejó claro qué es una tool en abstracto: un contrato que define el espacio de acción del agente. Esta segunda sesión aterriza ese concepto en el framework concreto que el proyecto usa, **LangGraph.js**, y lo articula con la otra pieza que da personalidad propia a este modelo de ejecución: el **estado**. El objetivo es triple: entender cómo el grafo y el estado se relacionan durante el ciclo de una petición, ver cómo se declara una tool a nivel de código respetando los requisitos del framework, y adoptar un patrón de organización —catálogo y adaptadores— que escala bien cuando el agente empieza a sumar capacidades.

## Objetivos de aprendizaje

1. Explicar cómo opera LangGraph como **grafo de nodos** y qué papel cumple el **state** durante el ciclo de vida de una petición.
2. Definir una herramienta personalizada en LangGraph configurando su comportamiento, nombre, descripción y esquema de parámetros.
3. Usar el parámetro **`config`** de la herramienta para inyectar contexto del sistema —como el `userId`— y garantizar el filtrado seguro de datos.
4. Estructurar las tools del proyecto separando la **capa de definición** (catálogo) de la **capa de implementación** (adaptadores).
5. Configurar un servidor **MCP** en Cursor para consultar la documentación oficial de LangChain dentro del editor.

## Marco conceptual

### LangGraph como grafo y el rol del estado

LangGraph modela al agente como un **grafo dirigido** de nodos. Cada nodo representa una unidad de trabajo —una llamada al modelo, la ejecución de una tool, una decisión de control— y las aristas describen cómo fluye la información de un nodo al siguiente según el resultado del anterior. El framework no obliga a que el flujo sea lineal: un agente típico es, de hecho, un bucle controlado en el que el modelo razona, invoca una tool, observa el resultado y vuelve a razonar hasta cumplir el objetivo.

La pieza que mantiene cohesión a ese recorrido es el **state**. El estado es un objeto compartido que se va leyendo y mutando a medida que el grafo avanza: contiene los mensajes del hilo, los resultados intermedios de las herramientas, las decisiones intermedias del modelo y cualquier dato que los nodos necesiten compartir. Su **alcance es la petición**: vive durante el procesamiento de una interacción y se descarta o se persiste —según se haya configurado— al cerrarse el ciclo. El estado no es una base de datos ni una memoria de largo plazo; es la memoria de trabajo del agente para *esta* petición.

Una analogía que ayuda a fijar la idea es la del **artesano en su taller**. El artesano es el agente; el `state` es la **mesa de trabajo** donde apoya el pedido del cliente, los materiales y las piezas a medio terminar mientras dura el encargo. Cuando entrega el resultado, la mesa se limpia para el siguiente cliente. Las **tools** son sus martillos, sus sierras, sus destornilladores: instrumentos concretos que actúan sobre lo que está sobre esa mesa. Para usar una sierra nueva, el artesano necesita una etiqueta clara que diga cómo se llama, para qué sirve y qué materiales acepta. En LangGraph, esa etiqueta es la **declaración** de la tool.

### Declarar una tool: comportamiento, nombre, descripción y esquema

Para que LangGraph reconozca y use una herramienta a nivel de código son obligatorios cuatro elementos. El **comportamiento** es la función que se ejecuta cuando la tool es invocada: el código real que hace el trabajo. El **nombre** es el identificador único que el modelo emite al decidir invocarla; debe ser específico y no solaparse con otras tools del catálogo. La **descripción** es el texto que el LLM lee para decidir *cuándo* usar la herramienta: cumple el mismo rol crítico que en cualquier sistema de *function calling* y, como regla, vale más invertir tiempo aquí que en cualquier otra parte de la declaración. El **esquema de parámetros** define los datos de entrada que la tool necesita —tipos, propiedades obligatorias, descripciones campo por campo— y se expresa típicamente con JSON Schema o, en TypeScript, con validadores como Zod.

Un caso canónico es la **búsqueda de datos** del usuario en una base como Supabase. La tool se declara con un nombre del estilo `search_user_notes`, una descripción que delimita su uso a notas del propio usuario autenticado, y un esquema que exige un único parámetro `query` de tipo `string`. El comportamiento, en su versión real, ejecuta una consulta SQL filtrada; en versiones tempranas del agente, es un *stub* que devuelve datos simulados para validar el flujo del grafo antes de cablear la base de datos.

### El parámetro `config`: inyectar contexto sin exponerlo al modelo

Toda tool en LangGraph recibe, además de los argumentos que decide el modelo, un parámetro **`config`** provisto por el propio sistema. Esa distinción es el corazón del modelo de seguridad: el modelo *no* controla lo que va dentro de `config`. El agente —el código que envuelve al grafo— inyecta ahí el contexto de la petición: el `userId` autenticado, identificadores de sesión, *flags* de permisos, el `thread_id` de la conversación.

La consecuencia práctica es directa. Si el `userId` viviera en los argumentos de la tool, el modelo podría —por confusión, por inyección de prompt o por simple alucinación— sustituirlo por otro valor y consultar datos ajenos. Al situarlo en `config`, el handler de la tool tiene la **identidad confiable** del solicitante a la hora de construir la consulta. La regla de diseño que se desprende es clara: cualquier dato que afecte a la **autorización** o al **filtrado por usuario** debe viajar en `config`, nunca en los parámetros visibles al modelo. La tool de búsqueda en Supabase, por ejemplo, recibe `query` desde el LLM pero filtra por el `userId` extraído de `config`, y así el agente no puede ser inducido a leer notas de otra persona.

### Catálogo vs. adaptadores: separar el «qué» del «cómo»

A medida que el agente acumula capacidades, mezclar la declaración de cada tool con su implementación se vuelve costoso de mantener. El patrón que adopta este proyecto separa esas dos responsabilidades en dos archivos distintos dentro de `packages/agent/src/tools/`:

El **catálogo** (`catalog.ts`) es la capa de **definición**. Para cada herramienta describe el contrato hacia el modelo: identificador único, nombre, descripción, esquema de entrada y metadatos transversales como el **nivel de riesgo** —que más adelante alimenta los flujos de *human-in-the-loop*— o la categoría. Es, literalmente, el «qué» de la tool. Este archivo es declarativo y debería ser fácil de leer de un vistazo: si alguien quiere saber qué puede hacer el agente, abre el catálogo.

Los **adaptadores** (`adapters.ts`) son la capa de **implementación**. Aquí viven los `handlers` que ejecutan la lógica real: la consulta SQL a Supabase, la llamada a la API de GitHub, la operación sobre el estado. Es el «cómo» de la tool. Esta separación facilita varias cosas a la vez: cambiar el proveedor real (mover de Supabase a otra base) toca solo los adaptadores; añadir una variante de búsqueda toca solo el catálogo si reusa el mismo handler; testear la lógica de la tool no exige cargar el grafo completo, basta con probar los handlers contra fixtures.

### MCP en Cursor: documentación de LangChain dentro del editor

El **Model Context Protocol (MCP)** permite que un editor compatible —como Cursor— hable con servidores externos que exponen herramientas o documentación al modelo de IA del editor. En el flujo de desarrollo del proyecto se configura un servidor MCP que expone la documentación oficial de **LangChain/LangGraph**: con eso disponible, el asistente del editor puede consultar reglas del framework, recuperar ejemplos canónicos y resolver dudas sin obligar al desarrollador a cambiar de pestaña.

El valor concreto aparece cuando se está creando una tool nueva: en lugar de buscar en la web cómo se declara un esquema de parámetros, qué firma exacta tiene un handler o cómo se accede al `config`, esa información llega al editor en el mismo turno de conversación. Es un acelerador, no un sustituto del entendimiento conceptual; el catálogo, los adaptadores y el papel del estado siguen siendo decisiones del desarrollador.

### Conexión con el reto práctico

Toda esta teoría confluye en un reto sencillo y deliberadamente acotado: crear una tool desde cero usando la estructura `catalog` + `adapters`, integrarla al grafo del agente y probarla en un entorno real, ya sea desde la interfaz web del proyecto o desde Telegram. El alcance reducido no es casual: el objetivo es validar que se domina el ciclo completo —declaración, implementación, integración al grafo, ejecución observada— antes de avanzar a herramientas más complejas en las siguientes lecciones.

## Síntesis

LangGraph proporciona el chasis —grafo de nodos más estado compartido— sobre el que las herramientas adquieren significado. Una tool bien diseñada respeta las cuatro piezas del contrato (comportamiento, nombre, descripción, esquema), recibe su contexto sensible vía `config` para impedir que el modelo manipule la identidad del usuario, y vive en el repositorio bajo una división explícita entre catálogo y adaptadores. Sumar a eso un MCP que acerca la documentación al editor permite iterar más rápido sin sacrificar criterio. Con esa base, el reto de construir y probar una primera tool funcional es un paso natural, no un salto al vacío.

## Preguntas de repaso

1. ¿Qué es el `state` en LangGraph y por qué se dice que su alcance es el ciclo de vida de una petición y no la sesión completa del usuario?
2. ¿Qué cuatro elementos son obligatorios al declarar una tool en LangGraph, y cuál de ellos suele tener el mayor impacto en que el modelo la use bien?
3. Explica por qué el `userId` debe inyectarse vía `config` y no como un parámetro normal de la tool. ¿Qué tipo de ataque o error previene esa decisión?
4. Describe la diferencia entre `catalog.ts` y `adapters.ts` en este proyecto y enuncia un cambio típico que tocaría solo a uno de los dos archivos.
5. ¿Qué aporta configurar el servidor MCP de la documentación de LangChain en Cursor durante el desarrollo de una tool nueva?

## Recursos

- [Documentación oficial de LangGraph.js](https://langchain-ai.github.io/langgraphjs/)
- [LangGraph: ToolNode y herramientas](https://langchain-ai.github.io/langgraphjs/how-tos/tool-calling/)
- [LangChain: definir tools personalizadas](https://js.langchain.com/docs/how_to/custom_tools/)
- [Model Context Protocol (MCP)](https://modelcontextprotocol.io/)
- Estructura real del proyecto: `projects/10x-builders-agent/packages/agent/src/tools/{catalog.ts, adapters.ts}`

## Notas personales

<!-- Observaciones propias, conexiones con otros temas, ideas. -->
