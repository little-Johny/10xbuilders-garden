---
title: "Diseño de tareas programadas para agentes más autónomos"
week: 5
lesson: 5
tags: [cron, pg-cron, supabase, scheduled-tasks, proactividad, autonomia, hitl, tool-first-design, notificaciones, telegram, multicanal]
date: 2026-05-05
status: draft
---

# Diseño de tareas programadas para agentes más autónomos

> **Síntesis.** Un agente reactivo solo actúa cuando el humano escribe; un agente proactivo actúa también cuando llega la hora. La pieza que habilita ese salto es una tool `create_cron_job` con la que el agente registra su propia agenda, una tabla `cron_jobs` que persiste esas intenciones expresadas como **expresiones cron**, y un motor interno —`pg_cron` en Supabase— que cada minuto revisa qué toca y reactiva al agente con la descripción de la tarea. Sin un Human in the Loop al momento de agendar, esa misma capacidad se transforma en un bucle de eventos alucinados que consume recursos hasta romperlo todo; con HITL, se vuelve la diferencia entre un chatbot y un asistente con calendario.

## Introducción

Todos los flujos del agente que hemos construido hasta ahora arrancan con un mensaje humano: alguien escribe en el chat o en Telegram, el grafo corre, devuelve una respuesta y se duerme. Esa simetría es cómoda pero limitada: si quiero el resumen de noticias todos los días a las ocho de la mañana, alguien tiene que pedírselo todos los días a las ocho. Esta lección rompe esa simetría agregando un eje temporal independiente del usuario. El agente ahora puede agendar trabajo futuro, persistirlo en la base de datos y delegar a un planificador interno la responsabilidad de despertarlo cuando llegue el momento. El estilo de interacción cambia: dejamos de tener un chatbot que responde y empezamos a tener un asistente que también, sin que se lo pidamos, **avisa**.

## Objetivos de aprendizaje

1. Explicar qué significa **proactividad** en un agente de IA y qué piezas de infraestructura la diferencian de la operación reactiva por chat.
2. Diseñar una tool `create_cron_job` que permita al agente registrar tareas futuras, con un Human in the Loop obligatorio en el momento de la creación.
3. Modelar una tabla `cron_jobs` en Supabase con los campos mínimos —nombre, descripción, frecuencia como expresión cron, última ejecución— y entender por qué las expresiones cron son el lenguaje natural para describir frecuencia.
4. Configurar **`pg_cron`** sobre Postgres en Supabase como el motor que despierta al agente cuando una tarea está vencida, sin intervención humana.
5. Conceptualizar la entrega de resultados a través de canales —empezando por Telegram— y el reto de extender ese mecanismo a múltiples canales seleccionables por el usuario.

## Marco conceptual

### Reactivo, proactivo y por qué la diferencia se nota en producción

Un agente **reactivo** vive dentro de un ciclo de petición y respuesta: alguien escribe, el grafo corre, vuelve la respuesta, fin. Su modelo de ejecución es síncrono y depende por completo del humano para arrancar. Un agente **proactivo** suma a ese ciclo un segundo eje: el tiempo. Las acciones ya no se disparan solo cuando alguien las pide, sino cuando una marca temporal se cumple. La consecuencia operativa es que la arquitectura cambia: necesitamos un sitio donde guardar las intenciones que aún no se han ejecutado, un planificador que sepa cuándo llegan, y un mecanismo de entrega que devuelva el resultado al usuario aunque este no esté frente al chat. Lo que parecía un cambio sutil —"que el agente avise solo"— pone tres piezas nuevas en la mesa: catálogo de intenciones, motor de tiempo y canal de salida.

### La analogía del asistente con agenda y reloj

Imaginemos a un asistente personal humano. Si solo es reactivo, dependemos de llamarlo cada mañana a las ocho para pedirle el resumen del día. Si le entregamos dos artefactos —una **agenda** donde anotar y un **reloj** que vigile las horas—, el asistente cambia de forma. Anota en la agenda *"leer noticias todos los días a las ocho"*, espera al reloj, ejecuta cuando suena la alarma y nos manda un mensaje con el resumen ya hecho. Las dos piezas son indispensables y simétricas: una agenda sin reloj se queda en planes, un reloj sin agenda no sabe a quién despertar. En el sistema que vamos a montar, la agenda es la tabla `cron_jobs` en Supabase y el reloj es `pg_cron`.

