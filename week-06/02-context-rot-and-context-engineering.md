---
title: "Context Rot y Context Engineering: por qué una ventana grande no basta"
week: 6
lesson: 2
tags: [agentes, memoria, ventana-de-contexto, context-rot, context-engineering, tokens, atencion, aguja-en-pajar, rag, levenshtein, llm]
date: 2026-05-14
status: done

---

# Context Rot y Context Engineering: por qué una ventana grande no basta

> **Síntesis.** Una ventana de contexto enorme no resuelve el problema de la memoria de un agente: lo posterga y, paradójicamente, lo agrava. A medida que el prompt crece, el rendimiento del modelo se degrada —fenómeno conocido como **Context Rot**— porque la atención se diluye entre capas que compiten por el mismo espacio. La solución no está en pedir más tokens sino en aplicar **Context Engineering**: curar qué entra al prompt en cada turno, separar lo relevante del ruido y apoyarse en una capa de memoria que filtre antes de inyectar.

## Introducción

La sesión anterior dejó establecido que la memoria de un agente es una arquitectura externa al modelo y que la **ventana de contexto** impone un techo de tokens. Esta clase profundiza en un punto que suele subestimarse: incluso cuando todo cabe dentro de la ventana, la calidad de la respuesta se deteriora si el contexto es demasiado grande o demasiado ruidoso. El problema no es solo cuántos tokens caben, sino cuánta atención efectiva tiene el modelo sobre cada uno. Aquí entran dos ideas clave —**Context Rot**, que describe la degradación arquitectural; y **Context Engineering**, que describe la disciplina para mitigarla— junto con una analogía operativa (el balde de agua) y un experimento concreto (el estudio de Chroma con distancia de Levenshtein) que demuestra empíricamente el efecto.

## Objetivos de aprendizaje

1. Explicar la **ventana de contexto** como un espacio finito en el que conviven varias capas (system prompt, historial, tools, contexto inyectado) y entender cómo compiten por la atención del modelo.
2. Caracterizar el **Context Rot** como una degradación arquitectural —no un bug— que aparece cuando el contexto crece, y respaldar esa caracterización con la evidencia del estudio de Chroma y la **distancia de Levenshtein**.
3. Diagnosticar el problema de la **aguja en el pajar** y reconocer por qué inyectar documentos enteros a un LLM es una estrategia frágil.
4. Aplicar los principios de **Context Engineering** para decidir qué entra al prompt y qué se delega a una capa de memoria externa, distinguiéndolo de la apuesta ingenua por «más tokens».

## Marco conceptual

### La ventana de contexto como balde con capas que compiten

La forma más útil de imaginar la ventana de contexto no es como una caja vacía esperando texto, sino como un **balde con varias aguas vertidas en orden**. Cuando llega un nuevo turno del usuario, el balde ya está parcialmente lleno: el **system prompt** ocupa una franja fija con las reglas del agente; el **catálogo de tools** declarado consume su propio espacio con esquemas y descripciones; el **historial de mensajes** acumula todos los turnos previos de la sesión; los **resultados de tools** anteriores —que pueden ser largos— viajan junto al historial; y finalmente el **prompt del usuario** se suma encima. Todas esas capas pelean por el mismo volumen, y ninguna es opcional: el modelo necesita cada una para responder con sentido.

La consecuencia práctica es que el espacio disponible para la respuesta —y para la atención del modelo sobre lo que importa— no es la capacidad total del balde, sino lo que queda después de sumar las capas existentes. Y en una conversación que se alarga, lo que más crece sin pedir permiso es el historial. De ahí que la pregunta de diseño nunca sea «¿cuántos tokens tiene el modelo?» sino «¿cuántos tokens estamos gastando en cada capa, y cuántos podemos recortar sin perder coherencia?».

### Context Rot: la degradación no es un bug, es arquitectural

A medida que el balde se llena, sucede algo que no es intuitivo: el modelo no falla de golpe al chocar con el techo, sino que **empieza a degradar su rendimiento mucho antes**. A este fenómeno se le llama **Context Rot** —literalmente, «pudrición del contexto»— y describe cómo la calidad de las respuestas baja de forma progresiva conforme se inyecta más información, aunque técnicamente todavía quepa.

