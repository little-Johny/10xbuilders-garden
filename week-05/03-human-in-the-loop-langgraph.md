---
title: "Implementación de Human in the Loop en LangGraph"
week: 5
lesson: 3
tags: [langgraph, human-in-the-loop, hitl, interrupt, resume, triage, supabase, postgres, checkpointer, bash, seguridad, aprobaciones, telegram]
date: 2026-05-03
status: draft
---

# Implementación de Human in the Loop en LangGraph

> **Síntesis.** Las herramientas le dan al agente la capacidad de actuar sobre el mundo real; el patrón **Human in the Loop (HITL)** es lo que impide que esa capacidad se vuelva contra nosotros. En LangGraph se materializa con dos primitivas —`interrupt` y `resume`— y un **checkpointer** sobre Postgres que persiste el estado durante la pausa. Sumando un esquema de **triage** por nivel de riesgo, el agente puede leer libremente y, al mismo tiempo, esperar aprobación humana antes de ejecutar acciones sensibles como un comando de Bash.

## Introducción

Hasta ahora hemos visto cómo declarar tools y cómo el grafo comparte estado entre nodos. La pregunta que abre esta lección es complementaria: si el agente tiene capacidad de actuar sobre la terminal, sobre la base de datos o sobre APIs externas, ¿qué evita que ejecute la acción equivocada en el momento equivocado? La respuesta práctica es el patrón **Human in the Loop**, y la respuesta técnica en LangGraph se llama **interrupt + resume sobre un checkpointer persistente**. El módulo culmina construyendo una herramienta de Bash —deliberadamente peligrosa— que solo se ejecuta tras una aprobación explícita del usuario desde la interfaz web o Telegram.

## Objetivos de aprendizaje

1. Explicar qué es **Human in the Loop** y por qué es necesario en agentes con herramientas que producen efectos externos.
2. Implementar el ciclo HITL en LangGraph con los comandos **`interrupt`** y **`resume`**, entendiendo qué hace cada uno y cómo se relacionan.
3. Configurar un **checkpointer** sobre Postgres (Supabase) para persistir el estado del grafo durante la pausa y poder reanudarlo sin pérdida de contexto.
4. Diseñar un sistema de **triage** que clasifique las tools por nivel de riesgo y dispare la interrupción solo cuando corresponda.
5. Construir una **tool de Bash** de alto riesgo y validar el flujo completo —pausa, aprobación humana desde Telegram o web, reanudación— con comandos reales.

## Marco conceptual

### Qué es Human in the Loop y por qué es innegociable con tools

**Human in the Loop (HITL)** es un patrón de interacción en el que una persona interviene en puntos críticos del proceso de decisión de un sistema automatizado. Aplicado a un agente de IA, no significa supervisar cada paso —eso anularía la utilidad del agente— sino interceptar las acciones cuyas consecuencias son **costosas, irreversibles o sensibles**: escribir en una base de datos, modificar un repositorio, enviar un correo, ejecutar un comando en la terminal.

La razón de fondo es que un LLM es un sistema no determinista que, en presencia de prompts ambiguos o adversariales, puede decidir mal. Con una tool de solo lectura, decidir mal cuesta tiempo. Con una tool de escritura o ejecución, decidir mal puede costar datos, dinero o integridad del sistema. HITL no busca eliminar la autonomía del agente; la **acota**: lecturas sin fricción, escrituras con confirmación.

### Triage como middleware: el semáforo del agente

Una manera útil de visualizar el patrón es pensar en el agente como un viajero pasando por una **aduana**. Cada vez que pide ejecutar una acción, llega a un control que evalúa el «riesgo» del paquete que lleva. Si la tool está clasificada como bajo riesgo —una búsqueda, una lectura— pasa directo. Si es de riesgo medio o alto, el semáforo se pone en amarillo: el flujo se detiene, el aduanero —el humano— recibe la notificación con los detalles de la acción propuesta y solo cuando contesta «verde» el agente continúa.

En código, ese semáforo es un **middleware** entre el nodo del modelo y el nodo de ejecución de la tool. Lee el nivel de riesgo declarado en el catálogo (recordemos: el catálogo es la capa de definición que vimos en la lección anterior), decide si interrumpir y, en caso afirmativo, dispara el `interrupt`.

### Manejo del estado durante la pausa: por qué no basta con detener

Una intuición errónea es que pausar al agente equivale a matar el proceso y arrancarlo de nuevo cuando llegue la aprobación. Eso destruiría toda la **memoria de trabajo** que vimos en la lección anterior: los mensajes, los resultados intermedios, las decisiones del modelo, todo el `state`. La aprobación humana puede tardar minutos —incluso horas, si llega por Telegram— y durante ese tiempo el servidor puede reiniciarse, escalarse o liberar memoria.

