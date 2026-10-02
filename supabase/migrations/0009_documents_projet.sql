-- =====================================================================
-- Horaire HELMO — documents partagés d'un projet (liens).
-- SQL Editor → New query → Run. Script relançable.
--
-- Un "document" est un lien vers un fichier en ligne (Word / OneDrive, Google Docs,
-- PDF…) : tous les membres ouvrent et modifient la même version, rien n'est stocké ici.
-- Accès = qui voit le projet (RLS de todo_lists), comme pour la discussion.
-- =====================================================================

create table if not exists public.project_links (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.todo_lists (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  -- http(s) uniquement : jamais de lien "javascript:" ou "data:" cliquable par les autres membres.
  url text not null check (char_length(url) <= 2000 and url ~* '^https?://'),
  created_at timestamptz not null default now()
);
create index if not exists project_links_list_idx on public.project_links (list_id, created_at);

alter table public.project_links enable row level security;

drop policy if exists "project_links : lire" on public.project_links;
create policy "project_links : lire"
  on public.project_links for select to authenticated
  using (exists (select 1 from public.todo_lists l where l.id = list_id));

drop policy if exists "project_links : ajouter" on public.project_links;
create policy "project_links : ajouter"
  on public.project_links for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.todo_lists l where l.id = list_id and l.scope = 'project')
  );

-- Retirer : celui qui a ajouté le lien, ou le propriétaire du projet.
drop policy if exists "project_links : retirer" on public.project_links;
create policy "project_links : retirer"
  on public.project_links for delete to authenticated
  using (
    user_id = (select auth.uid())
    or exists (select 1 from public.todo_lists l where l.id = list_id and l.user_id = (select auth.uid()))
  );

-- Pas de politique UPDATE : on retire le lien et on en ajoute un autre.

do $$
begin
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'project_links') then
    alter publication supabase_realtime add table public.project_links;
  end if;
end $$;
