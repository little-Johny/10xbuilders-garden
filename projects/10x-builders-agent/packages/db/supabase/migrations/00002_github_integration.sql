-- ============================================================
-- GitHub integration: enrich user_integrations with provider-specific
-- metadata that we want to show in the UI (e.g. the connected GitHub
-- username) without having to decrypt the access token just to read it.
-- ============================================================

alter table public.user_integrations
  add column if not exists provider_account_id text,
  add column if not exists provider_account_login text,
  add column if not exists updated_at timestamptz not null default now();

comment on column public.user_integrations.provider_account_id is
  'Stable account id emitted by the provider (e.g. GitHub numeric user id).';
comment on column public.user_integrations.provider_account_login is
  'Human-readable handle (e.g. GitHub login). Safe to expose to the client.';
comment on column public.user_integrations.encrypted_tokens is
  'AES-256-GCM ciphertext of the provider access token. Never log or return.';

-- Keep updated_at fresh on every row change.
create or replace function public.touch_user_integrations_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists user_integrations_touch_updated_at on public.user_integrations;
create trigger user_integrations_touch_updated_at
  before update on public.user_integrations
  for each row execute procedure public.touch_user_integrations_updated_at();