### Tool-first design: empezar por la capacidad y construir hacia adentro

El enfoque que adopta la clase es de **diseño guiado por herramientas**: la primera pieza no es la tabla ni el cron, es una tool nueva en el catálogo del agente. Esa tool, llamada `create_cron_job`, captura la intención —"el usuario quiere algo todos los días a las ocho"— y deja para más tarde la pregunta de cómo se persiste y cómo se ejecuta. La razón de invertir el orden tradicional —donde primero se diseña la base de datos y luego se la expone— es práctica: la tool es el contrato entre el modelo y el sistema, y empezar por ella obliga a definir desde el principio qué información necesita el modelo entregar para que el agendado tenga sentido (nombre legible, descripción operativa, frecuencia en cron, canal de notificación). Una vez claro ese contrato, la tabla y el motor se diseñan para servirlo.

### HITL al agendar como freno contra el bucle alucinado

La proactividad sin control humano es peligrosa de un modo distinto al ejecutar Bash. Aquí el riesgo no es que un comando malicioso destruya un archivo, sino que el agente, en una conversación ambigua, genere **decenas de tareas que no debería haber creado**: tareas duplicadas, tareas con frecuencias absurdas —cada minuto— o tareas recursivas que generan más tareas. Sin un freno, ese error escala silenciosamente y consume recursos hasta que alguien lo descubre. La mitigación obligatoria es declarar `create_cron_job` como tool de **alto riesgo**, lo que conecta automáticamente con el flujo de Human in the Loop visto en la lección 3: cada vez que el agente quiere agendar, el grafo se interrumpe, la interfaz muestra al usuario el detalle —qué tarea, con qué frecuencia, en qué canal— y solo cuando el humano aprueba se persiste la fila en `cron_jobs`. La ejecución posterior, una vez agendada, se hace sin más confirmación: el filtro está al inicio, no en cada disparo.

### La tabla `cron_jobs` y por qué una expresión cron es el lenguaje correcto

La tabla mínima necesita pocos campos pero todos importan: un identificador, un `name` legible, una `description` que el agente recibirá como contexto cuando se le invoque, una `cron_expression` con la frecuencia, un `last_run_at` para saber si la tarea ya corrió en este ciclo, un `enabled` para pausarla sin borrarla y un `user_id` para que la ejecución cargue los permisos correctos. La pieza interesante es la `cron_expression`: cinco campos —minuto, hora, día del mes, mes, día de la semana— que describen patrones temporales con una precisión que un campo libre tipo "todos los días a las ocho" jamás alcanzaría. Y aquí ocurre algo afortunado: los modelos de lenguaje **entienden y producen expresiones cron de forma nativa**, porque están en su corpus de entrenamiento. Cuando el usuario dice "todos los lunes a las nueve", el modelo escribe `0 9 * * 1` sin necesidad de helper alguno. El campo `cron_expression` es el punto de mayor compresión semántica de toda la tabla.

### `pg_cron` como motor de tiempo dentro de Supabase

Un planificador externo —un servicio aparte que consulta nuestra DB cada minuto— funcionaría, pero suma una pieza móvil. La alternativa que ofrece Supabase es **`pg_cron`**, una extensión de Postgres que permite registrar trabajos cron *dentro* de la propia base de datos. La extensión se activa una vez por proyecto y desde ese momento Postgres mismo se ocupa de evaluar, cada minuto, qué jobs tienen su expresión cron vencida y ejecutar el SQL asociado. Para nuestro caso, ese SQL no hace el trabajo del agente directamente —Postgres no sabe correr LLMs—; lo que hace es invocar una **función de borde** —una Edge Function de Supabase o un endpoint HTTP del propio servidor de la app— pasando el `id` del job. Esa función carga el contexto del usuario, descifra los tokens necesarios, levanta el grafo del agente y ejecuta la tarea como si fuera un mensaje cualquiera, solo que el "mensaje" es la `description` guardada en la fila. El resultado vuelve a la DB y se entrega por el canal configurado.

### Ejecución desacoplada del usuario y la pregunta del canal de salida

