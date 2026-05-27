# Tareas programadas

Permite que el agente ejecute prompts de forma recurrente: el usuario describe la tarea en lenguaje natural y especifica una `cron_expression`. Un job de pg_cron en Supabase llama cada minuto al endpoint `/api/scheduled-tasks/tick`, que arranca al agente en una sesión aislada y notifica el resultado por los canales configurados (MVP: Telegram).

Documento hermano: `plan.md` (decisiones de diseño y trade-offs).

## Cómo se usa desde el chat

El usuario habla en lenguaje natural. El agente traduce a una `cron_expression` y crea la tarea, mostrando una tarjeta HITL con la traducción humanizada antes de persistirla.

Ejemplos:

- "Programa cada lunes a las 9 de la mañana un resumen de mis issues abiertos en GitHub" → cron `0 9 * * 1`, descripción = el prompt original.
- "Mañana a las 8am recuérdame revisar el calendario" → cron diario + `end_at` para que solo dispare una vez.
- "Cada hora durante esta semana, revisa nuevos PRs en `mi-repo`" → cron `0 * * * *` + `end_at` al final de la semana.

Tools disponibles (todas detrás del gate `ALLOW_SCHEDULED_TASKS_TOOL`):

| Tool | Risk | Descripción |
|---|---|---|
| `create_scheduled_task` | medium | Crea una tarea. Pide HITL antes de persistir. |
| `list_scheduled_tasks` | low | Lista las tareas del usuario, filtro opcional por status. |
| `update_scheduled_task` | medium | Activa/desactiva por id sin eliminar (conserva historial). Pide HITL. |
| `delete_scheduled_task` | high | Elimina permanentemente. Pide HITL. |

## Schema de la tabla `scheduled_tasks`

| Columna | Tipo | Default | Descripción |
|---|---|---|---|
| `id` | uuid | `uuid_generate_v4()` | PK. |
| `user_id` | uuid | — | FK a `profiles.id`, on delete cascade. |
| `name` | text | — | Etiqueta corta. |
| `description` | text | — | **Prompt** que el agente recibirá como mensaje cada disparo. |
| `cron_expression` | text | — | Cron 5-campos. Validado al crear con `cron-parser`. |
| `timezone` | text | null | IANA. Si null, se usa `profiles.timezone` (default `UTC`). |
| `start_at` | timestamptz | null | No disparar antes de. |
| `end_at` | timestamptz | null | No disparar después de. |
| `last_execution` | timestamptz | null | Última vez disparada. Participa en CAS. |
| `next_execution` | timestamptz | null | Precomputado al crear y al disparar. Index parcial. |
| `enabled` | boolean | true | Apagar sin borrar. |
| `autonomous` | boolean | false | Si true, salta HITL en cada disparo. |
| `notification_channels` | text[] | `{telegram}` | Canales de notificación. |
| `status` | text | `'active'` | `active` / `paused` / `completed` / `failed`. |
| `failure_count` | integer | 0 | Llega a 5 → `status='failed'`. |
| `created_at`, `updated_at` | timestamptz | now() | — |

RLS: solo el dueño (`auth.uid() = user_id`) puede leer/escribir. El endpoint `/tick` usa **service role** y se salta RLS.

## Cron expression: formato soportado

Estándar de 5 campos (sin segundos): `minuto hora día-mes mes día-semana`.

| Expresión | Significado |
|---|---|
| `* * * * *` | Cada minuto. |
| `*/5 * * * *` | Cada 5 minutos. |
| `0 9 * * 1` | Lunes 9:00. |
| `0 9 * * 1-5` | Lunes a viernes 9:00. |
| `0 0 1 * *` | Primer día del mes a medianoche. |
| `30 14 * * 0` | Domingos 14:30. |

Validación en runtime: `evaluateCron()` en `packages/agent/src/tools/cron-utils.ts`. Si la expresión es inválida, `create_scheduled_task` devuelve `{ ok: false, error }` para que el modelo pueda re-intentar; si una expresión válida al crearse luego falla en el tick (caso muy raro), la tarea pasa a `status='failed'`.