La razón es arquitectural: los modelos basados en atención no la distribuyen de forma uniforme sobre el prompt. Cuanto más texto haya, más diluida queda la atención sobre cada fragmento, y más fácil es que el modelo pase por encima de instrucciones críticas, confunda referencias o mezcle información de partes lejanas del contexto. No es un defecto que se corrige con una versión nueva del modelo: es una propiedad del mecanismo. Por eso conviene tratar el Context Rot como una **restricción de diseño permanente**, no como un problema temporal que «ya se resolverá cuando salga el próximo modelo».

### Evidencia empírica: el estudio de Chroma y la distancia de Levenshtein

La intuición anterior se sostiene en datos concretos. Un estudio publicado por **Chroma** midió el rendimiento de modelos sobre tareas básicas a medida que se aumentaba el tamaño del input. La métrica utilizada fue la **distancia de Levenshtein**, que cuenta cuántas ediciones —inserciones, eliminaciones o sustituciones de caracteres— hacen falta para transformar un texto en otro; sirve, en este contexto, como una medida de cuánto se aleja la salida del modelo de la respuesta esperada.

El resultado, representado en una escala logarítmica, es revelador: incluso en tareas tan elementales como pedirle al modelo que **reproduzca un texto que se le acaba de entregar**, el rendimiento cae de forma drástica cuando el input se vuelve gigante. La salida se vuelve más errática, aparecen variaciones inventadas, omisiones, alucinaciones. La conclusión que conviene retener es contundente: una ventana de contexto enorme **no garantiza** calidad; la garantía depende de qué tan curado venga lo que se inyecta.

### El problema de la aguja en el pajar

El caso de uso donde el Context Rot duele más es el patrón conocido como **aguja en el pajar**: meter un documento masivo —un libro, una base de conocimiento completa, todo el historial de la conversación— y pedirle al modelo que encuentre un dato muy específico dentro. Es tentador porque parece la solución de menor fricción: si todo está ahí, ¿qué puede salir mal?

Lo que sale mal es triple. Primero, el **costo** computacional y económico crece linealmente con los tokens, y muchos de esos tokens son irrelevantes para la consulta concreta. Segundo, la **latencia** aumenta porque procesar un prompt enorme es más lento. Tercero, y más grave, la **probabilidad de error** se dispara: el modelo distribuye su atención sobre todo el pajar y, al hacerlo, pierde precisión sobre la aguja; puede ignorar la instrucción principal, inventar un dato, o devolver una respuesta plausible pero incorrecta. La estrategia que parecía cómoda termina siendo cara, lenta y poco fiable a la vez.

### Context Engineering: curar el contexto antes de inyectarlo

La respuesta operativa al Context Rot es lo que se llama **Context Engineering**: el conjunto de prácticas dedicadas a decidir, turno a turno, **qué información merece entrar al prompt y cuál no**. En lugar de tratar la ventana como un cajón al que se le tira todo el material disponible esperando que el modelo organice, se diseña un sistema que filtra, prioriza y compacta antes de invocar al LLM.

En la práctica esto se traduce en dos movimientos coordinados. Por un lado, una **gestión activa de la memoria a corto plazo** —compactaciones, resúmenes, descarte de turnos antiguos— para evitar que el historial crezca sin control. Por otro, una **memoria a largo plazo recuperable**, típicamente en una base vectorial, de la que el sistema extrae solo los fragmentos que son relevantes para la consulta actual usando técnicas como **RAG** (*Retrieval-Augmented Generation*). El LLM ya no recibe el conocimiento completo del agente: recibe un subconjunto curado, pegado al system prompt, justo para esta pregunta. Esa decisión —curar antes de inyectar— es la diferencia entre un agente que escala y uno que se ahoga en su propio historial.

### Ventana inmensa vs. contexto curado

