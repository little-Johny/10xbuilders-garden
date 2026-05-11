---
title: "Implementación end-to-end de tareas programadas"
week: 5
lesson: 6
tags: [cron, pg-cron, pg-net, supabase, scheduled-tasks, time-context, system-prompt, hitl, middleware, ngrok, telegram, determinism, tool-design]
date: 2026-05-10
status: draft
---

# Implementación end-to-end de tareas programadas

> **Síntesis.** Diseñar un agente proactivo es una cosa; conectarlo a un reloj real es otra. Esta lección recorre la construcción efectiva del pipeline: la migración que define `scheduled_tasks`, la tool `create_scheduled_task` que el agente expone al usuario, el bloque temporal que se inyecta en el `system prompt` para que el modelo entienda qué día es, el job de `pg_cron` que cada minuto golpea un endpoint de Next.js, y los dos obstáculos que aparecen cuando se ata todo en caliente: un middleware que redirige al login los POSTs del cron, y un Human in the Loop que bloquea ejecuciones que nadie está mirando. La conclusión transversal es de diseño: cuanto más específica es la herramienta del agente, más determinista es el resultado; los comandos genéricos como Bash, atractivos por su flexibilidad, sangran fiabilidad en contextos automatizados.

## Introducción

La lección anterior cerró con la arquitectura de un agente proactivo: una tool de agendamiento con HITL, una tabla con expresiones cron y un motor de tiempo que despierta al agente. Quedó en el plano del diseño. Esta lección lo aterriza en código que corre: una migración de Supabase, un endpoint en Next.js, un job de `pg_cron` enviando POSTs hacia ese endpoint a través de `pg_net`, y la pieza menos glamorosa pero más decisiva del proyecto, los dos parches que se descubren cuando el agente, una vez agendado, no se activa: el middleware que protege todas las rutas por defecto y el flujo de HITL que pausa las ejecuciones de cron porque no distingue al humano del cron job. Al construir esto sobre el agente que ya teníamos, aparece una pregunta de fondo sobre qué tipo de herramientas conviene darle: las muy genéricas que el modelo decide cómo usar, o las muy específicas que dejan poco margen pero responden igual cada vez.

## Objetivos de aprendizaje

1. Construir el camino completo entre una tool del agente y un disparo proactivo: tabla en Supabase, tool registrada en el catálogo, endpoint público en Next.js y cron job en `pg_cron` que conecta los dos extremos.
2. Inyectar fecha, hora y zona horaria del usuario al `system prompt` en cada turno para que el modelo pueda traducir expresiones relativas («mañana», «cada lunes a las 9am») a una `cron_expression` correcta.
3. Diagnosticar y resolver dos fallos clásicos al exponer un endpoint para automatización: redirecciones del middleware de auth y bloqueos del flujo HITL cuando la "petición" no viene de un humano.
4. Razonar la tensión entre herramientas genéricas y específicas como decisión de diseño, no como preferencia: cuándo una API dedicada vale el costo de implementarla frente al atajo de exponer Bash.

## Marco conceptual

### De la pizarra al pipeline: por qué la implementación se desvía del diseño

Entre el diseño y el código siempre hay deslizamientos, y este caso lo ilustra bien. La lección anterior asumía una tabla `cron_jobs` y una Edge Function de Supabase como ejecutor; la implementación real usa una tabla `scheduled_tasks` y un endpoint de Next.js `/api/scheduled-tasks/tick`. La razón no es estética sino práctica: el agente ya vive en Next.js, con todo su contexto —tools, integraciones, descifrado de tokens, grafo de LangGraph—, y mover esa ejecución a una Edge Function obligaba a replicar o reempaquetar todo eso fuera del repo principal. Mantenerlo en el mismo servidor reduce a un problema más manejable: cómo conseguir que `pg_cron` alcance ese endpoint y cómo autenticar esa llamada. La lección de fondo es que el diseño es un plano, no una atadura: cuando una pieza encaja peor que su alternativa, conviene reemplazarla y documentar la decisión.

