-- =====================================================================
-- Horaire HELMO — discussion dans chaque projet (façon messagerie).
-- SQL Editor → New query → Run. Script relançable.
--
-- Qui voit le projet (propriétaire, membres du groupe, étudiant avec qui il est
-- partagé) peut lire et écrire dans sa discussion : on s'appuie sur le RLS de
-- todo_lists, il n'y a pas de seconde liste de membres à tenir à jour.
-- =====================================================================

create table if not exists public.project_messages (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.todo_lists (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  -- Nom copié à l'envoi (par le trigger ci-dessous) : deux étudiants invités au même projet
  -- n'ont pas forcément le droit de lire le profil l'un de l'autre.
  author_name text not null default '',
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists project_messages_list_idx on public.project_messages (list_id, created_at);

alter table public.project_messages enable row level security;

-- "exists todo_lists" passe par le RLS de todo_lists : la liste doit m'être visible.
drop policy if exists "project_messages : lire" on public.project_messages;
create policy "project_messages : lire"
  on public.project_messages for select to authenticated
  using (exists (select 1 from public.todo_lists l where l.id = list_id));

drop policy if exists "project_messages : écrire" on public.project_messages;
create policy "project_messages : écrire"
  on public.project_messages for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.todo_lists l where l.id = list_id and l.scope = 'project')
  );

drop policy if exists "project_messages : supprimer les siens" on public.project_messages;
create policy "project_messages : supprimer les siens"
  on public.project_messages for delete to authenticated
  using (user_id = (select auth.uid()));

-- Pas de politique UPDATE : un message ne se modifie pas.

-- Le nom affiché vient TOUJOURS du profil de l'auteur, jamais de ce qu'envoie le navigateur.
create or replace function public.set_message_author()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.author_name := coalesce((select p.display_name from public.profiles p where p.id = new.user_id), 'Étudiant');
  return new;
end;
$$;

drop trigger if exists project_messages_author on public.project_messages;
create trigger project_messages_author
  before insert on public.project_messages
  for each row execute function public.set_message_author();

-- Temps réel : un nouveau message apparaît chez les autres membres sans recharger.
do $$
begin
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'project_messages') then
    alter publication supabase_realtime add table public.project_messages;
  end if;
end $$;
