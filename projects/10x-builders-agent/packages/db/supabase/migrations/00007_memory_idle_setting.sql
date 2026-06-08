-- Umbral de inactividad por usuario para el memory_flush automático: tras cuántos
-- minutos sin actividad el sweep da una sesión por cerrada y la flushea. Es una
-- preferencia editable desde Ajustes; cae al default 30 si no se cambia. El
-- cierre EXPLÍCITO ("Nueva conversación") es instantáneo e ignora este valor.
--
-- Nota: la granularidad efectiva no puede ser menor que la cadencia del pg_cron
-- (p.ej. cada 5 min); por eso la UI acota el rango a 5–1440 min.
alter table public.profiles
  add column if not exists memory_flush_idle_minutes integer not null default 30
    check (memory_flush_idle_minutes between 5 and 1440);
