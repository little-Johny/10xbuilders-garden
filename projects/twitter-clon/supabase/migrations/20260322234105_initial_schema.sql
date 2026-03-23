-- Esquema inicial: perfiles, tweets, likes, comentarios (con hilos), follows.
-- Supabase: RLS habilitado; lectura pública en contenido; escritura acotada al usuario autenticado.

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  display_name text not null default 'User',
  bio text not null default '',
  avatar_url text,
  banner_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_lower check (username = lower(username)),
  constraint profiles_username_format check (
    username ~ '^[a-z0-9_]{3,30}$'
  ),
  constraint profiles_bio_length check (char_length(bio) <= 160)
);

create unique index profiles_username_key on public.profiles (username);

create table public.tweets (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  constraint tweets_content_length check (char_length(content) <= 280)
);

create index tweets_author_id_created_at_idx on public.tweets (author_id, created_at desc);

create table public.tweet_likes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  tweet_id uuid not null references public.tweets (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, tweet_id)
);

create index tweet_likes_tweet_id_idx on public.tweet_likes (tweet_id);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  tweet_id uuid not null references public.tweets (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  parent_comment_id uuid references public.comments (id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  constraint comments_content_length check (char_length(content) <= 2000)
);

create index comments_tweet_id_created_at_idx on public.comments (tweet_id, created_at);
create index comments_parent_comment_id_idx on public.comments (parent_comment_id)
  where parent_comment_id is not null;

create table public.comment_likes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  comment_id uuid not null references public.comments (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, comment_id)
);

create index comment_likes_comment_id_idx on public.comment_likes (comment_id);

create table public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  following_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint follows_no_self check (follower_id <> following_id)
);

create index follows_following_id_idx on public.follows (following_id);
create index follows_follower_id_idx on public.follows (follower_id);

-- ---------------------------------------------------------------------------
-- Triggers: updated_at y coherencia de comentarios hijos
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger tweets_set_updated_at
  before update on public.tweets
  for each row execute function public.set_updated_at();

create trigger comments_set_updated_at
  before update on public.comments
  for each row execute function public.set_updated_at();

create or replace function public.comments_validate_parent_same_tweet()
returns trigger
language plpgsql
as $$
begin
  if new.parent_comment_id is not null then
    if not exists (
      select 1
      from public.comments c
      where c.id = new.parent_comment_id
        and c.tweet_id = new.tweet_id
    ) then
      raise exception 'parent_comment_id must reference a comment on the same tweet';
    end if;
  end if;
  return new;
end;
$$;

create trigger comments_validate_parent_same_tweet_trg
  before insert or update of parent_comment_id, tweet_id on public.comments
  for each row execute function public.comments_validate_parent_same_tweet();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.tweets enable row level security;
alter table public.tweet_likes enable row level security;
alter table public.comments enable row level security;
alter table public.comment_likes enable row level security;
alter table public.follows enable row level security;

-- profiles
create policy "profiles_select_all"
  on public.profiles for select
  using (true);

create policy "profiles_insert_own"
  on public.profiles for insert
  with check ((select auth.uid()) = id);

create policy "profiles_update_own"
  on public.profiles for update
  using ((select auth.uid()) = id);

-- tweets
create policy "tweets_select_all"
  on public.tweets for select
  using (true);

create policy "tweets_insert_authenticated_as_author"
  on public.tweets for insert
  with check ((select auth.uid()) = author_id);

create policy "tweets_update_own"
  on public.tweets for update
  using ((select auth.uid()) = author_id);

create policy "tweets_delete_own"
  on public.tweets for delete
  using ((select auth.uid()) = author_id);

-- tweet_likes
create policy "tweet_likes_select_all"
  on public.tweet_likes for select
  using (true);

create policy "tweet_likes_insert_own"
  on public.tweet_likes for insert
  with check ((select auth.uid()) = user_id);

create policy "tweet_likes_delete_own"
  on public.tweet_likes for delete
  using ((select auth.uid()) = user_id);

-- comments
create policy "comments_select_all"
  on public.comments for select
  using (true);

create policy "comments_insert_authenticated_as_author"
  on public.comments for insert
  with check ((select auth.uid()) = author_id);

create policy "comments_update_own"
  on public.comments for update
  using ((select auth.uid()) = author_id);

create policy "comments_delete_own"
  on public.comments for delete
  using ((select auth.uid()) = author_id);

-- comment_likes
create policy "comment_likes_select_all"
  on public.comment_likes for select
  using (true);

create policy "comment_likes_insert_own"
  on public.comment_likes for insert
  with check ((select auth.uid()) = user_id);

create policy "comment_likes_delete_own"
  on public.comment_likes for delete
  using ((select auth.uid()) = user_id);

-- follows
create policy "follows_select_all"
  on public.follows for select
  using (true);

create policy "follows_insert_as_follower"
  on public.follows for insert
  with check ((select auth.uid()) = follower_id);

create policy "follows_delete_as_follower"
  on public.follows for delete
  using ((select auth.uid()) = follower_id);
