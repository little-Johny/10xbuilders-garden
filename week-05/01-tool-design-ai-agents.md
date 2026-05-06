---
title: "Diseño y uso de Tools en agentes de IA"
week: 5
lesson: 1
tags: [agentes, tools, function-calling, llm, json-schema, openrouter, postman, gemini, prompt-engineering, human-in-the-loop]
date: 2026-05-03
status: draft
---

# Diseño y uso de Tools en agentes de IA

> **Síntesis.** Una *tool* no es una función más en el código del agente: es la definición explícita de su **espacio de acción**. Cada herramienta que se añade amplía lo que el modelo puede hacer, pero también incrementa la carga cognitiva sobre la que decide. Diseñar bien una tool —su nombre, su descripción y su esquema de entrada— es lo que separa a un agente que actúa con precisión de uno que adivina y se equivoca.

## Introducción

Cuando se habla de un *agente* de IA, es tentador pensar que el modelo de lenguaje «hace cosas» por sí mismo: busca información, envía correos, consulta bases de datos. En realidad, el modelo no ejecuta absolutamente nada del mundo exterior; se limita a decidir, en lenguaje estructurado, qué acción debería ocurrir y con qué parámetros. Las **tools** son el puente entre esa decisión y la ejecución real, y entender ese puente es el paso previo —indispensable— a cualquier ensamblaje práctico de un agente. Esta lección sienta esa base conceptual: qué es una tool, cómo fluye una decisión a través de ella y qué reglas de diseño hacen que el modelo las use bien.

## Objetivos de aprendizaje

1. Definir qué es una *tool* en la arquitectura de un agente de IA y argumentar por qué su cantidad y claridad afectan la **carga cognitiva** del modelo.
2. Explicar la separación de responsabilidades entre el LLM (decisión) y el código del agente (ejecución), trazando el flujo completo de una invocación de herramienta.
3. Diseñar una tool efectiva configurando con criterio su nombre, su descripción y su **esquema de parámetros de entrada** en formato JSON.
4. Aplicar estrategias de manejo de errores que devuelvan al modelo retroalimentación útil para corregir parámetros y reintentar sin ayuda humana.

## Marco conceptual

### Qué es una tool y por qué define el «espacio de acción»

Una **tool** (herramienta) es una unidad de código —típicamente una función con un esquema de entrada bien definido— que un agente de IA tiene a disposición para interactuar con el mundo exterior. Buscar libros en una API, leer una fila de una base de datos, enviar un correo o crear un *issue* en GitHub son ejemplos canónicos. Lo importante no es que sean funciones; lo importante es que el conjunto de tools que se le declaran a un modelo configura, de forma explícita, el **espacio de acción** del agente: todo lo que puede llegar a hacer está contenido en ese catálogo, y nada de lo que no esté ahí es alcanzable por el sistema.

Esa formulación cambia el foco del diseño. La pregunta deja de ser «¿qué función necesito implementar?» y pasa a ser «¿qué capacidades quiero que el agente tenga, y cómo las describo para que el modelo elija cuándo usar cada una?». La tool es, en este sentido, una **interfaz de capacidades** dirigida a un consumidor particular —el LLM— que no la lee como código, sino como lenguaje natural.

### La analogía del control de videojuegos: carga cognitiva y elección

Una forma útil de pensar el catálogo de tools es como los botones de un control de videojuegos. Si el control tiene dos botones —saltar y correr— el jugador entiende sus opciones en segundos y rara vez se equivoca. Si el control tiene cincuenta botones con etiquetas parecidas, incluso un jugador experto duda, prueba combinaciones erróneas o se paraliza. Los LLMs son sistemas **no deterministas**: dada la misma entrada, pueden producir salidas distintas. Esa propiedad amplifica el efecto del catálogo: cuantas más herramientas dudosas o solapadas se ofrezcan, más se erosiona la fiabilidad de la decisión del modelo.

La conclusión práctica es que añadir una tool no es gratis. Cada nueva capacidad debe justificarse contra el costo de aumentar la **carga cognitiva** del sistema. Un agente con pocas herramientas bien delimitadas suele ser más predecible que uno con un arsenal amplio pero mal diferenciado.

