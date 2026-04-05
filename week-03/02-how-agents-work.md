---
title: "¿Cómo Funciona un Agente de IA?"
week: 3
lesson: 2
tags: [agentes, react, planificación, memoria, herramientas, llm, rag, chatbot]
date: 2026-04-05
status: done
---

# ¿Cómo Funciona un Agente de IA?

> **Síntesis.** Un agente no es un chatbot que responde mejor; es un sistema que **razona, actúa, observa y corrige** en bucle hasta resolver un objetivo. Lo que lo hace posible son cuatro pilares: un LLM como motor de decisiones, planificación para descomponer problemas, memoria para mantener contexto y herramientas para interactuar con el mundo real.

## Introducción

La sesión anterior estableció *cuándo* tiene sentido usar un agente frente a un workflow determinista. Esta sesión responde la pregunta complementaria: una vez que decidimos que un agente es la herramienta correcta, ¿qué ocurre por dentro? Entender la mecánica interna —el ciclo de razonamiento, los componentes que sostienen la autonomía y la diferencia estructural con un chatbot— es necesario para diseñar agentes que funcionen de forma confiable y no se conviertan en cajas negras impredecibles.

## Objetivos de aprendizaje

1. Explicar por qué un chatbot tradicional es un sistema reactivo y en qué se diferencia de un agente orientado a objetivos.
2. Describir el patrón **ReAct** y su ciclo iterativo de pensamiento, acción, observación y corrección.
3. Identificar los cuatro pilares de un agente (cerebro, planificación, memoria y herramientas) y entender qué aporta cada uno al comportamiento autónomo.
4. Razonar sobre cómo la integración de herramientas externas y la memoria contextual permiten a un agente resolver tareas que un chatbot no puede abordar.

## Marco conceptual

### Del chatbot reactivo al agente orientado a objetivos

Un **chatbot tradicional** opera en un modelo estímulo-respuesta: recibe un prompt, genera texto basándose en sus datos de entrenamiento y se detiene. No ejecuta acciones fuera de su ventana de conversación, no verifica si su respuesta resolvió algo en el mundo real y no ajusta su comportamiento en función de resultados. Es, en esencia, un sistema **reactivo** de un solo turno lógico.

Un **agente de IA**, en cambio, recibe un *objetivo* —no solo una pregunta— y se compromete a alcanzarlo. Para eso necesita capacidades que el chatbot no tiene: descomponer el objetivo en pasos, ejecutar acciones concretas (consultar una API, modificar un archivo, buscar datos), evaluar si el resultado lo acerca a la meta y, si no, replantear su estrategia. La diferencia fundamental no es la calidad del texto que genera, sino que opera en un **bucle continuo** donde cada iteración incorpora información nueva del entorno.

Pensemos en un ejemplo concreto: pedirle a un sistema que organice un viaje a Japón con un presupuesto de $2,000 USD. Un chatbot producirá consejos genéricos sobre ahorro y destinos recomendados. Un agente, en cambio, consultará precios reales de vuelos a través de una API, restará ese costo del presupuesto, buscará alojamiento con el dinero restante y, si los vuelos en las fechas solicitadas exceden el límite, ajustará las fechas automáticamente. El chatbot informa; el agente resuelve.

### El patrón ReAct: razonar y actuar en bucle

El comportamiento iterativo del agente no es improvisado; sigue un patrón de diseño conocido como **ReAct** (*Reason + Act*). En cada iteración, el agente ejecuta tres fases que se repiten hasta completar la tarea o agotar un límite de intentos.

La primera fase es **pensar** (*reason*): el agente analiza su estado actual, lo que sabe hasta ahora y lo que necesita averiguar. Esta fase produce un plan explícito o una decisión sobre qué acción tomar a continuación. La segunda fase es **actuar** (*act*): el agente usa una herramienta —llama a una API, ejecuta código, busca en una base de datos— para obtener información o producir un efecto en el entorno. La tercera fase es **observar** (*observe*): el agente examina el resultado de su acción y lo incorpora a su contexto. Si el resultado es satisfactorio, avanza al siguiente subobjetivo; si no, corrige su plan y vuelve a pensar.

Este ciclo de pensar → actuar → observar es lo que convierte a un modelo de lenguaje —que por sí solo solo genera texto— en un sistema capaz de resolver problemas que requieren múltiples pasos, datos externos y adaptación sobre la marcha. Sin ReAct, el LLM produce respuestas en un solo intento sin verificación; con ReAct, cada respuesta parcial se somete a evidencia del entorno antes de continuar.

### Pilar 1 — El cerebro: el LLM como motor de decisiones

