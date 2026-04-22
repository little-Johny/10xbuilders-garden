-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- ============================================================
-- profiles (extends Supabase auth.users)
-- ============================================================
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null default '',
  timezone    text not null default 'UTC',
  language    text not null default 'es',
  agent_name  text not null default 'Agente',
  agent_system_prompt text not null default 'Eres un asistente útil que ayuda al usuario a gestionar tareas.',
  onboarding_completed boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id)
  values (new.id);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- user_integrations (OAuth tokens per provider)
-- ============================================================
create table public.user_integrations (
  id               uuid primary key default uuid_generate_v4(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  provider         text not null,
  encrypted_tokens text not null default '',
  scopes           text[] not null default '{}',
  status           text not null default 'active' check (status in ('active', 'revoked', 'expired')),
  created_at       timestamptz not null default now(),
  unique (user_id, provider)
);

alter table public.user_integrations enable row level security;

create policy "Users can manage own integrations"
  on public.user_integrations for all
  using (auth.uid() = user_id);

-- ============================================================
-- user_tool_settings (per-user tool enable/config)
-- ============================================================
create table public.user_tool_settings (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  tool_id     text not null,
  enabled     boolean not null default false,
  config_json jsonb not null default '{}',
  unique (user_id, tool_id)
);

alter table public.user_tool_settings enable row level security;

create policy "Users can manage own tool settings"
  on public.user_tool_settings for all
  using (auth.uid() = user_id);

-- ============================================================
-- agent_sessions
-- ============================================================
create table public.agent_sessions (
  id                  uuid primary key default uuid_generate_v4(),
  user_id             uuid not null references public.profiles(id) on delete cascade,
  channel             text not null default 'web' check (channel in ('web', 'telegram')),
  status              text not null default 'active' check (status in ('active', 'closed')),
  budget_tokens_used  integer not null default 0,
  budget_tokens_limit integer not null default 100000,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.agent_sessions enable row level security;

create policy "Users can manage own sessions"
  on public.agent_sessions for all
  using (auth.uid() = user_id);

-- ============================================================
-- agent_messages
-- ============================================================
create table public.agent_messages (
  id                 uuid primary key default uuid_generate_v4(),
  session_id         uuid not null references public.agent_sessions(id) on delete cascade,
  role               text not null check (role in ('user', 'assistant', 'tool', 'system')),
  content            text not null default '',
  tool_call_id       text,
  structured_payload jsonb,
  created_at         timestamptz not null default now()
);

alter table public.agent_messages enable row level security;

create policy "Users can manage own messages"
  on public.agent_messages for all
  using (
    exists (
      select 1 from public.agent_sessions s
      where s.id = agent_messages.session_id
        and s.user_id = auth.uid()
    )
  );

-- ============================================================
-- tool_calls
-- ============================================================
create table public.tool_calls (
  id                    uuid primary key default uuid_generate_v4(),
  session_id            uuid not null references public.agent_sessions(id) on delete cascade,
  tool_name             text not null,
  arguments_json        jsonb not null default '{}',
  result_json           jsonb,
  status                text not null default 'approved'
    check (status in ('pending_confirmation', 'approved', 'rejected', 'executed', 'failed')),
  requires_confirmation boolean not null default false,
  created_at            timestamptz not null default now(),
  finished_at           timestamptz
);

alter table public.tool_calls enable row level security;

create policy "Users can manage own tool calls"
  on public.tool_calls for all
  using (
    exists (
      select 1 from public.agent_sessions s
      where s.id = tool_calls.session_id
        and s.user_id = auth.uid()
    )
  );

-- ============================================================
-- telegram_accounts
-- ============================================================
create table public.telegram_accounts (
  id               uuid primary key default uuid_generate_v4(),
  user_id          uuid not null references public.profiles(id) on delete cascade unique,
  telegram_user_id bigint not null unique,
  chat_id          bigint not null,
  linked_at        timestamptz not null default now()
);

alter table public.telegram_accounts enable row level security;

create policy "Users can manage own telegram account"
  on public.telegram_accounts for all
  using (auth.uid() = user_id);

-- ============================================================
-- telegram_link_codes (one-time codes for linking)
-- ============================================================
create table public.telegram_link_codes (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  code       text not null unique,
  used       boolean not null default false,
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  created_at timestamptz not null default now()
);

alter table public.telegram_link_codes enable row level security;

create policy "Users can manage own link codes"
  on public.telegram_link_codes for all
  using (auth.uid() = user_id);
