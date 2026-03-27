-- Bucket público para avatares de perfil.
-- Lectura pública; cada usuario solo puede gestionar su propio archivo.

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Lectura pública del bucket
create policy "avatars_select_public"
  on storage.objects for select
  using (bucket_id = 'avatars');

-- Solo el propietario puede subir/actualizar su avatar (nombre: <user_id>.*)
create policy "avatars_insert_own"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and (select auth.uid())::text = split_part(name, '.', 1)
  );

create policy "avatars_update_own"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and (select auth.uid())::text = split_part(name, '.', 1)
  );

create policy "avatars_delete_own"
  on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and (select auth.uid())::text = split_part(name, '.', 1)
  );