La diferencia más sutil entre un disparo reactivo y uno proactivo es que en el segundo **no hay un humano del otro lado del chat esperando la respuesta**. Si el agente termina la tarea y emite un mensaje al canal por defecto, lo más probable es que ese mensaje caiga en un sitio donde nadie lo ve. La consecuencia de diseño es que cada tarea programada necesita declarar su **canal de entrega**: Telegram al chat vinculado, un correo electrónico, un mensaje en Slack, un webhook a otro sistema. La primera versión razonable es soportar un único canal —Telegram— porque ya tenemos esa integración en pie de la lección anterior; la versión madura permite al usuario configurar por tarea o por usuario qué canal prefiere, y eventualmente cuál es el canal de respaldo si el primario falla.

### Reactivo y proactivo conviviendo

Conviene cerrar el marco con una observación de arquitectura: el agente proactivo **no reemplaza** al reactivo, lo extiende. El mismo grafo, las mismas tools, la misma memoria de sesión por hilo. Lo único que cambia es **quién** dispara la corrida y **dónde** aterriza la respuesta. Eso significa que la inversión hecha en HITL para Bash o `edit_file` se reutiliza tal cual cuando una tarea programada decide editar un archivo: aunque el agente se haya despertado solo, si la acción que quiere ejecutar es de alto riesgo, el grafo seguirá pausándose y notificando al usuario por el canal vinculado para pedir aprobación, igual que en una conversación normal.

## Guía práctica: agregar `create_cron_job` y `pg_cron` al agente

### Preparación

Antes de empezar conviene confirmar que el proyecto en Supabase tiene la extensión `pg_cron` disponible —en Supabase se activa desde el panel de Database → Extensions o con `CREATE EXTENSION IF NOT EXISTS pg_cron;` desde el SQL Editor— y que la integración con Telegram de la lección anterior está funcionando, porque el primer canal de entrega va a apoyarse en ella. También conviene tener decidido el dominio público —o el túnel ngrok— al que `pg_cron` invocará la Edge Function: sin un endpoint accesible desde el motor de la base de datos, los disparos no tienen a dónde llegar.

### Paso 1: Migración de la tabla `cron_jobs`

Se crea una migración que define la tabla con los campos mínimos —`id`, `user_id`, `name`, `description`, `cron_expression`, `last_run_at`, `enabled`, `channel`— y habilita Row Level Security con políticas por `user_id`, igual que el resto de las tablas del proyecto. La columna `cron_expression` es de tipo texto y no se valida en la base —la validación vive en el handler de la tool, donde es más fácil devolver un error legible al modelo si la expresión es sintácticamente incorrecta—.

### Paso 2: Tool `create_cron_job` con HITL

Se añade la entrada al catálogo declarándola como `risk: "high"` y con un `parameters_schema` que exige `name`, `description`, `cron_expression` y `channel`. El adapter en `adapters.ts` es un handler limpio —sin `createToolCall`— porque la tool es high-risk y la persistencia del *pending* la maneja el `toolExecutorNode` antes del `interrupt`. El `summariseToolCall` recibe un caso nuevo que renderiza la tarjeta de confirmación como prosa: "agendar `<name>` con frecuencia `<cron_expression>` (próxima ejecución: <traducción legible>)" para que el humano pueda decidir sin tener que descifrar la expresión cron mentalmente. Cuando se aprueba, el handler escribe la fila en `cron_jobs`.

### Paso 3: Edge Function que ejecuta una tarea por id

Se escribe una Edge Function en `supabase/functions/run-cron-job/index.ts` que recibe un `job_id` por POST, consulta la tabla, carga el contexto del usuario dueño —tokens descifrados igual que en el flujo de chat—, levanta el grafo de LangGraph con la `description` del job como mensaje inicial y deja que el agente ejecute. Al terminar, escribe el `last_run_at` y emite el resultado por el canal correspondiente —en la primera versión, un mensaje de Telegram al chat vinculado—. La función debe ser idempotente respecto al `job_id` durante el mismo minuto, para que un disparo doble por error no produzca dos ejecuciones.

### Paso 4: Programar el barrido con `pg_cron`

Con la Edge Function desplegada se registra el trabajo de barrido en `pg_cron`. La idea es un único job que corre cada minuto y consulta `cron_jobs` para detectar las filas cuya expresión cron debe haber disparado en este minuto y cuya `last_run_at` aún no llega a ese marco. Por cada fila vencida, se invoca la Edge Function con su `job_id` —Supabase ofrece `pg_net` para hacer llamadas HTTP desde dentro de Postgres—. El job de `pg_cron` se registra una sola vez con `cron.schedule('* * * * *', $$ ... $$)` y desde ese momento queda activo sin más intervención.

