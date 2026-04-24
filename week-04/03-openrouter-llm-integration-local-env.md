---
title: "Integración del LLM vía OpenRouter en el entorno local"
week: 4
lesson: 3
tags: [open-router, llm, api-key, env-local, variables-entorno, seguridad, tokens, monitoreo, langchain, langgraph, contexto, herramientas, pruebas]
date: 2026-04-22
status: done
---

# Integración del LLM vía OpenRouter en el entorno local

> **Síntesis.** Con el backend de Supabase en marcha y el onboarding completado, al agente le falta lo esencial: la voz. Conectarlo a un modelo de lenguaje a través de OpenRouter —con una API Key acotada por límite de gasto, inyectada como variable de entorno y activada tras reiniciar el servidor local— es el paso que transforma la app de un cascarón funcional en un agente que razona, recuerda y usa herramientas. Hacerlo bien implica entender tanto el enrutamiento técnico como la higiene de seguridad que rodea a una credencial de API.

## Introducción

Las dos lecciones previas dejaron la infraestructura lista: un monorepo organizado, una base de datos con identidad y sesiones, un agente personalizado en el onboarding. Pero al abrir la interfaz web y escribirle al agente, la respuesta aún no llega: falta la pieza que convierte los mensajes del usuario en lenguaje generado. Esa pieza es el modelo, y el camino para llegar a él en este proyecto pasa por OpenRouter. Esta lección recorre ese último tramo de configuración: generar y asegurar la clave, integrarla al entorno local sin exponerla, reiniciar el servidor para que la app la vea, y validar —con dos pruebas concretas sobre la interfaz— que la cadena completa (Supabase → LangGraph → OpenRouter → modelo) está operando como se espera.

## Objetivos de aprendizaje

1. Explicar por qué **OpenRouter** actúa como intermediario único frente a múltiples proveedores de LLM y qué ventajas operativas se derivan de ese diseño.
2. Generar una **API Key** en OpenRouter aplicando un límite de gasto semanal y comprender por qué ese tope es una defensa crítica contra errores de código y bucles de agente.
3. Integrar la clave de forma segura como **variable de entorno** en el proyecto local, respetando las reglas que evitan filtrarla al repositorio.
4. Reiniciar el servidor de desarrollo tras modificar el archivo de entorno y verificar el correcto funcionamiento del agente mediante pruebas de contexto y de herramientas en la interfaz web.

## Marco conceptual

### OpenRouter como enrutador unificado hacia los LLMs

Un **LLM** (*Large Language Model*) es un sistema de inteligencia artificial entrenado sobre grandes volúmenes de texto para comprender y generar lenguaje humano. En un proyecto real conviven a menudo varios candidatos —GPT-4o mini, Claude, Gemini— y cada uno vive detrás de su propia API, con su propio SDK, su propia facturación y su propia forma de autenticarse. Coordinar esa multiplicidad desde la aplicación es un problema de integración, no solo de calidad de respuestas.

**OpenRouter** resuelve ese problema poniéndose en el medio: es una plataforma intermediaria que expone, bajo una interfaz única, el acceso a modelos de distintos proveedores. La aplicación deja de necesitar una cuenta separada en cada uno; basta con una sola credencial —una **API Key**, es decir, una clave secreta que identifica a la aplicación frente al servicio externo— para invocar cualquier modelo disponible en el catálogo de OpenRouter. El beneficio no es solo administrativo: cambiar de modelo para experimentar con otro proveedor pasa a ser una modificación de configuración, no una refactorización de integración.

### Generar la API Key con límite de gasto como red de seguridad

Crear la clave en el panel de OpenRouter es mecánico, pero el paso crítico del proceso es lo que muchas plataformas permiten y pocas personas configuran: establecer un **límite de gasto** asociado a la clave. Fijar, por ejemplo, un tope de 10 USD semanales convierte a la credencial en un instrumento acotado por diseño, no dependiente de la disciplina del desarrollador.

La razón práctica de este cuidado es concreta. Un agente de IA construido sobre LangChain y LangGraph puede, ante un error lógico, entrar en un bucle que invoque al modelo de forma repetida —cada llamada cuesta dinero. Sin un tope, un bug en un nodo del grafo o una condición de parada mal definida pueden traducirse en una factura desproporcionada antes de que alguien lo note. El límite en la clave es una última red de seguridad: aunque el código falle, el gasto no puede cruzar ese umbral.

### Las claves no viven en el código, viven en el entorno

Una vez emitida, la clave necesita llegar a la aplicación sin ser escrita dentro del código fuente. La solución estándar son las **variables de entorno**: valores parametrizables que el proceso lee al arrancar y que se mantienen fuera del repositorio. En este proyecto se almacenan en un archivo `.env.local`, que queda listado en `.gitignore` precisamente para que nunca se suba al repositorio remoto.

La motivación no es estética. Una API Key filtrada en un repositorio público es un incidente real y frecuente: bots automatizados escanean GitHub en busca de claves expuestas y las consumen en cuestión de minutos. El límite de gasto mitiga el daño, pero la primera línea de defensa es que la clave nunca aparezca en el historial de Git. Por la misma razón, incluso en un repositorio privado conviene tratar al `.env.local` como material sensible: no se comparte en chats, no se copia en capturas, no se incluye en exports. Cada modificación del archivo de entorno, además, exige detener el servidor y volver a ejecutarlo, detalle técnico del que se ocupa la siguiente subsección.