Conviene desarmar de forma explícita un malentendido frecuente. Cuando aparece un modelo con ventana de un millón de tokens, la reacción instintiva es pensar que «ya no hay que preocuparse por la memoria». Es falso. Una ventana inmensa habilita ingerir más datos, pero **no elimina el Context Rot**: la atención sigue diluyéndose, el costo por consulta se multiplica, la latencia se dispara y la calidad cae con el tamaño del prompt.

Un contexto **curado** mediante Context Engineering envía menos tokens, pero **más relevantes**. El modelo trabaja menos, decide mejor, cuesta menos y responde más rápido. La comparación correcta no es «ventana grande vs ventana pequeña», sino «volcar todo vs seleccionar lo necesario». La capacidad del modelo es un piso técnico; la calidad del contexto es lo que define el techo práctico.

### Conexión con la práctica del módulo

Lo que esta sesión deja como base conceptual aterriza en las próximas clases. Diseñar un agente con memoria implica decidir explícitamente qué cabe en cada turno: un system prompt acotado, un historial compactado, una recuperación selectiva desde memoria a largo plazo y solo los resultados de tools que aportan al razonamiento actual. Como reto práctico para fijar la intuición, vale la pena hacer el experimento contrario: pasarle a un modelo un documento masivo con un dato puntual escondido y observar de primera mano cómo falla la atención. Esa experiencia es lo que vuelve memorable la lección.

## Síntesis

La ventana de contexto es finita y, además, **degradable**: incluso cuando los tokens caben, el rendimiento cae a medida que crecen. Ese fenómeno —**Context Rot**— se ha medido empíricamente (Chroma, distancia de Levenshtein) y se manifiesta de forma especialmente cruda en el patrón de aguja en el pajar. La respuesta no es esperar modelos con ventanas más grandes, sino hacer **Context Engineering**: curar qué entra al prompt en cada turno, apoyarse en una memoria a largo plazo recuperable y mantener el contexto inmediato compactado. La calidad de un agente no se mide por cuánto puede recibir, sino por cuánto bien decide qué recibir.

## Preguntas de repaso

1. ¿Qué capas conviven dentro de la ventana de contexto en cada turno y por qué la pregunta importante no es «cuántos tokens caben» sino «cuántos quedan disponibles tras las capas fijas»?
2. Define **Context Rot** y explica por qué se considera una limitación arquitectural en lugar de un defecto puntual. ¿Qué consecuencia tiene esto para una estrategia que apueste solo por «más tokens»?
3. Describe brevemente el experimento de Chroma con la **distancia de Levenshtein**. ¿Qué conclusión práctica deja para el diseño de prompts y agentes?
4. ¿Por qué el patrón de **aguja en el pajar** es frágil? Enumera al menos tres consecuencias concretas de aplicarlo.
5. Diferencia entre apostar por una **ventana inmensa** y aplicar **Context Engineering**. ¿En qué casos concretos eso se nota en costo, latencia y calidad de la respuesta?
6. Si tu agente empieza a «olvidar» instrucciones del system prompt a medida que la conversación avanza, ¿qué hipótesis manejarías primero y qué acciones de Context Engineering aplicarías para mitigarlo?

## Recursos

- [Lost in the Middle: How Language Models Use Long Contexts](https://arxiv.org/abs/2307.03172) — estudio académico de referencia sobre degradación de atención en contextos largos.
- [Chroma — Context Rot research](https://www.trychroma.com/) — empresa que publicó el estudio mencionado en clase sobre degradación medida con distancia de Levenshtein.
- [Distancia de Levenshtein — Wikipedia](https://es.wikipedia.org/wiki/Distancia_de_Levenshtein) — métrica usada para cuantificar cuánto se aleja una salida del texto esperado.
- [Anthropic — Long context tips](https://docs.claude.com/en/docs/build-with-claude/prompt-engineering/long-context-tips) — buenas prácticas oficiales para prompts largos.
- Conexión interna: [Memoria en Agentes de IA: Fundamentos](./01-memoria-agentes-ia-fundamentos.md) — sesión 1 del módulo, base conceptual de memoria a corto/largo plazo.
