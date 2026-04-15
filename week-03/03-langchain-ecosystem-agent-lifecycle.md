---
title: "Introducción a LangChain y agentes de IA"
week: 3
lesson: 3
tags: [langchain, langgraph, langsmith, deep-agents, llm, agentes, frameworks, ciclo de vida, producción, observabilidad]
date: 2026-04-06
status: done
---

# Introducción a LangChain y agentes de IA

> **Síntesis.** Los modelos de lenguaje son potentes pero aislados: no recuerdan solos, no actúan solos y no acceden solos a datos privados ni APIs. **LangChain** es el andamiaje que conecta ese «cerebro» con memoria, herramientas y datos externos; sobre él se apoyan patrones más estrictos (**LangGraph**) y operación en condiciones reales (**LangSmith**). Cuando el bucle clásico de herramientas se queda corto para tareas largas y complejas, el ecosistema ofrece **Deep Agents** —un *harness* con planificación explícita, almacenamiento de contexto y delegación. Llevar un agente a producción no es un sprint de prompts: es un **ciclo iterativo** de construir, observar, evaluar y desplegar.

## Introducción

Hasta hace poco, «usar IA» en un producto significaba sobre todo enviar texto a un modelo y mostrar la respuesta. Los sistemas actuales van más allá: deben combinar razonamiento, acciones en el mundo real y trazabilidad cuando algo sale mal. Ese salto exige un **marco de desarrollo** que no solo envuelva al LLM, sino que estandarice cómo se encadenan pasos, cómo se recupera información y cómo se gobierna un comportamiento que, por naturaleza, no es totalmente predecible. Esta lección presenta **LangChain** como referencia de la industria para ese tipo de aplicaciones, contrasta el estilo de los **agentes** con el del software clásico y sitúa **LangGraph** y **LangSmith** en el mapa del ecosistema. En clase se mencionó además el patrón **Deep Agents** como respuesta a límites del agente «superficial» de un solo bucle. El cierre del apunte es el **ciclo de vida** que separa un prototipo interesante de un despliegue sostenible.

## Objetivos de aprendizaje

1. Explicar qué problema resuelve **LangChain** al vincular un **LLM** con datos externos, memoria y APIs, y en qué sentido es un *framework* y no solo una librería suelta.
2. Contrastar el **software tradicional** (flujos deterministas y salidas previsibles) con los **agentes** (decisiones no lineales, replanteo de ruta y variabilidad inherente) y reconocer qué implica eso para la ingeniería y la confiabilidad.
3. Ubicar **LangChain**, **LangGraph** y **LangSmith** en niveles distintos de abstracción: prototipado y encadenamiento, control de flujo y grafos, observación y evaluación en entornos serios.
4. Describir las cuatro fases del ciclo de vida del trabajo con agentes —construir, observar, evaluar, desplegar— y cómo se retroalimentan para mejorar un sistema ya en uso.
5. Reconocer en qué situaciones el patrón **Deep Agents** aporta planificación persistente, gestión de contexto y delegación frente a un agente basado solo en llamadas sucesivas a herramientas.

## Marco conceptual

### LangChain: conectar el modelo con el mundo

Un **framework** es un conjunto de herramientas, convenciones y piezas reutilizables que ordenan el desarrollo: no reemplaza el lenguaje de programación, pero evita reinventar en cada proyecto la misma plomería. **LangChain** cumple ese rol para aplicaciones centradas en **modelos de lenguaje grandes** (**LLMs**): modelos entrenados con muchísimo texto para entender y generar lenguaje natural.

Por sí mismos, los LLMs tienen límites duros: no conservan de forma nativa una memoria de conversación ilimitada, no «navegan» solos la web en tiempo real ni ejecutan acciones en sistemas ajenos. LangChain aborda esa brecha ofreciendo patrones para **encadenar** llamadas al modelo, inyectar **contexto** recuperado de documentos o bases, exponer **herramientas** (APIs, funciones, buscadores) que el sistema puede invocar y mantener **estado** a lo largo de un diálogo o de una tarea multi-paso. El resultado son aplicaciones que van del chat con memoria hasta asistentes que leen documentación interna y producen informes acotados a fuentes verificables.

### Agentes frente a aplicaciones tradicionales: de la ruta fija a la variabilidad

En el **software clásico**, la lógica suele ser **determinista**: ante la misma entrada y el mismo estado, el programa recorre ramas definidas por el código y produce una salida predecible. Los interfaces reaccionan a eventos conocidos —un clic dispara una pantalla— y las excepciones se manejan con reglas explícitas.

Un **agente de IA** introduce otro estilo de ejecución. El modelo **interpreta** el objetivo, **elige** qué hacer a continuación y puede **cambiar de estrategia** si una herramienta falla o el contexto exige otra vía. Esa **no linealidad** es fuente de flexibilidad y también de riesgo: las salidas dejan de ser triviales de testear como una tabla de verdad. Por eso deja de bastar un buen prompt aislado; hace falta **ingeniería** alrededor: límites de iteración, validación de salidas, manejo de errores y consciencia de **alucinaciones** cuando el modelo afirma sin respaldo en datos reales. El desafío no es solo «que suene bien», sino que el sistema sea **auditables** y **confiables** en producción.