### El contexto temporal como prerrequisito del agendamiento

Un modelo de lenguaje no sabe qué día es. Si el usuario dice «mañana a las 8», el modelo necesita resolver "mañana" contra una fecha base, y esa fecha base la tenemos que entregar nosotros. La forma más estable es **inyectar** un bloque temporal al principio del `system prompt` en cada turno: fecha y hora actual en formato ISO con offset, zona horaria del usuario y día de la semana. Sin ese bloque, el modelo opera ciego respecto al tiempo, y cualquier `cron_expression` que genere lo hace contra la fecha de corte de su entrenamiento, que muy probablemente no es hoy. Con el bloque presente, el modelo traduce «cada lunes a las 9am en Bogotá» a `0 9 * * 1` con `timezone: "America/Bogota"` y deja constancia explícita de la zona horaria asumida, evitando la ambigüedad de "9am, ¿de qué huso?". Esta inyección no es decorativa: es la pieza que hace que la tool de agendamiento sea utilizable.

### Anatomía de un cron job en Supabase: pg_cron + pg_net

Supabase ofrece dos extensiones de Postgres que, combinadas, convierten la base de datos en su propio planificador con capacidad de salir a la red. **`pg_cron`** registra trabajos asociados a una expresión cron; el propio Postgres los evalúa cada minuto y ejecuta el SQL configurado. **`pg_net`** expone funciones SQL para emitir peticiones HTTP, típicamente `net.http_post(url, headers, body)`. La combinación natural es un único job que cada minuto hace un `POST` al endpoint del servidor, idea que evita la necesidad de un servicio aparte que consulte la base. El job se registra una sola vez con `cron.schedule('scheduled-tasks-tick', '* * * * *', $$ ... $$)` y desde ese momento `pg_cron` se ocupa solo. La parte interesante es que el endpoint receptor es quien decide qué tareas están vencidas y las despacha: `pg_cron` no necesita saber nada del esquema de aplicación, solo que cada minuto toque la puerta.

### El endpoint /tick como bisagra entre el reloj y el agente

El endpoint que recibe esos POSTs juega un papel doble. Por un lado, valida una credencial sencilla —un header `x-cron-secret` que compara contra una variable de entorno— para impedir que cualquier visitante de internet active ejecuciones. Por otro, ejecuta la lógica que en el diseño teórico vivía en la Edge Function: consulta `scheduled_tasks` filtrando por `enabled=true`, `status='active'` y `next_execution <= now()`, y por cada fila vencida levanta el agente con la `description` como mensaje inicial. El hecho de vivir dentro del mismo servidor le permite reusar exactamente la misma función de construcción de contexto que usan el chat web y el webhook de Telegram, lo que garantiza que el agente proactivo no es "otra cosa" sino la misma máquina recibiendo un mensaje desde un canal distinto, el canal `scheduled`.

### El middleware como obstáculo silencioso

Aquí aparece el primer error de implementación que no estaba en el plano. Next.js tiene un middleware único que corre antes que cualquier ruta, y en este proyecto ese middleware redirige a `/login` cualquier petición sin sesión de usuario. Eso es perfectamente correcto para todo lo que viene de un navegador, pero rompe los endpoints invocados por servicios externos —`pg_cron`, el webhook de Telegram— que nunca tienen cookies. El síntoma es desconcertante: el endpoint parece "no recibir nada", cuando en realidad el middleware lo está respondiendo con un `307 Redirect` antes de que la ruta corra. La mitigación es declarar explícitamente qué prefijos de path son APIs públicas y dejarlas pasar; cada una debe llevar su propia autenticación —token de Telegram o `x-cron-secret` para el cron—. Una vez aplicada esa excepción, la siguiente vuelta del cron muestra logs y la integración respira.

### Bypass de HITL en ejecución autónoma