LangGraph resuelve este problema **serializando el estado del grafo** justo antes de la pausa y guardándolo en una base de datos. Cuando llega la aprobación, recupera ese estado idéntico y reanuda el grafo desde el nodo donde se detuvo, sin que el modelo tenga que repetir su razonamiento. El componente que orquesta este guardado es el **checkpointer**.

### Persistencia con Postgres en Supabase

El checkpointer de LangGraph es un componente sustituible. Para desarrollo se puede usar uno en memoria, pero para que la pausa sobreviva reinicios y escale entre instancias hace falta un almacenamiento real. La opción que adopta este proyecto es **Postgres a través de Supabase**: el mismo motor relacional que ya guarda el historial de conversación se reutiliza como respaldo del checkpointer del grafo.

La consecuencia es que la memoria del agente queda anclada a una transacción ACID. Si la herramienta interrumpida es una operación bancaria simulada y el servidor se cae cinco minutos después de pedir la aprobación, al volver no hay trabajo perdido: la conversación, los pasos previos y la propia tool a punto de ejecutarse están exactamente como estaban. El checkpointer es la pieza que convierte una ergonomía bonita en un sistema **resiliente** de verdad.

### Anatomía de `interrupt` y `resume`

El ciclo HITL en LangGraph se sostiene sobre dos primitivas. **`interrupt`** se invoca dentro de un nodo cuando se detecta una acción que requiere aprobación: detiene la ejecución del nodo, emite un evento al exterior con la información necesaria para que el humano decida —nombre de la tool, argumentos, contexto— y delega al checkpointer la persistencia del estado. Desde fuera, esto se ve como una respuesta del agente del estilo «quiero ejecutar X con argumentos Y, ¿confirmas?».

**`resume`** es la contraparte: lo inyecta el código del agente cuando recibe la decisión del humano por la interfaz —un botón de la web, un callback de Telegram— transportando esa decisión (aprobado, rechazado, modificado) hasta el grafo. LangGraph reactiva el nodo pausado, le entrega esa decisión y deja que el grafo continúe. Si la respuesta fue «aprobado», la tool se ejecuta. Si fue «rechazado», el nodo emite un mensaje de tool-result equivalente a «el usuario no autorizó la acción» y el modelo retoma el control para responder al usuario sin haber ejecutado nada.

### Cursor y LangGraph al diseñar tools de riesgo

Cursor, con su asistente de IA y el MCP de la documentación de LangChain configurado en la lección anterior, acelera el andamiaje de una tool nueva: la firma del handler, la importación correcta del decorador o helper, el uso del `config`. Pero la **clasificación de riesgo** sigue siendo una decisión humana: ningún asistente puede saber por nosotros si una tool de escritura en GitHub merece riesgo medio o alto, o si un comando de Bash debe estar permitido en absoluto. Esa decisión vive en el catálogo y es la que enchufa la tool al middleware de triage.

### Advertencias: el caso particular de Bash

Darle a un agente la capacidad de ejecutar comandos arbitrarios en la terminal es, sin exageración, una de las decisiones más peligrosas que se pueden tomar. Una mala interpretación, una inyección de prompt o un comando descuidado pueden borrar archivos, filtrar secretos, abrir conexiones salientes o cambiar el estado del sistema operativo. La mitigación obligatoria son tres condiciones combinadas: clasificar la tool como **alto riesgo**, exigir HITL **siempre** antes de ejecutar, y dejar la tool desactivada por defecto detrás de un *flag* explícito —en este proyecto, la variable de entorno `ALLOW_BASH_TOOL`— de modo que su sola activación sea una decisión consciente y reversible.

## Guía práctica: tool de Bash con HITL

### Preparación

Antes de empezar conviene confirmar que la base está en pie. La instancia de Supabase debe estar activa y las variables de conexión configuradas, porque el checkpointer va a escribir ahí. La interfaz por la que se aprobará —web local o bot de Telegram— debe estar arrancada y conectada al backend del agente. Y el grafo de LangGraph debe compilar limpio antes de tocar nada: si ya hay errores, sumar HITL solo los enmascara.

### Paso 1: Configurar la interrupción en el grafo

En el archivo principal del grafo se identifica el **Tool Node**: el nodo que ejecuta las herramientas que el modelo eligió. Antes de ese nodo se inserta la lógica de triage que lee el `riskLevel` del catálogo para la tool seleccionada. Si el riesgo es medio o alto, se dispara `interrupt` con la información que la interfaz necesita mostrar al usuario (nombre de la tool, argumentos, descripción legible). La validación rápida es enviar un prompt cualquiera que dispare la tool y comprobar que el grafo se detiene y que aparece una nueva fila en la tabla de checkpoints en Supabase.

### Paso 2: Crear la tool de Bash y registrarla como alto riesgo