### El ecosistema: tres piezas, tres alturas

LangChain no es un monolito único: ha crecido hacia un **ecosistema** con capas que responden a problemas distintos.

**LangChain** (en el sentido de biblioteca base) favorece el **prototipado rápido**: unir prompts, cadenas simples, recuperación de documentos y conexión con modelos y herramientas sin imponer aún un grafo de control rígido. Es el punto de partida habitual para experimentar.

**LangGraph** sube un nivel hacia el **control explícito del flujo**. Modela la ejecución como un **grafo** de nodos y aristas: útil cuando hay bucles (reintentar, refinir), ramas condicionales claras o la necesidad de **aprobación humana** antes de un paso crítico. Aporta determinismo donde el agente puro sería demasiado libre.

**LangSmith** se orienta a **observación y operación** en entornos que ya no son el portátil del desarrollador. Centraliza **trazas** (qué hizo el agente paso a paso), consumo de tokens, latencias y material para **evaluar** y comparar versiones. Es el lugar donde la «caja negra» del modelo se vuelve legible para equipos que deben responder ante fallos o costos.

Ninguna de estas piezas reemplaza a las otras: se combinan según la madurez del proyecto y el grado de control que exija el dominio.

### Deep Agents: cuando el bucle simple no alcanza

En la práctica, muchos **agentes** se implementan como un ciclo repetido: el modelo decide, invoca una herramienta, lee el resultado y vuelve a decidir. Ese patrón funciona para tareas acotadas, pero se **agota** cuando la tarea es larga, tiene muchas ramas o exige recordar trabajo intermedio sin inflar la ventana de contexto del modelo. En el ecosistema LangChain se habla de **Deep Agents** (*deep agents*) para nombrar un **harness** —un entorno de ejecución estructurado— pensado precisamente para esos casos.

La idea no es otro modelo distinto, sino **convenciones y herramientas** que rodean al LLM. Suele incluir una capa de **planificación** explícita: listas de subtareas o *todos* que el agente puede crear y actualizar para no perder el hilo en objetivos que duran muchos pasos. A menudo incorpora un **espacio tipo filesystem** (leer, escribir, buscar en archivos virtuales o reales) para que el contexto voluminoso viva fuera del prompt y el modelo consulte solo lo necesario en cada momento —una forma de **aislar** y **persistir** conocimiento de trabajo. También aparece la **delegación en subagentes**: tareas secundarias con su propio contexto acotado, de modo que una investigación o un subanálisis no contamine ni desborde la conversación principal. Por debajo, este tipo de soluciones suele apoyarse en **LangGraph** para ejecución durable, estado y flujos más ricos que un solo bucle genérico.

En resumen, **Deep Agents** nombra el salto de «un LLM con herramientas» a un **runtime** que planifica, externaliza contexto y compone trabajo —útil en investigación, análisis profundo o flujos autónomos que en un agente superficial terminarían en errores acumulados o en prompts imposiblemente largos.

### Ciclo de vida: construir, observar, evaluar, desplegar

Sacar un agente a **producción** no es un evento único sino un **ciclo** que se repite. Cuatro fases articulan esa práctica. El diagrama siguiente resume el flujo en el sentido horario; las interacciones reales después del despliegue **vuelven a alimentar** observación y evaluación, no un único corte en frío.

```
  ┌──────────────────────┐            ┌──────────────────────┐
  │  Construcción        │ ────────▶  │  Observación         │
  │  (Build)             │            │  (Observe)           │
  │  LangChain / Graph   │            │  trazas, LangSmith   │
  └──────────────────────┘            └──────────────────────┘
           ▲                                      │
           │                                      ▼
  ┌──────────────────────┐            ┌──────────────────────┐
  │  Despliegue          │  ◀────────  │  Evaluación          │
  │  (Deploy)            │            │  (Evaluate)          │
  │  usuarios, costos    │            │  datasets, métricas  │
  └──────────────────────┘            └──────────────────────┘
```

En la fase de **construcción** (*build*) se definen prompts, herramientas, políticas de uso y la forma del agente —con LangChain y, cuando hace falta, grafos con LangGraph. Es donde nace el comportamiento deseado, pero aún sin la presión del tráfico real.

La fase de **observación** (*observe*) aprovecha plataformas como LangSmith para inspeccionar **trazas**: qué herramienta eligió el modelo, con qué argumentos y qué devolvió el entorno. Sin eso, depurar un fallo en producción es adivinar.

