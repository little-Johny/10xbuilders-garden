---
title: "Memoria en Agentes de IA: Fundamentos"
week: 6
lesson: 1
tags: [agentes, memoria, contexto, ventana-de-contexto, compactacion, memoria-corto-plazo, memoria-largo-plazo, memoria-episodica, memoria-semantica, memoria-procedimental, llm]
date: 2026-05-12
status: done
---

# Memoria en Agentes de IA: Fundamentos

> **Síntesis.** Un modelo de lenguaje, en estado puro, no recuerda nada: cada llamada es una pizarra que se borra. La memoria de un agente no es una propiedad del modelo, sino una **arquitectura externa** que el sistema construye alrededor de él. Esa arquitectura se descompone en dos capas: la **memoria a corto plazo**, atada a la ventana de contexto de una sesión activa y limitada por tokens, y la **memoria a largo plazo**, persistente entre sesiones y organizada en tipos —episódica, semántica y procedimental— que cumplen funciones distintas. Diseñar la memoria de un agente es decidir qué información se conserva en el contexto inmediato, qué se compacta para no saturarlo, y qué se extrae de la conversación para guardarse de forma estructurada y recuperarse después. Sin esa decisión explícita, el agente nunca pasa de ser un chatbot amnésico.

## Introducción

La diferencia entre un chatbot que responde preguntas y un agente que acompaña al usuario a lo largo del tiempo no está en el modelo: está en lo que el sistema recuerda de él. Un LLM, por defecto, nace como una pizarra en blanco en cada invocación; no sabe qué se conversó hace cinco minutos, no reconoce al usuario que regresa al día siguiente, no aprende de sus propios errores entre sesiones. Toda continuidad —cualquier sensación de que el agente «sabe quién soy» o «se acuerda de lo que dije»— es una ilusión cuidadosamente construida por la capa que rodea al modelo. Esta lección introduce esa capa: cómo se piensa la memoria de un agente, qué se considera memoria a corto plazo y memoria a largo plazo, por qué la **ventana de contexto** impone límites que no pueden ignorarse, y qué estrategias existen para que el agente no pierda información crucial cuando esa ventana empieza a saturarse. Es la base conceptual sobre la que, en las próximas sesiones, se construirán implementaciones reales.

## Objetivos de aprendizaje

1. Explicar el concepto de **ventana de contexto** y sus limitaciones operativas en los agentes de IA, distinguiendo qué entra en ella y qué consecuencias tiene su tamaño finito.
2. Diferenciar las características y funciones de la **memoria a corto plazo** y la **memoria a largo plazo** en el diseño de agentes, entendiendo qué problema resuelve cada una.
3. Aplicar estrategias de **compactación** basadas en tokens, tiempo o eventos para optimizar la memoria a corto plazo durante una sesión activa sin perder información crítica.
4. Clasificar la información extraída de una conversación en memoria **episódica**, **semántica** o **procedimental** para decidir cómo y dónde almacenarla a largo plazo.
5. Diseñar la arquitectura básica de un agente que combine memoria a corto y largo plazo para generar interacciones personalizadas, coherentes y eficientes.

## Marco conceptual

### El LLM como pizarra: por qué la memoria es externa al modelo

Conviene partir de una idea que parece obvia pero suele pasarse por alto: un modelo de lenguaje no tiene memoria propia. Cada llamada al modelo es independiente; lo único que el modelo «sabe» en ese instante es lo que viaja dentro del prompt. Si en una conversación el usuario dice su nombre en el mensaje 1 y pregunta «¿cómo me llamo?» en el mensaje 50, el modelo solo podrá responder si los mensajes anteriores siguen viajando, completos o resumidos, en el prompt actual. No hay un compartimento interno donde el modelo «retenga» lo dicho.

Esto desplaza la pregunta del modelo al sistema. La memoria no se programa dentro del LLM; se **diseña alrededor de él**. El código del agente es el que decide qué se guarda, dónde se guarda, qué se inyecta en el próximo turno y qué se descarta. Pensar la memoria como una arquitectura externa es lo que permite diseñarla con criterio en lugar de esperar que «el modelo recuerde».

### La ventana de contexto: qué es y qué cabe en ella

