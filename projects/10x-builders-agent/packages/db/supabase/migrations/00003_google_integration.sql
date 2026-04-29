-- ============================================================
-- Google integration: extend user_integrations to support providers
-- whose access tokens expire (Google issues short-lived access tokens
-- and a long-lived refresh token). GitHub does not use these columns
-- (its tokens do not expire); they remain null for the github provider.
-- ============================================================

alter table public.user_integrations
  add column if not exists encrypted_refresh_token text,
  add column if not exists access_token_expires_at timestamptz;

comment on column public.user_integrations.encrypted_refresh_token is
  'AES-256-GCM ciphertext of the provider refresh token (Google). Never log or return.';
comment on column public.user_integrations.access_token_expires_at is
  'When the current access token stops being valid. Used to trigger refresh.';