El segundo obstáculo es más conceptual. El agente se construyó con Human in the Loop pegado a las tools de riesgo: cuando el modelo decide invocar `create_scheduled_task`, `bash` o `edit_file`, el grafo se pausa y espera aprobación humana antes de ejecutar. Cuando el disparo viene de un cron, no hay humano del otro lado mirando el chat; el flujo se interrumpe, nadie aprueba, la tarea queda pendiente y al minuto siguiente el cron crea otra ejecución pendiente. La solución es introducir un eje nuevo en cada fila de `scheduled_tasks`: un booleano `autonomous`. Cuando es `false`, las tools de riesgo medio/alto siguen pidiendo confirmación —vía Telegram, ahora— porque tiene sentido que el dueño apruebe la creación de un issue o el envío de un email aunque la haya pedido en una agenda. Cuando es `true`, el ejecutor del cron salta el HITL del grafo y deja al agente correr sus tools sin pausa, útil para tareas read-only o cuya `description` ya describa de manera autocontenida qué se hará. La elección no es "automatización vs control", es declarar por adelantado en qué tareas el control queda absorbido en el momento de agendarlas y en cuáles se diluye en cada disparo.

### Determinismo: herramientas específicas frente a comandos genéricos

Un patrón que se repite tras conectar todo es que las herramientas más fiables son las más restringidas. Una tool `create_scheduled_task` con un `parameters_schema` que exige `name`, `description`, `cron_expression` y `timezone` deja al modelo poco lugar donde fallar: la `cron_expression` se valida con `cron-parser` antes de persistir y la `next_execution` se calcula con la misma librería. Una tool `bash` con un solo parámetro de texto libre es flexible al punto del peligro: en una ejecución autónoma sin humano, una construcción de comando defectuosa se traduce en un error de shell que la tarea registra como fallo y al rato se desactiva. La conclusión práctica es que el costo de implementar una API específica —diseñar el schema, validar parámetros, mapear errores legibles— rinde más en automatización proactiva que en chat interactivo: en chat, el humano corrige al vuelo; en cron, nadie corrige. Las tools que el agente va a usar despierto solo importan más cuanto menos haya quien las supervise.

## Guía práctica: construir el pipeline end-to-end

### Preparación

Antes de empezar conviene tener el agente corriendo localmente con la integración de Telegram funcional desde la lección anterior, un túnel de **ngrok** apuntando al puerto de Next.js para que Supabase pueda alcanzar el endpoint desde la nube, y acceso al SQL Editor de Supabase para habilitar extensiones y registrar el cron. También conviene generar un secret aleatorio —`openssl rand -hex 32`— y dejarlo a mano para usarlo de credencial entre `pg_cron` y el endpoint.

### Paso 1: Migración de la tabla y registro de la tool

La migración crea `scheduled_tasks` con los campos que aparecen en el código real: `id`, `user_id`, `name`, `description`, `cron_expression`, `timezone`, `start_at`, `end_at`, `last_execution`, `next_execution`, `enabled`, `autonomous`, `notification_channels`, `status` y `failure_count`. Un índice parcial sobre `next_execution` filtrado por `enabled=true` y `status='active'` mantiene barato el escaneo del barrido. Las políticas de Row Level Security restringen a cada usuario a sus propias filas; el endpoint del cron usa la **service role** para saltarse RLS y operar en nombre de cualquier dueño.

La tool `create_scheduled_task` se registra en el catálogo del agente con `risk: "medium"` y un schema que exige los cuatro parámetros esenciales —`name`, `description`, `cron_expression`, opcionalmente `timezone`, `start_at`, `end_at` y `autonomous`—. El handler valida la `cron_expression` con `cron-parser`, calcula `next_execution` con la misma librería, traduce la expresión a prosa con `cronstrue` en español para la tarjeta de confirmación, y persiste la fila al recibir la aprobación. Hay que asegurarse de que la tool esté **habilitada explícitamente** desde la interfaz de configuración del usuario, no solo declarada en el catálogo: el usuario decide qué tools del agente activa, y mientras esté apagada no aparecerá en el listado del modelo.

