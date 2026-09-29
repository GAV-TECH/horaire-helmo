-- =====================================================================
-- Horaire HELMO — phase 2 : profils, lien .ics, séances, notes,
-- deadlines, to-do lists.
-- À exécuter une fois dans Supabase : SQL Editor → New query → Run.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Utilitaire : met à jour la colonne updated_at à chaque modification.
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Profils : nom affiché (visible par les membres de mes groupes en phase 4).
-- Créé automatiquement à l'inscription par un trigger sur auth.users.
-- ---------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles : lire son profil"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

create policy "profiles : modifier son profil"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- security definer : la fonction s'exécute avec les droits de son créateur,
-- nécessaire pour écrire dans public.profiles depuis un trigger sur auth.users.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(left(trim(new.raw_user_meta_data ->> 'display_name'), 60), ''), 'Étudiant')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Lien .ics (chiffré par l'application en AES-256-GCM).
-- RLS activé SANS AUCUNE POLITIQUE : illisible avec la clé publique,
-- même pour son propriétaire. Seul le serveur (clé secrète) y accède.
-- ---------------------------------------------------------------------
create table public.ics_sources (
  user_id uuid primary key references auth.users (id) on delete cascade,
  url_encrypted text not null,
  updated_at timestamptz not null default now(),
  last_synced_at timestamptz,
  last_error text
);

alter table public.ics_sources enable row level security;
revoke all on public.ics_sources from anon, authenticated;

-- ---------------------------------------------------------------------
-- Séances importées. Écrites uniquement par le serveur lors des synchros.
-- L'utilisateur peut seulement lire les siennes et marquer les
-- changements comme vus (droit limité à la colonne changes_seen).
-- ---------------------------------------------------------------------
create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  key text not null,                -- UID (+ #RECURRENCE-ID)
  uid text not null,
  recurrence_id timestamptz,
  title text not null,
  course_key text not null,         -- nom de cours normalisé
  location text,
  teacher text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  all_day boolean not null default false,
  description text,
  status text not null default 'active' check (status in ('active', 'cancelled')),
  changes jsonb not null default '{}'::jsonb,  -- {moved, room, cancelled, added}
  changes_seen boolean not null default true,
  first_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, key)
);

create index sessions_user_start_idx on public.sessions (user_id, start_at);

alter table public.sessions enable row level security;

create policy "sessions : lire ses séances"
  on public.sessions for select to authenticated
  using (user_id = (select auth.uid()));

create policy "sessions : marquer ses changements comme vus"
  on public.sessions for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Par défaut, Supabase donne tous les droits aux rôles anon/authenticated ;
-- on les retire puis on ne rend modifiable que la colonne changes_seen.
revoke insert, update, delete on public.sessions from anon, authenticated;
grant update (changes_seen) on public.sessions to authenticated;

-- ---------------------------------------------------------------------
-- Notes attachées à une séance. Rattachement : session_key (UID), avec
-- secours course_key + session_start si l'UID change. course_title garde
-- de quoi afficher la note si elle devient orpheline.
-- ---------------------------------------------------------------------
create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_key text not null,
  course_key text not null,
  course_title text not null check (char_length(course_title) <= 300),
  session_start timestamptz not null,
  body text not null check (char_length(body) between 1 and 20000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index notes_user_session_idx on public.notes (user_id, session_key);
create trigger notes_updated_at before update on public.notes
  for each row execute function public.set_updated_at();

alter table public.notes enable row level security;

create policy "notes : gérer ses notes"
  on public.notes for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- Deadlines indépendantes des séances.
-- ---------------------------------------------------------------------
create table public.deadlines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  due_at timestamptz not null,
  course_name text check (char_length(course_name) <= 300),
  course_key text,
  priority smallint not null default 2 check (priority between 1 and 3), -- 1 haute, 2 normale, 3 basse
  details text check (char_length(details) <= 5000),
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index deadlines_user_due_idx on public.deadlines (user_id, due_at);
create trigger deadlines_updated_at before update on public.deadlines
  for each row execute function public.set_updated_at();

alter table public.deadlines enable row level security;

create policy "deadlines : gérer ses deadlines"
  on public.deadlines for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- To-do lists : globales, par cours ou attachées à une séance.
-- ---------------------------------------------------------------------
create table public.todo_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  scope text not null check (scope in ('global', 'course', 'session')),
  course_name text check (char_length(course_name) <= 300),
  course_key text,
  session_key text,
  session_start timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    scope = 'global'
    or (scope = 'course' and course_key is not null)
    or (scope = 'session' and course_key is not null and session_key is not null and session_start is not null)
  )
);

create index todo_lists_user_idx on public.todo_lists (user_id);
create trigger todo_lists_updated_at before update on public.todo_lists
  for each row execute function public.set_updated_at();

alter table public.todo_lists enable row level security;

create policy "todo_lists : gérer ses listes"
  on public.todo_lists for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create table public.todo_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.todo_lists (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 300),
  due_at timestamptz,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index todo_items_list_idx on public.todo_items (list_id);
create trigger todo_items_updated_at before update on public.todo_items
  for each row execute function public.set_updated_at();

alter table public.todo_items enable row level security;

-- La tâche doit m'appartenir ET être dans une de mes listes
-- (sinon on pourrait glisser une tâche dans la liste de quelqu'un d'autre).
create policy "todo_items : gérer ses tâches"
  on public.todo_items for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.todo_lists l where l.id = list_id and l.user_id = (select auth.uid()))
  );

-- "Fait" est stocké par utilisateur : en phase 4, chaque membre d'un
-- groupe cochera une tâche partagée pour lui-même.
create table public.todo_completions (
  item_id uuid not null references public.todo_items (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  done_at timestamptz not null default now(),
  primary key (item_id, user_id)
);

alter table public.todo_completions enable row level security;

create policy "todo_completions : gérer ses coches"
  on public.todo_completions for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.todo_items i where i.id = item_id)  -- tâche visible (RLS de todo_items)
  );
