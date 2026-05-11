# Plan — Tareas programadas

## Contexto y objetivo

Hoy el agente solo actúa **cuando lo invocan** desde el chat web o Telegram. No tiene forma de iniciar acciones por sí mismo de forma recurrente. Queremos que el usuario pueda decirle al agente cosas como:

- "Cada lunes a las 9am hazme un resumen de mis issues abiertos en GitHub."
- "Mañana a las 8am recuérdame revisar el calendario."
- "Cada hora durante esta semana, revisa si hay nuevos PRs en `mi-repo`."

El agente debe poder:

1. **Crear** la tarea desde la conversación, con confirmación humana.
2. **Persistirla** en una tabla propia.
3. **Ejecutarla automáticamente** cuando llegue su hora.
4. **Notificar** al usuario por sus canales preferidos (MVP: Telegram).
5. **Pedir confirmación** otra vez cuando el disparo invoque acciones de riesgo medio/alto, *salvo* que el usuario haya marcado la tarea como autónoma.

## Decisiones cerradas

| Decisión | Elegido | Por qué |
|---|---|---|
| Risk del tool | `medium` para `create`/`update`, `high` para `delete`, `low` para `list` | Crear una tarea es reversible (pausar/borrar), borrar no. Listar no muta. |
| HITL en disparo | **Híbrido**: flag `autonomous: boolean` por tarea | Permite tareas confiables (resúmenes read-only) sin fricción y mantiene HITL para tareas con efectos secundarios. |
| Sesión del cron | **Sesión nueva** `channel='scheduled'` por disparo | Aísla el contexto: no contamina chat web/telegram, y queda fácilmente auditable. |
| Multi-canal | **Telegram MVP** + arquitectura abstraída (`NotificationChannelAdapter`) | Cumple el requisito y deja la puerta abierta a email/web push sin refactor. |
| Disparador | **pg_cron + pg_net** llamando a `/api/scheduled-tasks/tick` cada minuto | Ya estamos en Supabase: cero infra extra, cero coste operativo, granularidad de minuto suficiente. Alternativa Vercel Cron requería pegar a otro vendor. |
| Concurrencia | **CAS optimista** sobre `last_execution` | Evita doble disparo si hay overlap, sin necesidad de `FOR UPDATE SKIP LOCKED` (que requiere transacciones manuales en supabase-js). |
| Evaluación de cron | `cron-parser` (v4.x) en Node, precomputando `next_execution` | Evita escanear todas las tareas cada minuto. Postgres tendría `cron.schedule` por tarea, pero crearía cientos de jobs y mezclaría datos de usuario con metadata del scheduler. |
| RLS vs service role | Tabla con RLS estándar; `/tick` usa **service role key** | El cron no actúa como ningún usuario autenticado. La protección del endpoint es el `CRON_SECRET`. |
| Contexto temporal | Preámbulo con fecha/hora/TZ inyectado en el system prompt en cada turno | El modelo no sabe qué día es. Sin esto, "lunes a las 9am" o "mañana" se traducen a UTC random. Aplica a los 3 canales. |

## Diagrama de flujo

```
┌─────────────────────────────────────────────────────────────────┐
│ Web chat: "programa cada lunes 9am un resumen de issues"        │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
                ┌─────────────────────────┐
                │  runAgent (con HITL)    │
                └────────────┬────────────┘
                             │ tool create_scheduled_task (risk=medium)
                             ▼
                    ┌────────────────────┐
                    │ HITL pendiente     │ → Telegram con tarjeta aprobar/rechazar
                    └─────────┬──────────┘
                              │ approve
                              ▼
                ┌──────────────────────────┐
                │ INSERT scheduled_tasks   │
                │  + next_execution        │
                └──────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│ pg_cron (cada minuto)                                            │
│   net.http_post(/api/scheduled-tasks/tick, x-cron-secret)        │
└─────────────────────────────┬────────────────────────────────────┘
                              ▼
                  ┌─────────────────────────┐
                  │ getDueTasks()           │
                  │  next_execution<=now    │
                  │  enabled & active       │
                  └────────────┬────────────┘
                               ▼
                  ┌──────────────────────────┐
                  │ claimScheduledTask (CAS) │
                  └────────────┬─────────────┘
                               ▼
                ┌─────────────────────────────┐
                │ INSERT agent_session         │
                │   channel='scheduled'        │
                └────────────┬─────────────────┘
                             ▼
                ┌─────────────────────────────┐
                │ runAgent({ message=desc,    │
                │            autonomous })    │
                └──┬─────────────────┬────────┘
                   │ pendingConf     │ response
                   │ (no-autónoma)   │
                   ▼                 ▼
       ┌──────────────────┐  ┌──────────────────────────┐
       │ dispatchNotif    │  │ dispatchNotif(completed) │
       │ pending_conf+TG  │  │ → Telegram               │
       └──────────────────┘  └──────────────────────────┘
```

## Schema de la tabla

```sql
create table public.scheduled_tasks (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  name            text not null,                -- "Resumen issues"
  description     text not null,                -- prompt: "resúmeme mis issues abiertos"
  cron_expression text not null,                -- "0 9 * * 1"
  timezone        text,                         -- IANA; null → profile.timezone
  start_at        timestamptz,                  -- no disparar antes de
  end_at          timestamptz,                  -- no disparar después de
  last_execution  timestamptz,                  -- para CAS y observabilidad
  next_execution  timestamptz,                  -- precomputado, query barata
  enabled         boolean not null default true,
  autonomous      boolean not null default false,
  notification_channels text[] not null default '{telegram}',
  status          text not null default 'active',
  failure_count   integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index scheduled_tasks_due_idx
  on public.scheduled_tasks (next_execution)
  where enabled = true and status = 'active';
```