El **modelo de lenguaje grande** (LLM) es el núcleo cognitivo del agente. Su función va más allá de generar texto fluido: interpreta las instrucciones del usuario, procesa la lógica del problema, evalúa los resultados de las herramientas y decide qué paso dar a continuación. Cada fase de «pensar» en el ciclo ReAct depende de la capacidad del LLM para razonar sobre el estado actual y producir una decisión coherente.

La calidad del LLM define el techo de lo que el agente puede hacer. Un modelo con poca capacidad de razonamiento producirá planes deficientes y tomará decisiones erráticas en el bucle; un modelo más capaz mantendrá coherencia a lo largo de muchas iteraciones. Por eso la elección del modelo no es un detalle de configuración, sino una decisión arquitectónica que afecta directamente la confiabilidad del agente.

### Pilar 2 — Planificación: de lo abstracto a lo ejecutable

Ante un objetivo complejo o ambiguo, el agente necesita **planificación**: la capacidad de traducir una meta general en una secuencia de subtareas concretas y manejables. Sin esta descomposición, el modelo intentaría resolver todo de golpe, lo que aumenta drásticamente la probabilidad de alucinación y de perder el hilo.

La planificación funciona como un puente entre la intención humana (que suele ser vaga: «organizame un viaje», «resolvé este bug») y la ejecución paso a paso que el agente puede manejar. Cada subtarea se convierte en un ciclo ReAct propio: pensar qué necesito para esta parte, actuar para obtenerlo, observar si lo conseguí. El plan no es rígido; el agente puede revisarlo si una subtarea arroja resultados inesperados, lo que le da la adaptabilidad que un workflow predefinido no tiene.

### Pilar 3 — Memoria: contexto que persiste

Un agente que olvidara todo entre iteraciones sería incapaz de mantener coherencia. La **memoria** resuelve ese problema en dos escalas temporales.

La **memoria a corto plazo** retiene la conversación actual y los resultados de los pasos recientes. Es lo que permite al agente saber que ya consultó los precios de vuelos, que el resultado fue $800 y que el presupuesto restante es $1,200. Sin ella, cada iteración del bucle ReAct empezaría de cero, repitiendo acciones y perdiendo progreso.

La **memoria a largo plazo** extiende el contexto más allá de la sesión inmediata. La técnica más común para implementarla es **RAG** (*Retrieval-Augmented Generation*, generación aumentada por recuperación): el agente consulta bases de datos externas, documentos o históricos para recuperar información relevante que no cabe en su ventana de contexto. Esto le permite recordar preferencias de un usuario a lo largo del tiempo, acceder a documentación técnica extensa o consultar registros históricos sin necesidad de que toda esa información esté presente en el prompt inicial.

### Pilar 4 — Herramientas: del razonamiento a la acción

Las herramientas son lo que convierte al agente de un sistema que *piensa sobre* problemas a uno que *actúa sobre* ellos. Sin herramientas, el LLM está confinado a su burbuja de texto: puede razonar sobre qué haría, pero no puede hacerlo. Las herramientas rompen esa barrera conectándolo con el mundo exterior.

En la práctica, las herramientas son **APIs** e interfaces que el agente invoca durante la fase de «actuar» del ciclo ReAct: un buscador web para obtener información actualizada, una calculadora para operaciones exactas, un intérprete de código para ejecutar lógica compleja, una API de correo para enviar notificaciones o una conexión a base de datos para leer y escribir registros. Cada herramienta tiene una interfaz documentada que el agente aprende a usar —qué parámetros recibe, qué devuelve, cuándo es apropiado invocarla— y la calidad de esa documentación influye directamente en qué tan bien el agente las utiliza.

Las herramientas son también lo que diferencia de forma más visible a un agente de un chatbot. El chatbot genera texto sobre vuelos baratos; el agente consulta precios reales, compara opciones y puede ejecutar la compra. El puente entre razonamiento y ejecución es, en última instancia, lo que hace que un agente sea útil en escenarios reales.

## Síntesis

Un agente de IA es la combinación de un LLM que razona, un plan que descompone objetivos, memoria que mantiene coherencia y herramientas que conectan con el mundo real, todo operando dentro del ciclo iterativo de ReAct. Ninguno de estos pilares funciona aislado: sin herramientas el agente solo habla, sin memoria pierde el hilo, sin planificación se abruma y sin un LLM capaz las decisiones son erráticas. Entender esta arquitectura interna es lo que permite diseñar agentes confiables en lugar de cajas negras que a veces funcionan.

## Preguntas de repaso