### Paso 2: Inyectar contexto temporal en el system prompt

En la función que construye el contexto del agente —el helper compartido por todos los canales—, se antepone al `system_prompt` del usuario un bloque que detalla la fecha y hora actual con offset, la zona horaria del usuario y el día de la semana. La fecha se formatea con `Intl.DateTimeFormat` pidiendo la zona horaria de `profiles.timezone` (`America/Bogota`, `UTC`, lo que cada usuario tenga). El bloque termina con una indicación explícita al modelo: que use ese contexto para resolver expresiones relativas y que interprete las `cron_expression` en la zona horaria del usuario salvo que este indique otra. Una vez añadido, preguntarle al agente desde Telegram «¿qué hora y fecha es ahora?» debe devolver el valor inyectado, no una respuesta vaga.

### Paso 3: Habilitar pg_cron + pg_net y registrar el job

Desde el SQL Editor de Supabase se habilitan ambas extensiones con `create extension if not exists pg_cron` y `create extension if not exists pg_net`. Acto seguido se registra un único job de barrido que corre cada minuto:

```sql
select cron.schedule(
  'scheduled-tasks-tick',
  '* * * * *',
  $$
    select net.http_post(
      url     := 'https://TU_NGROK.ngrok-free.app/api/scheduled-tasks/tick',
      headers := jsonb_build_object(
                   'Content-Type', 'application/json',
                   'x-cron-secret', 'EL_VALOR_DE_CRON_SECRET'
                 ),
      body    := '{}'::jsonb
    );
  $$
);
```

La verificación es inmediata: `select * from cron.job` debe mostrar la fila recién creada, y al minuto siguiente `select * from cron.job_run_details order by start_time desc limit 5` debe mostrar `status='succeeded'` con un `return_message` que no sea un error de red ni un 401. Si la URL de ngrok cambia tras reiniciar el túnel, hay que ejecutar `cron.unschedule('scheduled-tasks-tick')` y volver a registrar el job con la nueva.

### Paso 4: Abrir el endpoint en el middleware y bypassear HITL para tareas autónomas

Si el job de `pg_cron` aparece como `succeeded` en `cron.job_run_details` pero no se ve actividad en los logs de Next.js, el middleware está respondiendo con un redirect. La corrección vive en el archivo de middleware: definir una lista de prefijos públicos —típicamente `/api/telegram/webhook` y `/api/scheduled-tasks/tick`— y dejarlos pasar sin redirigir al login cuando no hay sesión de usuario. Cada uno se autentica por su cuenta: el de Telegram con su `x-telegram-bot-api-secret-token`, el del cron con el `x-cron-secret` definido por nosotros.

Dentro del propio endpoint `/tick`, cuando llega el momento de levantar el agente para una tarea con `autonomous=true`, se invoca el grafo con una opción que indica explícitamente saltarse las pausas de HITL en este turno. El resultado es que el agente, despierto sin humano, ejecuta sus tools sin pedir confirmación. Para las tareas con `autonomous=false`, el flujo se mantiene: si el agente decide una acción de riesgo, el grafo se interrumpe, la tarjeta de aprobación llega por Telegram al chat del dueño y la acción solo se concreta cuando alguien la aprueba.

### Validación end-to-end

Una vez todo conectado, la prueba decisiva es pedirle al agente desde Telegram «*agéndame una tarea cada minuto que me diga la hora actual*». El agente extrae `cron_expression: "* * * * *"`, muestra la tarjeta con la traducción «cada minuto», el usuario aprueba, la fila aparece en `scheduled_tasks`. Al siguiente cambio de minuto, `pg_cron` dispara, `pg_net` POSTea al endpoint, el middleware deja pasar, el endpoint identifica la tarea vencida, levanta el agente con la `description`, el agente responde y la respuesta llega a Telegram sin que nadie haya escrito. Conviene desactivar la tarea —`update scheduled_tasks set enabled=false where id=...`— una vez visto el flujo, para no llenar el chat con minutos.