La **ventana de contexto** es la cantidad máxima de tokens —unidades aproximadas a sílabas o palabras cortas— que el modelo puede procesar en una sola invocación. Es un límite duro, fijado por el modelo concreto que se utilice. Algunos modelos manejan ventanas de 8.000 tokens; otros, de 200.000; los más recientes llegan a 1.000.000 o más. Pero en todos los casos hay un techo.

Dentro de esa ventana convive todo lo que el modelo necesita para responder en ese turno: el **system prompt** que define el rol y las reglas, el **catálogo de tools** declarado, el **historial de mensajes** de la conversación, los **resultados de tools** que el agente haya invocado, y finalmente la **respuesta** que el modelo está generando. Cuanto más larga es la conversación, más tokens ocupa el historial, y menos espacio queda para todo lo demás. Cuando la suma supera el techo, el modelo simplemente falla o trunca lo más antiguo, perdiendo información que quizá era crítica.

Tres consecuencias operativas se derivan de esto. Primero, **los tokens cuestan**: la mayoría de proveedores cobra por tokens de entrada y de salida, así que un historial creciente es también una factura creciente. Segundo, **la latencia crece**: un prompt más largo tarda más en procesarse, y la experiencia del usuario se degrada. Tercero, **la atención del modelo se diluye**: aunque técnicamente quepa todo, los modelos no atienden por igual a cada parte del prompt, y la información relevante puede quedar enterrada entre ruido. Por todo esto, dejar que la ventana crezca sin control no es una opción aceptable en un agente serio.

### Memoria a corto plazo: la sesión activa

La **memoria a corto plazo** es lo que el agente recuerda *dentro de una misma sesión de conversación*. Operativamente, vive en la ventana de contexto: son los mensajes que viajan al modelo en cada turno. Su función es mantener la coherencia inmediata —que el agente entienda «hazlo otra vez» como referencia a la acción anterior, que no vuelva a preguntar lo que el usuario acaba de responder, que pueda razonar sobre el hilo de la conversación.

Su característica definitoria es la **volatilidad**: cuando la sesión termina —el usuario cierra la pestaña, el proceso se reinicia, la conversación se considera cerrada—, esa memoria desaparece a menos que el sistema haya decidido persistir algo de ella en otra capa. Es memoria de trabajo, no memoria duradera. Y al estar atada a la ventana de contexto, sufre todas sus limitaciones: tokens, costo, latencia y dilución de atención.

### Estrategias de compactación: tokens, tiempo y eventos

Cuando una conversación se alarga, el sistema necesita decidir cómo evitar que el contexto explote sin perder la información que importa. A ese proceso se le llama **compactación**: reemplazar bloques de historial por una versión más comprimida que preserve lo esencial. Hay tres criterios habituales para disparar la compactación, y no son excluyentes.

La compactación **basada en tokens** activa el proceso cuando el contexto alcanza un umbral predefinido —por ejemplo, el 70% u 80% de la ventana del modelo. Es la estrategia más predecible y la que mejor protege contra el truncamiento involuntario; su desventaja es que no atiende a la semántica de la conversación: puede compactar en un momento en el que el detalle reciente todavía era importante.

La compactación **basada en tiempo** se ejecuta cada cierto intervalo —cada N minutos de inactividad, al final del día, al cerrar la sesión. Es útil cuando se quiere resumir conversaciones completas para guardarlas a largo plazo, pero no protege en tiempo real frente al crecimiento del contexto en una sesión muy activa.

La compactación **basada en eventos** se dispara ante señales semánticas: cuando el usuario cambia de tema, cuando una tarea se completa, cuando se cierra un caso, cuando se cruza un hito explícito en la conversación. Es la más cara de implementar porque requiere detectar esos eventos, pero también la que mejor preserva la calidad informativa de la memoria.

En la práctica, las tres se combinan. Un agente bien diseñado puede compactar por tokens como red de seguridad, por eventos cuando se cierra una tarea, y por tiempo al final de la sesión para producir un resumen consolidable. Lo importante es que la compactación no se trata como un detalle de infraestructura sino como una **decisión de diseño**: qué se condensa, qué se conserva intacto y qué se descarta.

### Memoria a largo plazo: persistencia entre sesiones