La fase de **evaluación** (*evaluate*) somete al sistema a **conjuntos de prueba**, métricas de calidad y escenarios adversos: precisión, relevancia, seguridad, latencia. Ahí aparecen alucinaciones sistemáticas o comportamientos indeseados antes de que escalen.

La fase de **despliegue** (*deploy*) pone el agente frente a usuarios reales bajo requisitos de escalabilidad, costos y gobernanza. Las interacciones nuevas generan datos que vuelven a alimentar observación y evaluación, cerrando el ciclo de **mejora continua**.

### Recursos

- [Documentación oficial de LangChain](https://python.langchain.com/docs/introduction/) — conceptos, guías y referencia del ecosistema.
- [Documentación oficial de LangGraph](https://langchain-ai.github.io/langgraph/) — grafos, estado y patrones de orquestación.
- [LangSmith](https://docs.smith.langchain.com/) — trazas, evaluación y despliegue orientado a equipos.
- [Deep Agents (LangChain)](https://docs.langchain.com/deepagents) — visión general del *harness*, planificación, contexto y patrones avanzados.
- Nota conceptual útil: el **ciclo de vida** de la ingeniería de agentes no es lineal como un único release: **construir** define el comportamiento; **observar** hace visible lo que el LLM decidió en cada paso; **evaluar** mide contra criterios explícitos; **desplegar** expone el sistema al mundo y reinicia el bucle con datos nuevos. Sin observación y evaluación, el despliegue es ciego; sin un despliegue controlado, la mejora no se valida en condiciones reales.

## Síntesis

LangChain da el **marco** para que un LLM deje de ser un generador de texto aislado y pase a formar parte de aplicaciones con memoria, herramientas y datos propios. Ese salto convive con la **variabilidad** propia de los agentes, distinta del determinismo del software clásico, y exige **LangGraph** cuando el flujo debe acotarse y **LangSmith** cuando hay que ver y medir lo que ocurre en serio. **Deep Agents** representa la respuesta del ecosistema cuando hace falta **estructura adicional** —planificar, externalizar contexto, delegar— sin renunciar al modelo como motor de decisiones. El puente entre prototipo y producto sigue siendo el **ciclo** construir → observar → evaluar → desplegar, donde cada vuelta reduce la incertidumbre antes de que el siguiente usuario pague el costo de un fallo.

## Preguntas de repaso

1. ¿Qué limitaciones nativas de un LLM resuelve un framework como LangChain, más allá de «mejorar el prompt»?
2. En qué se diferencia el fallo de una rama `if/else` bien testeada del fallo de un agente que eligió mal una herramienta, en términos de previsibilidad y de estrategias de mitigación.
3. ¿Para qué tipo de requisitos elegirías modelar un flujo con LangGraph en lugar de una cadena simple de LangChain?
4. Describí cómo la fase de despliegue se conecta de nuevo con la de observación en un ciclo de mejora continua.
5. ¿En qué escenario un patrón tipo Deep Agents (planificación, «filesystem» de contexto, subagentes) aporta más que un agente con un único bucle herramienta–observación?

## Notas personales

<!-- Observaciones propias, conexiones con otros temas, ideas. -->

En clase clonamos el repo [`10X-Builders-langchain-agent`](../projects/10X-Builders-langchain-agent/) de GitHub como base de un agente LangChain ya armado — no arrancamos de cero, sino que estudiamos cómo estaba ensamblado. Después, por cuenta propia, agregué el tool de vuelos (`flights.ts`) que conecta el agente a la API de Google Flights vía SerpApi. Fue la primera vez que registré un tool real desde cero. Me ayudó a entender de golpe cómo el agente "sabe" qué puede hacer.

### Cómo se ensambla el agente con LangChain

```ts
const agent = await createToolCallingAgent({ llm: model, tools: agentTools, prompt: agentPrompt });
return new AgentExecutor({ agent, tools: agentTools, verbose });
```

`createToolCallingAgent` une el modelo, los tools disponibles y el prompt en una unidad que ya sabe cuándo y cómo llamar a cada herramienta. `AgentExecutor` es el runtime que le pone el bucle encima: llama al agente, ejecuta el tool que eligió, pasa el resultado de vuelta y repite hasta tener una respuesta final. El flag `verbose` es puro debug — muestra cada paso del bucle en consola.

### Cómo se usa Zod para definir el contrato del tool

```ts
const flightsSchema = z.object({
  origin: z.string().describe("Código IATA del aeropuerto de origen (ej: BOG, MIA, JFK)..."),
  departureDate: z.string().optional().describe("Fecha en YYYY-MM-DD..."),
  adults: z.number().optional().default(1),
});
```

Zod es una librería de validación de esquemas en TypeScript. LangChain la usa para que el modelo entienda exactamente qué parámetros acepta cada tool, cuáles son opcionales y de qué tipo son. El `.describe()` es lo que termina inyectado en el prompt del modelo — sin eso, el LLM no sabría que `origin` espera un código IATA y podría mandar cualquier cosa.