## Modo `autonomous` vs HITL

**`autonomous=false` (default)**: cuando el cron dispara, si el agente decide invocar una tool medium/high (p.ej. `github_create_issue`), se interrumpe y envía la tarjeta de aprobación al usuario por Telegram. La ejecución real ocurre solo tras aprobar.

**`autonomous=true`**: el grafo nunca se interrumpe; el agente ejecuta tools de cualquier riesgo en cada disparo. Útil para:

- Tareas read-only ("resúmeme mis issues").
- Tareas con `description` muy específica donde ya validaste el comportamiento.

Cuándo NO usar `autonomous=true`:

- Cualquier tarea que cree, modifique o elimine recursos externos sin que la `description` defina exactamente qué.
- Tareas nuevas sin observar al menos un disparo en modo no-autónomo.

Aunque autónoma, la ejecución queda auditada en `tool_calls` con `status='executed'` y `result_json` para inspección posterior.

## Canales de notificación

MVP: solo Telegram. Arquitectura abstraída en `packages/agent/src/notifications/`:

- `types.ts` — interfaces (`NotificationChannelAdapter`, `NotificationPayload`).
- `telegram.ts` — adapter que resuelve `chat_id` desde `telegram_accounts` y envía mensajes/teclados de confirmación.
- `index.ts` — registry + `dispatchNotification(channels, userId, db, payload)`.

### Cómo añadir un canal nuevo (ej. email)

1. Crear `packages/agent/src/notifications/email.ts` exportando un objeto que cumpla `NotificationChannelAdapter`. El método `send(userId, db, payload)` debe resolver el destino (consultar tabla con email del usuario), renderizar el `payload` y enviar.
2. Añadir `'email'` al union `NotificationChannel` en `packages/types/src/index.ts`.
3. Registrar el adapter en `notifications/index.ts`:
   ```ts
   const REGISTRY: Record<NotificationChannel, NotificationChannelAdapter> = {
     telegram: telegramAdapter,
     email: emailAdapter,
   };
   ```
4. Añadir `'email'` al enum del schema de `create_scheduled_task` en `catalog.ts` y `adapters.ts`.

`dispatchNotification` ignora canales sin adapter con un warning, así que tareas existentes con `notification_channels=['email']` no rompen el endpoint del cron antes del paso 3.

## Setup paso a paso de Supabase Cron

### 1. Habilitar las extensiones

Desde **Supabase Dashboard → Database → Extensions**:

- Activar `pg_cron`.
- Activar `pg_net`.

Alternativa por SQL (Editor → New query):

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
```

En Supabase managed esto está soportado de fábrica. En Postgres self-hosted, `pg_cron` requiere `shared_preload_libraries = 'pg_cron'` en `postgresql.conf` y reinicio.

### 2. Generar el secret

```bash
openssl rand -hex 32
```

Pegar el valor en `apps/web/.env.local`:

```
CRON_SECRET=...el_valor_generado...
ALLOW_SCHEDULED_TASKS_TOOL=true
```

Reiniciar el dev server (`npm run dev`).

### 3. (Producción) Configurar las mismas vars en el provider

En Vercel/Fly/etc. añadir `CRON_SECRET`, `ALLOW_SCHEDULED_TASKS_TOOL=true`, y todas las que ya estaban (Supabase, OpenRouter, Telegram).

### 4. Registrar el job en pg_cron

Desde **Supabase Dashboard → SQL Editor**, ejecutar **una vez**:

```sql
select cron.schedule(
  'scheduled-tasks-tick',
  '* * * * *',
  $$
    select net.http_post(
      url     := 'https://TU_DOMINIO/api/scheduled-tasks/tick',
      headers := jsonb_build_object(
                   'Content-Type', 'application/json',
                   'x-cron-secret', 'PEGAR_AQUI_EL_VALOR_DE_CRON_SECRET'
                 ),
      body    := '{}'::jsonb
    ) as request_id;
  $$
);
```

En **dev local con ngrok**, `TU_DOMINIO` es la URL pública del túnel (ej. `https://abc123.ngrok-free.app`). Si reinicias ngrok y cambia la URL, ejecuta `cron.unschedule` + `cron.schedule` con la nueva.