1. Si un chatbot y un agente usan el mismo LLM de base, ¿qué componentes adicionales explican que el agente pueda resolver tareas que el chatbot no puede?
2. Describí las tres fases del ciclo ReAct y explicá qué ocurre si se omite la fase de observación.
3. ¿Qué problema resuelve la memoria a corto plazo dentro del bucle de un agente, y en qué se diferencia del papel que cumple RAG como memoria a largo plazo?
4. ¿Por qué la documentación de las herramientas es tan importante como la capacidad del modelo? ¿Qué pasa cuando una herramienta está mal documentada?

## Notas personales

### Los cuatro pilares en una línea

Cada pilar cumple una función irreducible dentro del ciclo del agente:

```
┌─────────────────────────────────────────────────────────┐
│                    AGENTE DE IA                         │
│                                                         │
│   🧠 Cerebro (LLM)        →  PENSAR                    │
│   🗂️ Planificación         →  ORDENAR                   │
│   💾 Memoria               →  SOSTENER CONTEXTO         │
│   🔧 Herramientas (Tools)  →  EJECUTAR                  │
│                                                         │
│         ┌──────────┐                                    │
│         │  PENSAR  │ ← Cerebro + Planificación          │
│         └────┬─────┘                                    │
│              ▼                                          │
│         ┌──────────┐                                    │
│         │  ACTUAR  │ ← Herramientas                     │
│         └────┬─────┘                                    │
│              ▼                                          │
│         ┌──────────┐                                    │
│         │ OBSERVAR │ ← Cerebro + Memoria                │
│         └────┬─────┘                                    │
│              │                                          │
│              └──────→ ¿Objetivo cumplido?                │
│                        ├─ No → volver a PENSAR          │
│                        └─ Sí → FIN                      │
└─────────────────────────────────────────────────────────┘
```

Lo interesante es que los pilares no operan de a uno: **pensar** involucra al cerebro decidiendo *qué* hacer y a la planificación decidiendo *en qué orden*. **Observar** involucra al cerebro interpretando el resultado y a la memoria registrándolo. Solo **actuar** es territorio exclusivo de las herramientas.

### Técnicas de memoria más allá de RAG

En el marco conceptual se mencionan memoria a corto y largo plazo, con RAG como técnica principal. Pero hay otras estrategias que los agentes usan en la práctica:

**Memoria por resumen (*summarization memory*).** Cuando la conversación crece más allá de la ventana de contexto del modelo, en lugar de descartarla se comprime: un LLM genera un resumen de lo ocurrido hasta ahora y ese resumen reemplaza los mensajes originales. Se pierde detalle pero se conserva el hilo narrativo. Es la técnica que usan muchos chatbots de contexto largo: no recuerdan todo textualmente, recuerdan lo esencial condensado.

**Scratchpad o memoria de trabajo.** Un buffer intermedio donde el agente escribe notas para sí mismo durante la ejecución: resultados parciales, hipótesis descartadas, datos que necesitará más adelante. Es más explícito que la memoria a corto plazo (que es simplemente el historial de mensajes) porque el agente decide activamente qué registrar. Algunos frameworks lo implementan como una herramienta más que el agente puede invocar.

**Memoria episódica.** Almacena interacciones pasadas completas (o sus resúmenes) como "episodios" recuperables. Cuando el agente enfrenta una tarea similar a una anterior, puede buscar cómo la resolvió en el pasado y reutilizar esa estrategia. Es la diferencia entre recordar *datos* (RAG) y recordar *experiencias*.

### RAG en más detalle

RAG (*Retrieval-Augmented Generation*) resuelve un problema concreto: el LLM tiene una ventana de contexto finita y un entrenamiento estático; no puede saberlo todo ni tenerlo todo presente al mismo tiempo. RAG cierra esa brecha en dos pasos:

1. **Recuperación (*retrieval*)**: ante una consulta, se buscan los fragmentos más relevantes en una fuente externa (documentos, base de datos, históricos). La búsqueda suele hacerse con **embeddings** — representaciones numéricas del significado del texto almacenadas en una **base de datos vectorial** (como Pinecone, Weaviate o ChromaDB). Se compara el embedding de la consulta contra los de los fragmentos y se recuperan los más similares semánticamente.

2. **Generación aumentada**: los fragmentos recuperados se inyectan en el prompt junto con la pregunta original, dándole al LLM contexto específico y actualizado que no tenía en su entrenamiento. El modelo genera la respuesta basándose en esa evidencia concreta, no en lo que "recuerda" de su entrenamiento.

La ventaja es que el conocimiento se actualiza sin reentrenar el modelo: basta con actualizar la fuente de datos. La limitación es que la calidad depende de la recuperación — si el sistema trae fragmentos irrelevantes, el LLM genera respuestas contaminadas con información fuera de contexto.