### Flujo de ejecución: separación entre LLM y código del agente

Un malentendido extendido es creer que el LLM «llama» a la herramienta y obtiene su resultado. No es así. La separación de responsabilidades es estricta y conviene memorizarla: el **LLM decide** y el **código ejecuta**.

El ciclo típico transcurre así. El usuario emite una petición. El código del agente arma el contexto (mensajes previos más el catálogo de tools declaradas) y lo envía al modelo. El modelo evalúa la petición y, si concluye que necesita una herramienta, devuelve una **respuesta estructurada en JSON** que indica el nombre de la tool elegida y los parámetros con los que debe llamarse. El código del agente recibe ese JSON, valida los parámetros, ejecuta la función real (por ejemplo, una petición HTTP a una API externa) y obtiene un resultado. Ese resultado se reinserta como un nuevo mensaje en la conversación con el modelo, que ahora sí puede generar la respuesta final dirigida al usuario.

Un ejemplo concreto ayuda a fijar el flujo. Supongamos que el agente puede buscar libros en la API de Project Gutenberg y se prueba desde Postman contra un modelo como Gemini 3 expuesto vía Open Router. El usuario pide «títulos de James Joyce». El modelo responde, en lugar de un texto, un objeto JSON del estilo `{ "tool": "search_gutenberg_books", "arguments": { "search_terms": ["James Joyce"] } }`. El código del agente toma ese objeto, hace la petición real a Gutenberg, obtiene la lista de libros y se la devuelve al modelo como nuevo turno de conversación. Solo entonces el modelo redacta la respuesta en lenguaje natural que verá el usuario. En todo el recorrido, el LLM nunca tocó la red: solo razonó.

### Diseño de tools: nombre, descripción y esquema de entrada

Para que el modelo elija bien una herramienta, hay tres elementos manipulables que constituyen el **contrato** entre el agente y el modelo.

El **nombre** funciona como identificador semántico. Debe ser único, claro y no ambiguo: `search_gutenberg_books` describe sin esfuerzo qué hace y dónde busca; `search` o `get_data` obligan al modelo a inferir el alcance a partir del contexto, y esa inferencia es justo lo que se quiere evitar.

La **descripción** es, en la práctica, la pieza más importante del diseño y la que más se subestima. No es documentación dirigida al desarrollador, sino instrucciones operativas dirigidas al modelo: explica cuándo usar la tool, cuándo *no* usarla, qué clase de entrada espera y qué clase de resultado devuelve. Una descripción rica reduce la probabilidad de usos incorrectos; una descripción vacía o genérica delega esa decisión a la inferencia del modelo, que puede no coincidir con la intención del diseñador.

El **esquema de entrada** (input schema) define los parámetros de la herramienta en un formato como JSON Schema: tipos, propiedades obligatorias, restricciones y descripciones campo por campo. Cuanto más estrecho y explícito es el esquema, menos espacio queda para que el modelo *alucine* parámetros: por ejemplo, una propiedad `search_terms` declarada como `array` de `string` con su propia descripción —«lista de términos de búsqueda»— guía al modelo a estructurar correctamente la entrada. Parámetros laxos o descripciones ausentes son una invitación a recibir datos mal formados.

### Manejo de errores: devolver el fallo como contexto

En un flujo lineal, cuando una función falla se lanza una excepción y el proceso se detiene. En un agente de IA, esa estrategia desperdicia el potencial del bucle de razonamiento. La práctica avanzada es **capturar el error y devolverlo al modelo como parte del contexto**, formulado en lenguaje natural: «la búsqueda falló porque el formato de fecha es incorrecto: se esperaba `YYYY-MM-DD`».

Con esa retroalimentación, el modelo entiende qué salió mal, ajusta los parámetros y vuelve a intentarlo en el mismo ciclo, sin necesidad de intervención humana. Este patrón es lo que convierte al agente en un sistema **resiliente**: no se rompe ante el primer fallo de la herramienta, sino que aprende del fallo dentro del propio diálogo. La condición es que el mensaje de error sea suficientemente explícito; un genérico «error» no le permite al modelo razonar la corrección.

### Buenas y malas prácticas: la regla de la no-ambigüedad