La **memoria a largo plazo** vive *fuera* de la ventana de contexto. Es lo que el agente conserva entre sesiones distintas, en una base de datos, un almacén vectorial, un archivo estructurado o cualquier sistema persistente. Su rol no es mantener la coherencia inmediata sino habilitar la **continuidad** y la **personalización**: que el agente reconozca al usuario cuando vuelve, que recuerde sus preferencias, que aplique lo aprendido en interacciones pasadas.

A diferencia de la memoria a corto plazo, la memoria a largo plazo no se inyecta entera en cada prompt —eso sería inviable. Se inyecta **selectivamente**, recuperando solo los fragmentos relevantes para la consulta actual mediante búsquedas por similaridad semántica, por identificador de usuario, por etiquetas u otros criterios. El sistema actúa como un bibliotecario: el LLM pregunta algo, el bibliotecario localiza los registros pertinentes, y solo esos viajan a la ventana de contexto.

Esto introduce dos problemas de diseño que no aparecen en la memoria a corto plazo. Primero, **qué guardar**: no toda conversación produce información digna de persistirse, y guardar de más sobrecarga las búsquedas futuras. Segundo, **cómo recuperar**: la calidad de la memoria a largo plazo depende tanto de lo que se almacena como de la capacidad del sistema para traer lo correcto en el momento correcto.

### Tipos de memoria a largo plazo: episódica, semántica y procedimental

No toda la información que el agente persiste cumple la misma función, y mezclar todo en un único repositorio sin distinguir su naturaleza es una receta para una memoria confusa. La tradición —tomada prestada de la psicología cognitiva— distingue tres tipos.

La memoria **episódica** registra hechos concretos ocurridos en un momento concreto: «el 3 de mayo el usuario pidió cancelar su suscripción», «en la sesión anterior el agente le envió un correo a su jefa». Son eventos con tiempo, actores y consecuencias. Sirve para reconstruir lo que pasó y razonar sobre el historial; su criterio de almacenamiento es la **especificidad temporal**.

La memoria **semántica** registra hechos generales sobre el mundo del usuario: «el usuario es desarrollador backend», «trabaja con clientes en zona horaria CET», «prefiere respuestas concisas sin emojis». No están atados a un momento puntual; describen un estado que se asume estable hasta que algo lo contradiga. Sirve para personalizar la interacción de fondo; su criterio de almacenamiento es la **estabilidad**.

La memoria **procedimental** registra cómo hacer cosas en este contexto: instrucciones, flujos de trabajo, reglas operativas aprendidas, atajos que han funcionado en interacciones previas —«para reservar una reunión con este usuario, evita los lunes por la mañana». No describe el mundo sino las acciones del agente sobre él; su criterio de almacenamiento es la **utilidad operativa repetida**.

Clasificar una observación en una de estas categorías no es un ejercicio académico: determina dónde se guarda, cómo se indexa y cuándo se recupera. Un dato episódico mal clasificado como semántico puede llevar al agente a tratar un hecho puntual como una regla permanente; un dato procedimental que se almacena solo como episódico se pierde para futuras decisiones similares.

### Arquitectura mínima de un agente con memoria

Con las piezas anteriores se puede esbozar la arquitectura básica. La imagen que conviene fijar primero es topológica: la memoria a corto plazo vive **dentro** del agente, pegada al LLM; la memoria a largo plazo vive **fuera**, como un repositorio independiente al que el agente recurre selectivamente.

```
┌──────────────────────────────────────────────┐
│                   AGENTE                     │
│                                              │
│   ┌──────────────────────────────────────┐   │
│   │        Conversación actual           │   │
│   │        (Short term memory)           │   │
│   └──────────────────────────────────────┘   │
│                                              │
│   ┌──────────────────────────────────────┐   │
│   │                LLM                   │   │
│   └──────────────────────────────────────┘   │
└────────────────────┬─────────────────────────┘
                     │
                     │  Extrae si es necesario
                     ▼
          ┌──────────────────────────┐
          │      Recuerdos pasados   │
          │     (Long term memory)   │
          └──────────────────────────┘
```