### Paso 5: Probar de extremo a extremo

La validación natural es agendar una tarea trivial con frecuencia inmediata. Pedirle al agente desde Telegram: "*agéndame una tarea que cada minuto me diga la hora actual*". El agente invoca `create_cron_job` con `cron_expression: "* * * * *"`, el grafo se interrumpe, el humano aprueba, y la fila queda en la tabla. En el siguiente cambio de minuto, `pg_cron` detecta la tarea vencida, llama a la Edge Function, esta levanta el agente con la `description` de la tarea, el agente responde y el resultado llega a Telegram sin que nadie esté escribiendo en el chat. Una vez visto el flujo, conviene desactivar la tarea —`enabled = false`— para no llenar el chat con minutos.

### Paso opcional: extender a múltiples canales

Como reto de diseño se plantea soportar más de un canal de entrega. Las preguntas a resolver no son tanto técnicas como de modelo: ¿se guarda la preferencia por usuario o por tarea?, ¿qué pasa si el canal preferido falla —se intenta el siguiente o se registra el fallo y ya?—, ¿cómo se manejan tokens distintos para cada canal y su rotación? La respuesta práctica es introducir una tabla `notification_channels` por usuario y permitir que `cron_jobs.channel` apunte a un id de esa tabla; la Edge Function elige el cliente correcto en tiempo de ejecución y deja constancia en una tabla de auditoría de qué canal entregó qué tarea cuándo.

## Síntesis

La proactividad no es un *feature* de un componente, es una propiedad emergente de tres piezas que encajan: una **tool** con HITL para que el agente declare intenciones futuras sin que pueda crear bucles por sí solo, una **tabla** que persiste esas intenciones con expresiones cron como lenguaje compartido entre el modelo y la base de datos, y un **motor de tiempo** —en este caso `pg_cron`— que las despierta cuando corresponde y delega la ejecución a una función que vuelve a montar el grafo del agente con todo su contexto. El reactivo y el proactivo no se excluyen, se acumulan: el mismo agente que responde una pregunta en el chat puede estar generando, en paralelo, el resumen de noticias que el usuario no le pidió pero que sí agendó hace una semana. Lo más interesante del salto es que el costo de pasar de "asistente que responde" a "asistente que también avisa" es relativamente pequeño cuando la base —catálogo, HITL, integraciones— ya está construida.

## Preguntas de repaso

1. Diferenciá un agente reactivo de uno proactivo en términos de lo que cambia en la arquitectura y de lo que cambia en la experiencia del usuario. Da un caso de uso donde la proactividad sea claramente preferible.
2. ¿Por qué `create_cron_job` debe ser una tool de alto riesgo con HITL obligatorio en el momento de agendar y no en cada ejecución posterior? Pensá en qué errores se previenen poniendo el filtro al inicio.
3. Explicá por qué una expresión cron es un lenguaje más conveniente que un texto libre tipo *"todos los días a las ocho"* para guardar la frecuencia. ¿Qué le aporta esa elección al modelo y a la base de datos?
4. Describí el rol de `pg_cron` y el de la Edge Function en el flujo proactivo. ¿Por qué `pg_cron` no ejecuta el agente directamente y necesita la función como intermediaria?
5. Tu agente, sin que se lo pidieran, agendó por error tres tareas duplicadas que se ejecutan cada minuto. Sin tocar la tool, ¿qué cambios harías sobre la tabla `cron_jobs` para detectarlas y desactivarlas, y qué le agregarías al flujo de creación para que esto no vuelva a pasar?

## Recursos

- [Supabase — extensión `pg_cron`](https://supabase.com/docs/guides/database/extensions/pg_cron)
- [Supabase — Edge Functions](https://supabase.com/docs/guides/functions)
- [crontab.guru — visualizar y construir expresiones cron](https://crontab.guru/)
- [Supabase — extensión `pg_net` para llamadas HTTP desde la base](https://supabase.com/docs/guides/database/extensions/pg_net)
- Implementación previa relevante en este monorepo: HITL con `interrupt`/`resume` en `projects/10x-builders-agent/packages/agent/src/graph.ts` y catálogo de tools en `projects/10x-builders-agent/packages/agent/src/tools/catalog.ts`.

## Notas personales

<!-- Observaciones propias, conexiones con otros temas, ideas. -->
