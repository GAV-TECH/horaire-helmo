-- =====================================================================
-- Horaire HELMO — page Tâches façon To Do : marqueurs personnels
-- "Important" (étoile) et "Ma journée". SQL Editor → New query → Run.
-- Script relançable.
--
-- Ces marqueurs appartiennent à CHAQUE utilisateur, même sur une tâche
-- partagée : mettre une étoile ne l'impose pas aux autres membres.
-- "Ma journée" stocke la date du jour où la tâche y a été ajoutée :
-- le lendemain, elle n'y apparaît plus, sans aucun traitement planifié.
-- =====================================================================

create table if not exists public.todo_item_flags (
  item_id uuid not null references public.todo_items (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  important boolean not null default false,
  my_day date, -- date (Bruxelles) du jour où la tâche a été mise dans "Ma journée"
  primary key (item_id, user_id)
);

create index if not exists todo_item_flags_user_idx on public.todo_item_flags (user_id);

alter table public.todo_item_flags enable row level security;

drop policy if exists "todo_item_flags : gérer les siens" on public.todo_item_flags;
create policy "todo_item_flags : gérer les siens"
  on public.todo_item_flags for all to authenticated
  using (user_id = (select auth.uid()))
  -- la tâche doit être visible (RLS de todo_items) : ses propres listes ou celles de ses groupes
  with check (user_id = (select auth.uid()) and exists (select 1 from public.todo_items i where i.id = item_id));
