-- =====================================================================
-- Horaire HELMO — partager UNE tâche avec un ou plusieurs étudiants.
-- À exécuter APRÈS 0007 (partages). SQL Editor → New query → Run. Script relançable.
--
-- Différent du partage d'une liste (0007) et de la copie (0015) : c'est LA MÊME tâche,
-- confiée à d'autres étudiants. Chacun la coche pour lui-même (todo_completions, comme
-- toujours) et la tâche affiche l'avancement : « 1/2 » = 1 personne sur 2 l'a faite.
--   - l'étudiant ajouté voit la tâche (même sans voir la liste), peut la cocher et y
--     mettre un rappel, mais ne peut pas la modifier ni la supprimer ;
--   - il peut se retirer lui-même ; l'auteur / le propriétaire de la liste peuvent le retirer.
-- =====================================================================

create table if not exists public.todo_item_assignees (
  item_id uuid not null references public.todo_items (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  assigned_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  -- Noms copiés par le trigger : l'étudiant ajouté ne peut pas forcément lire le profil
  -- de l'auteur (et inversement), comme sender_name dans task_offers.
  user_name text not null default '',
  author_name text not null default '',
  created_at timestamptz not null default now(),
  primary key (item_id, user_id)
);
create index if not exists todo_item_assignees_user_idx on public.todo_item_assignees (user_id);

alter table public.todo_item_assignees enable row level security;

-- ---------------------------------------------------------------------
-- Suis-je l'un des étudiants à qui cette tâche est confiée ? security definer : lit la
-- table sans repasser par son RLS (sinon todo_items ↔ todo_item_assignees boucleraient).
-- ---------------------------------------------------------------------
create or replace function public.is_task_assignee(the_item uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.todo_item_assignees a
     where a.item_id = the_item and a.user_id = (select auth.uid())
  );
$$;

revoke execute on function public.is_task_assignee(uuid) from public, anon;
grant execute on function public.is_task_assignee(uuid) to authenticated;

-- Voir : les siennes, et celles des tâches que je vois (pour afficher « 1/2 » et les noms).
drop policy if exists "todo_item_assignees : voir" on public.todo_item_assignees;
create policy "todo_item_assignees : voir"
  on public.todo_item_assignees for select to authenticated
  using (user_id = (select auth.uid()) or exists (select 1 from public.todo_items i where i.id = item_id));

-- Ajouter : quelqu'un qui voit la LISTE de la tâche (pas un simple étudiant ajouté), pour un autre que lui.
drop policy if exists "todo_item_assignees : ajouter" on public.todo_item_assignees;
create policy "todo_item_assignees : ajouter"
  on public.todo_item_assignees for insert to authenticated
  with check (
    assigned_by = (select auth.uid())
    and user_id <> (select auth.uid())
    and exists (
      select 1 from public.todo_items i
        join public.todo_lists l on l.id = i.list_id
       where i.id = item_id
    )
  );

-- Retirer : l'étudiant lui-même (« ne plus participer »), celui qui l'a ajouté,
-- l'auteur de la tâche ou le propriétaire de la liste.
drop policy if exists "todo_item_assignees : retirer" on public.todo_item_assignees;
create policy "todo_item_assignees : retirer"
  on public.todo_item_assignees for delete to authenticated
  using (
    user_id = (select auth.uid())
    or assigned_by = (select auth.uid())
    or exists (
      select 1 from public.todo_items i
        join public.todo_lists l on l.id = i.list_id
       where i.id = item_id
         and (i.user_id = (select auth.uid()) or l.user_id = (select auth.uid()))
    )
  );

-- Pas de politique UPDATE : on retire puis on ajoute.

-- Noms imposés par le serveur + garde-fou : 10 étudiants au maximum par tâche.
create or replace function public.prepare_todo_item_assignee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.todo_item_assignees a where a.item_id = new.item_id) >= 10 then
    raise exception 'Une tâche peut être partagée avec 10 étudiants au maximum.';
  end if;
  new.user_name := coalesce((select p.display_name from public.profiles p where p.id = new.user_id), 'Étudiant');
  new.author_name := coalesce(
    (select p.display_name from public.todo_items i join public.profiles p on p.id = i.user_id where i.id = new.item_id),
    'Étudiant'
  );
  return new;
end;
$$;

drop trigger if exists todo_item_assignees_prepare on public.todo_item_assignees;
create trigger todo_item_assignees_prepare
  before insert on public.todo_item_assignees
  for each row execute function public.prepare_todo_item_assignee();

-- ---------------------------------------------------------------------
-- todo_items : l'étudiant ajouté voit la tâche (donc peut la cocher : la politique
-- d'insertion de todo_completions demande seulement une tâche visible).
-- ---------------------------------------------------------------------
drop policy if exists "todo_items : voir les tâches des listes visibles" on public.todo_items;
create policy "todo_items : voir les tâches des listes visibles"
  on public.todo_items for select to authenticated
  using (exists (select 1 from public.todo_lists l where l.id = list_id) or public.is_task_assignee(id));

-- Temps réel : l'autre voit arriver la tâche, et le « 1/2 » bouge quand quelqu'un coche.
do $$
begin
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'todo_item_assignees') then
    alter publication supabase_realtime add table public.todo_item_assignees;
  end if;
end $$;