La diferencia entre un catálogo de tools que funciona y uno que descarrila al modelo casi siempre se reduce a la **ambigüedad**. Las malas prácticas comparten un patrón reconocible: nombres genéricos (`buscar_datos`, `obtener_datos`), descripciones vacías o que solo repiten el nombre, esquemas de entrada con campos opcionales mal documentados, y solapamientos entre herramientas que hacen casi lo mismo.

Las buenas prácticas avanzan en la dirección opuesta: nombres ultra-específicos, descripciones que delimitan los casos de uso y los excluyen, esquemas de entrada estrictos con descripciones por campo, y un catálogo lo más reducido posible para el alcance del agente. La regla de oro que conviene memorizar y aplicar como criterio de revisión es directa: **si el modelo tiene que adivinar cómo usar tu herramienta, asume que adivinará mal**. Toda fricción en el contrato de la tool se paga, tarde o temprano, en decisiones erróneas del agente.

### Conexión con la práctica posterior

Esta lección es deliberadamente teórica. Las próximas clases del módulo aterrizan estos conceptos en código: estructurar el JSON real de las tools, declararlas en un endpoint compatible con *function calling*, orquestar el ciclo completo —decisión, ejecución, retorno de resultado, respuesta final— y validar el comportamiento extremo a extremo. Tener clara la separación de responsabilidades y los criterios de diseño antes de escribir esa primera definición es lo que permite que cada «botón en el control» del agente funcione como se espera.

## Síntesis

Las tools son la materialización del espacio de acción de un agente de IA. El LLM decide cuál usar y con qué parámetros; el código del agente las ejecuta y le devuelve el resultado al modelo para que continúe razonando. Como el modelo es no determinista, la calidad del catálogo importa tanto como la calidad del prompt: nombres precisos, descripciones operativas y esquemas de entrada estrictos reducen la ambigüedad y, con ella, la tasa de error. Sumar a esto un manejo de errores que retroalimente al modelo en lugar de detener el flujo da como resultado un agente verdaderamente autónomo y resiliente, listo para que en las siguientes lecciones se ensamble pieza por pieza.

## Preguntas de repaso

1. ¿Por qué decimos que el conjunto de tools declaradas a un agente define su «espacio de acción» y no es solo una colección de funciones auxiliares?
2. Describe el flujo completo de una invocación de herramienta separando lo que hace el LLM de lo que hace el código del agente, usando como ejemplo una búsqueda en la API de Project Gutenberg.
3. ¿Qué riesgos introduce un catálogo de tools demasiado amplio o con nombres parecidos en un sistema no determinista como un LLM?
4. ¿Cuál es el papel concreto de la **descripción** de una tool y por qué se considera más crítica que el propio nombre?
5. ¿Qué ventaja aporta devolverle al modelo el mensaje de error de una herramienta como contexto, en lugar de detener la ejecución cuando algo falla?

## Recursos

- Ejemplo de petición a Open Router con *function calling* (Postman):

  ```bash
  curl --location --request POST 'https://openrouter.ai/api/v1/chat/completions' \
    --header 'Authorization: Bearer <your-openrouter-api-key>' \
    --header 'Content-Type: application/json' \
    --data '{
      "model": "google/gemini-3-flash-preview",
      "messages": [
        {"role": "user", "content": "What are the titles of some James Joyce books?"}
      ],
      "tools": [
        {
          "type": "function",
          "function": {
            "name": "search_gutenberg_books",
            "description": "Search for books in the Project Gutenberg library",
            "parameters": {
              "type": "object",
              "properties": {
                "search_terms": {
                  "type": "array",
                  "items": {"type": "string"},
                  "description": "List of search terms to find books"
                }
              },
              "required": ["search_terms"]
            }
          }
        }
      ]
    }'
  ```

- [Guía oficial de OpenAI sobre Function Calling](https://platform.openai.com/docs/guides/function-calling)
- [Documentación de tools en Open Router](https://openrouter.ai/docs/features/tool-calling)
- [Project Gutenberg API](https://gutendex.com/)

## Notas personales

<!-- Observaciones propias, conexiones con otros temas, ideas. -->