**Por qué cada columna existe:**

- `description` separada de `name` porque la primera es **prompt para el modelo** (puede ser un párrafo) y la segunda es **etiqueta** para el usuario (corta).
- `timezone` opcional → fallback a `profile.timezone` para que el caso común (todas las tareas en la zona del usuario) no requiera especificarlo.
- `next_execution` precomputado: el endpoint `/tick` corre cada minuto y filtra por `next_execution <= now`. Sin este campo tendríamos que evaluar cada cron expression del catálogo cada minuto.
- `last_execution` participa en la condición CAS (`WHERE last_execution IS NOT DISTINCT FROM <prev>`).
- `failure_count` con threshold 5 → la tarea pasa a `status='failed'` y deja de dispararse, evitando spam si el usuario tiene un cron mal puesto.
- `notification_channels` es `text[]` con default `{telegram}`; el código ignora canales sin adapter para que añadir nuevos no rompa filas existentes.

## API de las nuevas tools

### `create_scheduled_task` (risk=medium)

```ts
{
  name: string;
  description: string;            // prompt natural
  cron_expression: string;        // "0 9 * * 1"
  timezone?: string;              // IANA; default: perfil
  start_at?: string;              // RFC3339
  end_at?: string;                // RFC3339
  autonomous?: boolean;           // default false
  notification_channels?: ("telegram")[]; // default ["telegram"]
}
```

Implementación:
1. Resolver TZ: explícita > perfil > UTC.
2. Validar `cron_expression` con `cron-parser`. Si inválida, retornar `{ ok:false, error }` (no lanza).
3. Calcular `next_execution`.
4. INSERT en `scheduled_tasks`.
5. Devolver `{ ok:true, task: { id, human, next_execution, ... } }`.

`summariseToolCall` muestra al usuario en la tarjeta HITL: nombre, expresión humanizada (`cronstrue` en español), zona, autonomous sí/no, próxima ejecución calculada.

### `list_scheduled_tasks` (risk=low)

Filtro opcional por `status`. Devuelve campos relevantes (no incluye `created_at` raw para mantener la salida compacta).

### `delete_scheduled_task` (risk=high)

Argumento: `task_id`. Antes del DELETE valida que la tarea pertenezca al usuario (defensa en profundidad — el path RLS también lo hace).

## Soporte `autonomous` en el grafo

`AgentInput` añade `autonomous?: boolean`. En `toolExecutorNode`:

```ts
const isMutating = risk === "medium" || risk === "high";
const requiresConfirmation = !input.autonomous && isMutating;
```

Cuando el flag está en `true` y la tool es mutating, se ejecuta directo. Para no perder trazabilidad, el nodo crea un `tool_calls` row con `status='approved'` antes de ejecutar y lo actualiza a `executed`/`failed` después. Las tools `low` siguen llevando su propia auditoría como antes.

## Trade-offs descartados

- **Vercel Cron**: descartado. Nos amarra a Vercel y duplicaría la lógica de scheduling fuera de Postgres. pg_cron mantiene todo en una sola superficie.
- **`cron.schedule()` por tarea de usuario**: Postgres puede agendar jobs nativos, pero crearíamos cientos de jobs nominados, mezclando datos de usuario con catálogo del scheduler, y necesitaríamos sincronizar create/update/delete de la tabla con `cron.alter_job`. Mucho más complejo que un solo cron que escanea una tabla.
- **`FOR UPDATE SKIP LOCKED`**: requiere transacciones explícitas que `supabase-js` no expone limpiamente; CAS optimista logra el mismo objetivo (no doble disparo) con una sola sentencia.
- **Modo "totalmente autónomo" global**: descartado a favor del flag por tarea. El usuario debe decidir caso por caso si confía suficientemente en una tarea como para saltarse HITL.

## Riesgos

- **Service-role en endpoint público**: `/api/scheduled-tasks/tick` salta RLS. La única protección es el `CRON_SECRET`. Documentado y rotable. Mitigación adicional posible: verificar IP origen en futuros ajustes (Supabase no expone IPs estables actualmente).
- **Drift de `next_execution`**: si la app está caída cuando tocaba disparar, `getDueTasks` lo recoge cuando vuelve, pero solo dispara UNA vez (no recupera todas las pérdidas). Comportamiento esperado y documentado.
- **Solapamiento HITL ↔ siguiente disparo**: si una tarea no-autónoma queda esperando confirmación y entra el siguiente disparo, se crea un nuevo HITL pendiente. Decisión razonable para MVP; la mejora futura es añadir `pending_confirmation_id` y skipear si está set.

## Plan de rollout por fases

1. **F1 (foundation)**: tipos + migración + queries + módulo de notificaciones (sin tocar el grafo). Verifica que la refactorización del webhook de Telegram no regresa.
2. **F2 (graph + tools)**: flag `autonomous`, las 3 tools nuevas, helper `loadAgentContext` con preámbulo temporal. Verificable: chat web puede crear/listar/borrar tareas con HITL.
3. **F3 (tick endpoint)**: endpoint `/tick`, validación curl manual.
4. **F4 (pg_cron)**: registrar `cron.schedule` en Supabase Dashboard. Validar end-to-end con tarea cada minuto.
5. **F5 (docs + changelog)**.

Las fases pueden mergearse en commits separados pero no es un requisito; el feature funciona end-to-end solo cuando F1–F4 están dentro.