### Tokens, monitoreo y el panel como fuente única de verdad

Toda interacción con un LLM se mide en **tokens**: unidades básicas en las que el modelo descompone el texto para procesarlo, equivalentes a fragmentos entre una sílaba y una palabra corta. Cada petición consume tokens de entrada (el prompt) y de salida (la respuesta), y la facturación de los proveedores se calcula sobre esa métrica.

El panel de OpenRouter centraliza la visibilidad sobre ese consumo. Permite ver, casi en tiempo real, cuántas peticiones hizo el agente, qué modelo usó cada una, cuántos tokens se consumieron y cuánto costó cada llamada. Esa observabilidad es valiosa por dos razones que se refuerzan. La primera es económica: identificar rápido una consulta que se disparó en costo ayuda a ajustar el prompt o el modelo antes de que el patrón se vuelva sistémico. La segunda es de seguridad operacional: si el número de llamadas crece de forma anómala, el panel lo evidencia antes de que el límite de gasto se active por sí solo. En arquitecturas donde varios componentes invocan al modelo, tener un único lugar donde mirar todo el tráfico es lo que hace viable escalar sin perder el control.

### El error técnico más común: el servidor que no ve la nueva clave

Una aplicación local carga las variables de entorno una sola vez, en el momento de arrancar el proceso. Si el servidor de desarrollo ya está corriendo cuando se añade `OPENROUTER_API_KEY` al archivo `.env.local`, ese proceso seguirá operando con la foto de entorno que tomó al iniciar —una foto donde la clave todavía no existe— y las llamadas a OpenRouter fallarán con errores de autenticación.

La mitigación es trivial pero fácil de olvidar: detener el servidor con `Ctrl + C` y volver a levantarlo con el comando de desarrollo. Solo entonces el proceso releerá el archivo y la clave estará disponible en tiempo de ejecución. Este paso pertenece al mismo tipo de reglas que desbloquean horas de depuración cuando se conocen y generan horas de frustración cuando se ignoran. Conviene incorporarlo como reflejo: toda modificación de `.env.local` implica reinicio del servidor, sin excepciones.

### Validar con dos pruebas concretas en la interfaz

Con la clave cargada y el servidor reiniciado, la verificación no se apoya en logs sino en el comportamiento observable del agente en la interfaz web. Dos preguntas bien elegidas alcanzan para confirmar que las tres capas —memoria, razonamiento y herramientas— están conversando entre sí.

La primera es una **prueba de contexto**: preguntarle al agente por el nombre del usuario. Si responde correctamente, significa que los datos guardados durante el onboarding en Supabase están llegando al LLM como parte del prompt o de la memoria de conversación que LangGraph inyecta al grafo. Una respuesta genérica ("no sé tu nombre") no indica un problema del modelo, sino una desconexión entre la capa de datos y la capa generativa.

La segunda es una **prueba de herramientas**: pedirle al agente que enumere las capacidades o herramientas que tiene disponibles. Si responde con la lista correcta —la que LangChain y LangGraph le declararon al modelo como tools— confirma que la integración funciona en las dos direcciones: el modelo recibió la descripción de las herramientas, las entendió, y sabe cuándo invocarlas. En conjunto, ambas pruebas son un humo-test rápido que cubre la ruta completa: de la base de datos al razonamiento y del razonamiento al repertorio de acciones.

## Síntesis

Integrar OpenRouter es, en apariencia, un trámite de tres pasos: crear una clave, pegarla en un archivo, reiniciar el servidor. Pero cada uno de esos pasos encapsula una decisión de diseño con consecuencias duraderas. El límite de gasto protege el proyecto de sus propios errores; la variable de entorno protege la credencial de filtrarse al mundo; el reinicio del servidor protege al desarrollador de perder horas persiguiendo un fallo inexistente; y las pruebas en la interfaz confirman, con evidencia observable, que todas las capas construidas en las lecciones previas convergen en un agente que ya razona y actúa. A partir de aquí, el sistema deja de ser andamiaje y empieza a comportarse como el producto.

## Preguntas de repaso

1. ¿Qué ventajas operativas aporta OpenRouter frente a integrar directamente el SDK de un proveedor de LLM, y cómo simplifica el reemplazo de modelo en el futuro?
2. ¿Por qué es una buena práctica configurar un límite de gasto al emitir una API Key en OpenRouter y qué tipo de fallos mitiga concretamente ese tope?
3. ¿Qué función cumplen las variables de entorno en `.env.local` y qué riesgos aparecen si una API Key termina versionada en el repositorio?
4. ¿Por qué es necesario reiniciar el servidor de desarrollo después de modificar el archivo de entorno, y qué síntoma aparece cuando se omite este paso?
5. ¿Qué confirma cada una de las dos pruebas sugeridas —preguntar el nombre del usuario y pedir la lista de herramientas— sobre la salud de la integración agente-modelo?

## Notas personales

- En el contexto del curso **LAB10**, el instructor proporcionó las API Keys directamente a través de la plataforma del curso, así que no tuve que entrar a OpenRouter para gestionar la clave por mi cuenta. El paso de "generar y acotar la clave" quedó entonces como conocimiento de referencia para cuando trabaje con un proyecto propio.
- Al probar el agente noté que ya cuenta con **guardrails**: al preguntarle por información sensible no la revela, sino que rechaza la consulta. Buena señal de que la capa de seguridad del prompt de sistema está haciendo su trabajo.