Se crea un módulo nuevo —en este proyecto, `packages/agent/src/tools/bash-exec.ts`— con la función que ejecuta el comando recibido y devuelve la salida como texto. La tool se declara en el `catalog.ts` con un nombre claro (`bash_executor`), una descripción que advierte explícitamente del alcance, un esquema de entrada con un único parámetro `command: string`, y la marca de **alto riesgo** que la enchufa al middleware de triage. Adicionalmente, el handler comprueba el flag `ALLOW_BASH_TOOL` antes de ejecutar nada: si no está activo, devuelve un error legible al modelo en lugar de correr el comando.

A modo de referencia, el contrato conceptual luce así (Python, equivalente al patrón usado en el proyecto en TypeScript):

```python
@tool("bash_executor", return_direct=False)
def bash_executor(command: str) -> str:
    """Ejecuta comandos bash en el sistema local. ALTO RIESGO."""
    # Lógica de subprocess, con validación previa de ALLOW_BASH_TOOL
    ...
```

### Paso 3: Probar el flujo completo con comandos reales

Con todo en su sitio, se manda al agente un prompt de baja peligrosidad pero ilustrativo: «listame los archivos del directorio actual». El agente decide invocar `bash_executor` con `command: "ls"`, el middleware detecta el alto riesgo, el grafo se interrumpe y la interfaz —Telegram o web— muestra la solicitud de aprobación. Al pulsar «aprobar», el código emite el `resume` correspondiente, el nodo retoma, el comando se ejecuta y la salida vuelve al modelo, que redacta la respuesta final.

La segunda prueba es más significativa: pedirle al agente que haga una petición HTTP con `curl` hacia un webhook de captura (por ejemplo, un endpoint de pruebas en webhook.site). El ciclo se repite: pausa, aprobación, reanudación, ejecución, respuesta. Verificar que la petición llegó al webhook confirma que el agente realmente tocó la red, y observar que el hilo de conversación mantiene el contexto previo confirma que el checkpointer hizo su trabajo.

### Paso opcional: comandos paralelos

Como reto adicional se puede pedir al agente que ejecute dos comandos de Bash en paralelo en el mismo turno. Aquí aparecen preguntas de diseño no triviales: ¿se aprueba cada comando por separado o como un bloque?, ¿qué pasa si uno se aprueba y el otro se rechaza?, ¿cómo se mantiene la coherencia del estado mientras hay múltiples interrupciones vivas? El ejercicio sirve para entender los límites del patrón antes de llevarlo a un caso real con múltiples acciones simultáneas.

## Síntesis

El patrón Human in the Loop convierte al agente en una herramienta a la que se le puede confiar capacidad de acción real. En LangGraph se concreta con tres piezas que encajan: un middleware de triage que decide cuándo interrumpir según el riesgo declarado en el catálogo, las primitivas `interrupt` y `resume` que pausan y reanudan el grafo, y un checkpointer sobre Postgres en Supabase que conserva el estado mientras se espera la decisión humana. Cuando todo eso se aplica a una tool tan delicada como `bash_executor`, el resultado es un agente que puede listar archivos o disparar peticiones cURL en la terminal, pero solo cuando el usuario lo aprueba explícitamente desde la web o desde Telegram. El humano deja de ser un cuello de botella para volverse exactamente lo que debe ser: el freno de emergencia.

## Preguntas de repaso

1. ¿Por qué decimos que HITL no elimina la autonomía del agente sino que la acota? Da un ejemplo de tool que no debería pasar por triage y otra que sí.
2. Describe paso a paso qué hace LangGraph entre el momento en que se invoca `interrupt` y el momento en que el código emite `resume` con la decisión del usuario.
3. ¿Qué problema concreto resuelve el checkpointer sobre Postgres que un checkpointer en memoria no resuelve? Pensá en escenarios de fallo o de tiempos de aprobación largos.
4. Explicá por qué la tool `bash_executor` debe combinar tres mitigaciones —catálogo de alto riesgo, HITL obligatorio y flag `ALLOW_BASH_TOOL`— en lugar de quedarse solo con una de ellas.
5. ¿Qué problema de diseño aparece cuando el agente intenta ejecutar dos comandos de Bash en paralelo y cómo afecta esto al sistema de aprobaciones?

## Recursos

- [Human-in-the-loop en LangGraph](https://langchain-ai.github.io/langgraphjs/concepts/human_in_the_loop/)
- [LangGraph: persistencia y checkpointers](https://langchain-ai.github.io/langgraphjs/concepts/persistence/)
- [Postgres checkpointer (`@langchain/langgraph-checkpoint-postgres`)](https://github.com/langchain-ai/langgraphjs/tree/main/libs/checkpoint-postgres)
- [Webhook.site — capturar peticiones HTTP de prueba](https://webhook.site)
- Implementación real en este monorepo: `projects/10x-builders-agent/packages/agent/src/tools/{catalog.ts, adapters.ts, bash-exec.ts}`

## Notas personales

<!-- Observaciones propias, conexiones con otros temas, ideas. -->