### 5. Verificar que el job está registrado

```sql
select * from cron.job;
```

Debe aparecer la fila `scheduled-tasks-tick`. Después de un minuto:

```sql
select * from cron.job_run_details
order by start_time desc
limit 5;
```

`status` debe ser `succeeded` y `return_message` debe verse legible (no error de red ni 401).

### 6. Validar end-to-end

1. En el chat web, decir: *"programa una tarea cada minuto que me diga 'ping'"*.
2. Aprobar la tarjeta HITL.
3. Esperar al siguiente minuto. Debe llegar a Telegram el mensaje de la tarea.

### 7. Apagar el job

```sql
select cron.unschedule('scheduled-tasks-tick');
```

Para reactivar, volver a correr el `cron.schedule` del paso 4.

### Validación rápida sin esperar pg_cron

```bash
curl -X POST http://localhost:3000/api/scheduled-tasks/tick \
  -H "x-cron-secret: $CRON_SECRET"
```

Respuesta esperada: `{"processed": N, "results": [...], "started_at": "..."}`. Si devuelve 401, el secret no coincide.

## Operación

### Pausar / reanudar una tarea

Desde el chat (preferido):

> pausa la tarea X
> reanuda la tarea X

El agente usa `list_scheduled_tasks` para resolver el id, llama a `update_scheduled_task` y pide HITL antes de aplicar.

Manual desde SQL Editor:

```sql
update scheduled_tasks set enabled = false where id = '<uuid>';
update scheduled_tasks set enabled = true  where id = '<uuid>';
```

Pausar conserva todo el historial (`last_execution`, `failure_count`, `next_execution`, etc.); al reanudar la tarea retoma su cron desde la próxima ventana válida.

### Inspeccionar tareas con problemas

```sql
select id, name, failure_count, status, last_execution
from scheduled_tasks
where failure_count > 0 or status = 'failed';
```

### Rotar `CRON_SECRET`

1. Cambiar el valor en el env del provider y redesplegar.
2. En SQL Editor:
   ```sql
   select cron.unschedule('scheduled-tasks-tick');
   ```
   Y volver a registrar el job con el nuevo secret (paso 4 del setup).

### Si un disparo no llegó

En orden:

1. **¿pg_cron disparó?**
   ```sql
   select * from cron.job_run_details
   where jobid = (select jobid from cron.job where jobname = 'scheduled-tasks-tick')
   order by start_time desc limit 10;
   ```
   Mira `status` y `return_message`.

2. **¿La request llegó al endpoint?** Logs de Next.js: buscar `[scheduled-tasks/tick]`.

3. **¿Qué hizo el agente?**
   ```sql
   select tc.*
   from tool_calls tc
   join agent_sessions s on s.id = tc.session_id
   where s.channel = 'scheduled'
   order by tc.created_at desc
   limit 20;
   ```

## Limitaciones conocidas

- **No hay recovery de disparos perdidos**: si la app estuvo caída entre dos `next_execution`, la tarea se dispara UNA sola vez al volver, no se recuperan los disparos saltados.
- **HITL pendiente puede solaparse con el siguiente disparo**: si una tarea no-autónoma queda esperando aprobación y llega su siguiente disparo, se crea un nuevo flujo HITL. El usuario verá dos tarjetas. Mejora futura: campo `pending_confirmation_id` en la tarea para skipear mientras haya una sin resolver.
- **`failure_count` se incrementa por cualquier fallo**: si el LLM tiene un mal día, una tarea sana puede pasar a `failed` después de 5 timeouts. Inspeccionar con la query de "tareas con problemas" y resetear con `update scheduled_tasks set failure_count=0, status='active' where id=...`.
