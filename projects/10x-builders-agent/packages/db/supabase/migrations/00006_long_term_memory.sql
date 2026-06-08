-- Memoria a largo plazo: el agente destila hechos durables al cerrar una sesión
-- (memory_flush) y los recupera por similitud al iniciar la siguiente
-- (memory_injection_node). Los recuerdos se llavean por user_id para cruzar
-- sesiones; cada uno guarda su embedding para búsqueda por cosine similarity.
--
-- El push del CLI no incluye el esquema `extensions` en el search_path (a
-- diferencia del SQL Editor del Dashboard). Supabase instala ahí uuid-ossp y
-- pgvector, así que lo añadimos explícitamente para resolver uuid_generate_v4(),
-- el tipo `vector`, `vector_cosine_ops` y el operador de cosine `<=>`.
set search_path = public, extensions;

-- pgvector es nativo en Supabase. En managed se habilita una vez desde
-- Dashboard → Database → Extensions; el `create extension if not exists` cubre
-- entornos con privilegios suficientes. Lo fijamos en `extensions` para no
-- instalarlo en `public`.
create extension if not exists vector with schema extensions;

create table public.memories (
  id                uuid primary key default uuid_generate_v4(),
  user_id           uuid not null references public.profiles(id) on delete cascade,
  type              text not null check (type in ('episodic', 'semantic', 'procedural')),
  content           text not null,
  embedding         vector(1536) not null,        -- text-embedding-3-small
  retrieval_count   integer not null default 0,
  created_at        timestamptz not null default now(),
  last_retrieved_at timestamptz
);

alter table public.memories enable row level security;

-- El usuario solo ve/gestiona sus recuerdos (chat web autenticado). El flush y
-- el retrieval corren con service-role y saltan RLS, pero las funciones de abajo
-- filtran por user_id explícito para no cruzar recuerdos entre usuarios.
create policy "Users can manage own memories"
  on public.memories for all
  using (auth.uid() = user_id);

-- Índice vectorial para cosine similarity. ivfflat es suficiente para el volumen
-- esperado; HNSW es alternativa si el recall lo exige más adelante.
create index memories_embedding_idx
  on public.memories
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

create index memories_user_idx on public.memories (user_id);

-- Retrieval enfocado: top-K por cosine similarity, desempate por retrieval_count.
create or replace function public.match_memories(
  query_embedding vector(1536),
  match_user_id   uuid,
  match_count     int default 6
)
returns table (
  id uuid,
  type text,
  content text,
  retrieval_count int,
  similarity float
)
language sql
stable
as $$
  select
    m.id,
    m.type,
    m.content,
    m.retrieval_count,
    1 - (m.embedding <=> query_embedding) as similarity
  from public.memories m
  where m.user_id = match_user_id
  order by
    m.embedding <=> query_embedding asc,  -- cosine distance ↑ = más cerca
    m.retrieval_count desc                 -- tiebreak por uso
  limit match_count;
$$;

-- Dedup del flush: ¿ya existe un recuerdo del MISMO tipo lo bastante parecido?
-- Devuelve el más cercano por encima del umbral, o ninguna fila.
create or replace function public.find_similar_memory(
  query_embedding vector(1536),
  match_user_id   uuid,
  match_type      text,
  min_similarity  float default 0.90
)
returns table (
  id uuid,
  similarity float
)
language sql
stable
as $$
  select
    m.id,
    1 - (m.embedding <=> query_embedding) as similarity
  from public.memories m
  where m.user_id = match_user_id
    and m.type = match_type
    and 1 - (m.embedding <=> query_embedding) >= min_similarity
  order by m.embedding <=> query_embedding asc
  limit 1;
$$;

-- Incremento atómico del contador. Lo usan el retrieval (recuerdos recuperados)
-- y el dedup (refuerzo de un duplicado detectado).
create or replace function public.bump_retrieval_count(ids uuid[])
returns void
language sql
as $$
  update public.memories
  set retrieval_count = retrieval_count + 1,
      last_retrieved_at = now()
  where id = any(ids);
$$;

-- agent_sessions: marca de flush para distinguir "cerrada y flusheada" de
-- "cerrada pero el flush se cayó" (permite reintento desde el sweep).
alter table public.agent_sessions
  add column if not exists flushed_at timestamptz;