## Síntesis

El salto de un agente reactivo a uno proactivo se completa cuando el reloj de la base de datos sabe cómo despertar al servidor que sabe cómo despertar al agente. Esa cadena, sencilla en el diagrama, exige resolver tres asuntos que en la lección de diseño no eran tan evidentes: que el modelo necesita un bloque temporal explícito en cada turno para razonar sobre fechas, que el middleware por defecto bloquea los disparos automatizados a menos que se le indique lo contrario, y que el flujo HITL —pensado para un humano en el chat— necesita una excepción declarada por tarea cuando ese humano no está. Resueltos esos tres puntos, el agente entra en otro modo de operación: la mitad del trabajo deja de pasar por la conversación y empieza a pasar por el calendario. Y a partir de ahí, la conversación sobre cómo se diseñan las tools cambia, porque la fiabilidad de cada herramienta se vuelve más visible cuando nadie está al lado para corregirla.

## Preguntas de repaso

1. ¿Por qué inyectar la fecha y la zona horaria en el `system prompt` no es un detalle estético sino un prerrequisito para que la tool de agendamiento sea utilizable? ¿Qué clase de errores se previenen y qué clase quedan sin cubrir?
2. Describí el flujo completo desde que el job de `pg_cron` evalúa que una tarea está vencida hasta que la respuesta llega al usuario por Telegram. Mencioná qué pieza valida la credencial del cron y qué pieza decide si saltar HITL.
3. Tu endpoint `/api/scheduled-tasks/tick` parece no recibir las llamadas: `pg_cron` reporta `succeeded` pero no hay logs del servidor. ¿Qué archivos del proyecto revisarías primero y qué prueba harías para confirmar la hipótesis antes de cambiar código?
4. Explicá el rol del campo `autonomous` en `scheduled_tasks`. ¿Qué riesgos abre ponerlo en `true` y qué tipos de tareas justifican el trade-off?
5. La lección sostiene que las herramientas específicas dan más determinismo que las genéricas. Eligí una tarea concreta que se podría implementar con `bash` o con una API específica y comparalos en tres ejes: superficie de error, legibilidad para el modelo y comportamiento en una ejecución autónoma sin humano.

## Recursos

- [Supabase — extensión `pg_cron`](https://supabase.com/docs/guides/database/extensions/pg_cron)
- [Supabase — extensión `pg_net` para llamadas HTTP desde la base](https://supabase.com/docs/guides/database/extensions/pg_net)
- [crontab.guru — visualizar y construir expresiones cron](https://crontab.guru/)
- [cron-parser (npm) — validación y cálculo de próxima ejecución](https://www.npmjs.com/package/cron-parser)
- [cronstrue (npm) — traducción humana de expresiones cron](https://www.npmjs.com/package/cronstrue)
- [ngrok — túneles HTTPS para exponer un servidor local a internet](https://ngrok.com/docs)
- Implementación real en este monorepo: migración `projects/10x-builders-agent/packages/db/supabase/migrations/00005_scheduled_tasks.sql`, endpoint `projects/10x-builders-agent/apps/web/src/app/api/scheduled-tasks/tick/`, tools en `projects/10x-builders-agent/packages/agent/src/tools/cron-utils.ts`, contexto temporal en `projects/10x-builders-agent/apps/web/src/lib/agent/load-context.ts`, middleware en `projects/10x-builders-agent/apps/web/src/lib/supabase/middleware.ts`, notificaciones en `projects/10x-builders-agent/packages/agent/src/notifications/`. Documento operativo del proyecto: `projects/10x-builders-agent/docs/scheduled-tasks.md`.

## Notas personales

<!-- Observaciones propias, conexiones con otros temas, ideas. -->
