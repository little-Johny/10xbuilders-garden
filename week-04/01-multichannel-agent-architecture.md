---
title: "Arquitectura de un agente inteligente multicanal"
week: 4
lesson: 1
tags: [monorepo, turborepo, nextjs, langgraph, langchain, supabase, typescript, open-router, gpt-4o, arquitectura, multicanal]
date: 2026-04-18
status: done
---

# Arquitectura de un agente inteligente multicanal

> **Síntesis.** Un agente de IA en producción no es un script aislado: es un sistema distribuido donde cada capa tiene una responsabilidad bien delimitada. La arquitectura basada en **monorepo con Turborepo** centraliza el código; **LangGraph.js** gobierna el flujo de razonamiento; **Supabase** ancla la identidad y la memoria; y **Open Router** actúa como capa unificada de acceso al modelo. Entender cómo estas piezas encajan —y por qué— es el punto de partida obligatorio antes de escribir la primera línea del agente.

## Introducción

Construir un chatbot que responde bien en un playground es sencillo. Construir un agente que funciona de forma confiable en la web y en Telegram, recuerda el historial de cada usuario, verifica su identidad antes de procesar nada y puede evolucionar sin romper el código ya desplegado es una tarea de arquitectura, no solo de prompts. Esta lección abre el módulo presentando el sistema completo como un todo coherente: cómo se organiza el código en un monorepo, qué rol cumple cada tecnología y cómo fluye una interacción de extremo a extremo, desde el mensaje del usuario hasta la respuesta final.

## Objetivos de aprendizaje

1. Describir la estructura de un monorepo basado en **Turborepo** y explicar por qué centralizar dependencias y caché de compilación importa en un proyecto multicanal.
2. Explicar el flujo completo de una interacción: autenticación con **Supabase**, procesamiento con **LangGraph** y retorno de la respuesta al canal de origen.
3. Identificar el rol específico de **LangChain Core**, **LangGraph.js** y **Open Router** en la cadena de razonamiento y ejecución del modelo.
4. Analizar la estructura de directorios del proyecto para ubicar dónde vive cada responsabilidad del sistema.
5. Preparar el entorno clonando el repositorio base que se usará a lo largo del módulo.

## Marco conceptual

### El monorepo como columna vertebral del proyecto

Un **monorepo** es una estrategia de organización en la que múltiples aplicaciones y paquetes de un sistema viven en un único repositorio de código. La alternativa habitual —repositorios separados por servicio— simplifica el aislamiento pero complica la coherencia: versiones de tipos que no coinciden, cambios en una interfaz compartida que requieren actualizar tres repos en paralelo, pipelines duplicados. En un sistema donde el frontend web, el runtime del agente y el adaptador de Telegram deben compartir tipos y utilidades comunes, el monorepo elimina esa fricción desde el diseño.

**Turborepo** es la herramienta que hace operable esa estrategia en proyectos JavaScript y TypeScript. Su aportación central es un sistema de **caché de compilación**: cuando un paquete no ha cambiado, Turborepo no lo recompila sino que devuelve el artefacto cacheado, recortando tiempos de build de forma significativa en proyectos con muchos paquetes. Además, detecta las dependencias entre paquetes del monorepo y ordena la compilación automáticamente, evitando el error clásico de compilar un paquete antes de que esté lista su dependencia interna.

### Next.js: más que una interfaz gráfica

En este proyecto, **Next.js** no es solo el marco del frontend: cumple dos roles en paralelo. Por un lado renderiza la interfaz web que el usuario ve en el navegador. Por otro, expone las **rutas API** que reciben los mensajes entrantes —tanto desde el cliente web como desde webhooks externos como Telegram— y los reenvían al runtime del agente. Esta dualidad lo convierte en el punto de entrada único del sistema: toda petición externa pasa primero por Next.js antes de llegar al núcleo de procesamiento.

### LangChain Core y LangGraph.js: las abstracciones del agente

**LangChain Core** provee las abstracciones fundamentales que comparten todos los componentes que interactúan con el modelo de lenguaje: la interfaz para enviar un prompt, los parsers que convierten la salida del modelo en estructuras utilizables por el código, y los conectores hacia herramientas externas. Es la capa de «vocabulario común» que evita acoplar el código del agente a un proveedor de IA específico.

Sobre esa base, **LangGraph.js** añade el **control explícito del flujo**. La diferencia práctica respecto a una cadena simple de LangChain es que LangGraph permite definir el proceso del agente como un **grafo con estado**: nodos que representan acciones o decisiones, aristas que determinan qué ocurre después según el resultado de cada nodo, y un objeto de estado que persiste y se actualiza a lo largo de todo el recorrido. Este modelo es el que habilita al agente para hacer lo que un script lineal no puede: pensar, elegir una herramienta, observar el resultado, y decidir si el objetivo está cumplido o si hace falta otro paso. El bucle no lo programa el desarrollador a mano; lo describe en el grafo y LangGraph lo ejecuta.

### Supabase: identidad, datos y seguridad integrados

**Supabase** es la plataforma que gestiona todo lo relacionado con datos y autenticación. Bajo el capó utiliza **PostgreSQL**, lo que significa que el historial de conversaciones no vive en una estructura ad hoc sino en una base de datos relacional con todas las garantías transaccionales y de consistencia que eso implica.

La parte que distingue a Supabase de un PostgreSQL genérico es que incluye un sistema de autenticación y un mecanismo de **políticas de seguridad a nivel de fila** (*Row Level Security*, RLS). Estas políticas se definen directamente en la base de datos: cada consulta se evalúa contra una regla que verifica la identidad del usuario que la realiza. El resultado práctico es que, aunque el agente use la misma conexión para todos los usuarios, la base de datos garantiza que cada uno solo puede leer y escribir su propio historial de chat. La seguridad no depende de que el código de la aplicación recuerde filtrar correctamente; está impuesta en la capa de datos.