Sobre ese esquema, el flujo dentro de cada turno se vuelve concreto. En cada turno, el agente parte del **prompt actual del usuario**. El sistema construye el contexto inyectando, en este orden, el **system prompt**, los **fragmentos de memoria a largo plazo** recuperados como relevantes para la consulta, el **resumen compactado** de los turnos antiguos de la sesión si la compactación ya ha actuado, y los **últimos turnos** literales para preservar la coherencia inmediata. Ese paquete es lo que llega al modelo.

Cuando el modelo responde, el agente hace dos cosas en paralelo. Por un lado, **actualiza la memoria a corto plazo** añadiendo el nuevo turno al historial de la sesión y, si corresponde, dispara una compactación si se cruzó algún umbral. Por otro, **decide qué extraer hacia la memoria a largo plazo**: revisa la interacción, clasifica los hallazgos en episódico, semántico o procedimental, y los persiste en el almacén correspondiente. Esta extracción puede hacerla un componente dedicado —incluso otro LLM— a partir del turno completo.

El resultado es un agente que en cada interacción tiene a su disposición tanto el detalle vivo de la conversación actual como el conocimiento acumulado de todas las anteriores, sin que ninguna de las dos capas crezca sin control.

### Conexión con la práctica posterior

Esta lección establece el vocabulario y los criterios. Las siguientes sesiones del módulo bajan al código: cómo implementar compactación real en un grafo de LangGraph, qué estructuras usar para persistir cada tipo de memoria, cómo conectar un almacén vectorial para recuperación semántica, y cómo evitar los antipatrones más comunes —guardar todo, recuperar de más, contaminar la memoria semántica con eventos episódicos. Tener clara la división conceptual antes de escribir el primer esquema de tabla es lo que permite que la implementación no se convierta en un cajón de sastre.

## Síntesis

La memoria de un agente no es una característica del modelo: es una arquitectura externa que el sistema construye y mantiene. Se divide en dos capas con problemas diferentes. La memoria a corto plazo vive en la ventana de contexto, garantiza la coherencia inmediata de la sesión, y necesita **estrategias de compactación** —por tokens, tiempo o eventos— para no desbordar el techo de tokens del modelo. La memoria a largo plazo vive fuera del contexto, habilita la continuidad y la personalización entre sesiones, y se organiza en tres tipos —**episódica, semántica, procedimental**— que se almacenan y recuperan de forma distinta. Un agente con memoria bien diseñada no es el que recuerda más, sino el que decide con criterio qué conservar, cómo comprimir lo que ya no cabe entero, y qué traer de vuelta en el momento exacto en que se necesita.

## Preguntas de repaso

1. ¿Por qué decimos que el LLM «no tiene memoria» y que toda memoria del agente es externa al modelo? ¿Qué consecuencia tiene esto para el diseño del sistema?
2. ¿Qué es la ventana de contexto y qué tipos de contenido conviven en ella en cada turno? Enumera al menos tres consecuencias operativas de su tamaño finito.
3. Diferencia memoria a corto plazo y memoria a largo plazo en términos de **dónde vive**, **qué problema resuelve** y **qué le ocurre al cerrar la sesión**.
4. Describe las tres estrategias de compactación (tokens, tiempo, eventos), indicando cuándo cada una es preferible y por qué en la práctica suelen combinarse.
5. Clasifica los siguientes datos como memoria episódica, semántica o procedimental y justifica la elección:
   - «El usuario prefiere respuestas en español».
   - «El 10 de mayo el usuario canceló el envío del informe».
   - «Para crear tickets en este cliente, primero hay que pedir el código de proyecto».
6. Esboza la arquitectura mínima de un agente con memoria: ¿qué se inyecta en el prompt en cada turno y en qué orden? ¿Qué pasos sigue el sistema después de recibir la respuesta del modelo?

## Recursos

- [LangGraph — Memory concepts](https://langchain-ai.github.io/langgraph/concepts/memory/)
- [OpenAI — Context window and token limits](https://platform.openai.com/docs/models)
- [Anthropic — Long context best practices](https://docs.claude.com/en/docs/build-with-claude/prompt-engineering/long-context-tips)
- Endel Tulving, *Episodic and semantic memory* (1972) — origen psicológico de la distinción que hoy reutilizan los sistemas de agentes.

