-- ============================================================
-- Sheet references: el usuario registra sus hojas de Google Sheets una vez
-- (alias legible + spreadsheet_id + pestaña por defecto + descripción
-- semántica). El agente las resuelve por nombre/intención: loadAgentContext
-- inyecta la lista en el system prompt cada turno, así el usuario no tiene que
-- pegar el spreadsheet_id en cada conversación nueva.
--
-- `unique (user_id, alias)` garantiza un alias por usuario; las tools usan
-- upsert para que re-guardar un alias actualice en vez de duplicar.
-- ============================================================

-- Nota: usamos gen_random_uuid() (nativa de Postgres, en pg_catalog) en vez de
-- uuid_generate_v4() (de uuid-ossp, instalada en el schema `extensions`).
-- `supabase db push` corre con search_path acotado a public y no resuelve la
-- función de uuid-ossp sin calificar; gen_random_uuid() siempre está disponible.
create table public.user_sheets (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  alias           text not null,
  spreadsheet_id  text not null,
  default_tab     text,
  description     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, alias)
);

create index user_sheets_user_idx on public.user_sheets (user_id);

alter table public.user_sheets enable row level security;

create policy "Users can manage own sheet references"
  on public.user_sheets for all
  using (auth.uid() = user_id);

-- Mantener updated_at fresco en cada cambio de fila (mismo patrón que 00002).
create or replace function public.touch_user_sheets_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists user_sheets_touch_updated_at on public.user_sheets;
create trigger user_sheets_touch_updated_at
  before update on public.user_sheets
  for each row execute procedure public.touch_user_sheets_updated_at();