### TypeScript en todo el monorepo: un solo contrato de tipos

Una de las decisiones de diseño más silenciosas —y más poderosas— de este proyecto es usar **TypeScript** de extremo a extremo: en el frontend Next.js, en el runtime del agente y en los scripts de base de datos. Esto permite definir los tipos de datos compartidos —la forma de un mensaje, la estructura de una sesión, los parámetros de una herramienta— en un único paquete interno que todos los demás importan. Cuando esa definición cambia, el compilador detecta todos los puntos del sistema afectados en el mismo momento, antes de que el error llegue a producción.

### Open Router y GPT-4o mini: acceso unificado al modelo

**Open Router** es una API que actúa como capa de enrutamiento entre la aplicación y múltiples proveedores de modelos de lenguaje. En lugar de integrar directamente el SDK de OpenAI —o el de Anthropic, o el de Google— el agente llama a Open Router con el identificador del modelo deseado y la plataforma gestiona la autenticación y el formato de la petición. Esto simplifica los cambios de proveedor o modelo: si en el futuro conviene migrar de GPT-4o mini a otro modelo, basta con cambiar el identificador, no la integración.

**GPT-4o mini** es el modelo elegido como punto de partida por su balance entre velocidad de respuesta, costo por token y capacidad de razonamiento para tareas conversacionales y de uso de herramientas. No es el modelo más potente disponible, pero para un agente conversacional de propósito general es suficiente y su costo permite iterar sin preocupaciones de presupuesto en la fase de desarrollo.

### El flujo de una interacción de extremo a extremo

Entender la arquitectura como lista de tecnologías es útil, pero entenderla como un flujo continuo es lo que permite depurar y extender el sistema. Una interacción completa atraviesa cuatro momentos:

El primer momento es la **entrada y autenticación**. El usuario envía un mensaje —desde la interfaz web o desde Telegram. Next.js recibe la petición en su ruta API correspondiente y, antes de procesar nada, consulta a Supabase para verificar que la sesión del usuario es válida. Si la identidad no se confirma, el flujo se detiene aquí.

El segundo momento es el **procesamiento en LangGraph**. El mensaje verificado ingresa al grafo del agente. LangGraph evalúa el estado actual de la conversación, determina si hace falta invocar alguna herramienta, ejecuta esa herramienta y procesa el resultado. Este ciclo puede repetirse varias veces en una sola interacción si el agente necesita varios pasos para alcanzar una respuesta adecuada.

El tercer momento es la **persistencia**. Antes de responder, el agente escribe en PostgreSQL tanto el mensaje original del usuario como la respuesta generada. Este registro no es solo auditoría: es la memoria del agente. En la próxima interacción, LangGraph recuperará ese historial para mantener el contexto de la conversación sin necesidad de que el usuario repita información.

El cuarto momento es la **respuesta al canal**. La respuesta generada vuelve a Next.js, que la entrega al cliente que corresponda: la interfaz web renderiza el mensaje en el hilo de chat; el adaptador de Telegram lo envía como mensaje en la conversación del bot. El canal de entrada y el canal de salida siempre coinciden; la arquitectura garantiza ese enrutamiento sin que el runtime del agente necesite saber con qué interfaz habló el usuario.

### Estructura de directorios del proyecto

El repositorio base organiza el código en cuatro áreas principales que reflejan las responsabilidades del sistema:

La **aplicación web** contiene el código Next.js: páginas, componentes de interfaz, rutas API y la lógica de sesión en el cliente. Es el único punto de contacto con el navegador.

El **paquete del agente** concentra toda la lógica de LangGraph: la definición del grafo, los nodos de razonamiento, los conectores de herramientas y la configuración del modelo a través de Open Router. Este paquete no sabe nada de interfaces; solo procesa mensajes y devuelve respuestas.

El **paquete de base de datos** encapsula la conexión con Supabase, las consultas para leer y escribir historial, y los scripts de migración para evolucionar el esquema de la base de datos sin perder datos.

La **documentación** del repositorio incluye guías de configuración del entorno, referencias de las variables de entorno necesarias y explicaciones de las decisiones de diseño que no son evidentes leyendo solo el código.

## Síntesis

La arquitectura de este agente multicanal está diseñada para que cada pieza tenga una responsabilidad única y reemplazable. Turborepo mantiene la coherencia del monorepo sin sacrificar la velocidad de compilación. Next.js centraliza la entrada y salida sin contaminar el núcleo lógico. LangGraph.js controla el flujo de razonamiento con precisión de grafo. Supabase impone la seguridad y la persistencia en la capa donde es más difícil eludirla: la propia base de datos. TypeScript unifica el contrato entre todas estas capas. Comprender este diseño antes de tocar el código es lo que permite modificar una parte del sistema con confianza de que el resto no se romperá.

## Preguntas de repaso

1. ¿Por qué se elige un monorepo en lugar de repositorios separados para el frontend, el agente y la base de datos? ¿Qué problema concreto resuelve Turborepo en ese contexto?
2. Describe el recorrido completo de un mensaje desde que el usuario lo envía en la interfaz web hasta que recibe la respuesta, mencionando cada capa del sistema que interviene.
3. ¿Qué diferencia práctica existe entre definir el flujo del agente con LangGraph.js en lugar de con una cadena simple de LangChain?
4. ¿Por qué las políticas RLS de Supabase son una solución de seguridad más robusta que filtrar por `userId` en el código de la aplicación?
5. ¿Qué ventaja aporta usar Open Router como intermediario frente a integrar directamente el SDK de un proveedor de modelo?
