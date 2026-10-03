-- =====================================================================
-- Horaire HELMO — messages non lus dans les discussions de projet.
-- À exécuter APRÈS 0008 (discussion). SQL Editor → New query → Run. Script relançable.
-- =====================================================================

-- Dernière lecture de la discussion d'un projet, par étudiant.
create table if not exists public.project_reads (
  list_id uuid not null references public.todo_lists (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (list_id, user_id)
);

alter table public.project_reads enable row level security;

-- Chacun ne voit et n'écrit que SES lectures, et seulement pour un projet qu'il voit.
drop policy if exists "project_reads : les siennes" on public.project_reads;
create policy "project_reads : les siennes"
  on public.project_reads for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and exists (select 1 from public.todo_lists l where l.id = list_id));

-- ---------------------------------------------------------------------
-- Nombre de messages non lus par projet, pour l'utilisateur connecté :
-- messages des AUTRES, arrivés après sa dernière lecture (tous s'il n'a jamais ouvert).
-- security invoker (par défaut) : le RLS de project_messages ne compte que les projets visibles.
-- ---------------------------------------------------------------------
create or replace function public.unread_message_counts()
returns table (list_id uuid, unread integer)
language sql
stable
set search_path = ''
as $$
  select m.list_id, count(*)::integer
    from public.project_messages m
    left join public.project_reads r on r.list_id = m.list_id and r.user_id = (select auth.uid())
   where m.user_id <> (select auth.uid())
     and (r.last_read_at is null or m.created_at > r.last_read_at)
   group by m.list_id;
$$;

revoke execute on function public.unread_message_counts() from public, anon;
grant execute on function public.unread_message_counts() to authenticated;
