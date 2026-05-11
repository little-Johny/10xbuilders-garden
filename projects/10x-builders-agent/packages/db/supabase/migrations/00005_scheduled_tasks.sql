-- Tareas programadas: el agente puede crear filas en esta tabla; un job de
-- pg_cron lee cada minuto las que están "due" y dispara un POST al endpoint
-- /api/scheduled-tasks/tick que ejecuta runAgent con la `description` como
-- prompt.
--
-- Nota: las extensiones pg_cron y pg_net deben quedar habilitadas. En
-- Supabase managed esto se hace una sola vez desde Dashboard → Database →
-- Extensions; aquí se incluye `create extension if not exists` para entornos
-- donde la migración corra sobre Postgres con privilegios suficientes.
create extension if not exists pg_cron;
create extension if not exists pg_net;

create table public.scheduled_tasks (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  name            text not null,
  description     text not null,
  cron_expression text not null,
  timezone        text,
  start_at        timestamptz,
  end_at          timestamptz,
  last_execution  timestamptz,
  next_execution  timestamptz,
  enabled         boolean not null default true,
  autonomous      boolean not null default false,
  notification_channels text[] not null default '{telegram}',
  status          text not null default 'active'
                    check (status in ('active', 'paused', 'completed', 'failed')),
  failure_count   integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Índice parcial: el endpoint /tick filtra por enabled=true, status='active'
-- y next_execution<=now(); este índice mantiene el escaneo barato incluso con
-- miles de tareas pausadas o terminadas.
create index scheduled_tasks_due_idx
  on public.scheduled_tasks (next_execution)
  where enabled = true and status = 'active';

alter table public.scheduled_tasks enable row level security;

create policy "Users can manage own scheduled tasks"
  on public.scheduled_tasks for all
  using (auth.uid() = user_id);

-- Permitir 'scheduled' como canal nuevo de agent_sessions: cada disparo del
-- cron crea una sesión aislada con channel='scheduled' para no contaminar el
-- historial del chat web/telegram del usuario.
alter table public.agent_sessions
  drop constraint if exists agent_sessions_channel_check;
alter table public.agent_sessions
  add constraint agent_sessions_channel_check
    check (channel in ('web', 'telegram', 'scheduled'));
