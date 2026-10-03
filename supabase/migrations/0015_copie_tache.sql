-- =====================================================================
-- Horaire HELMO — envoyer une COPIE d'une tâche à un étudiant.
-- SQL Editor → New query → Run. Script relançable.
--
-- Différent du partage (0007) : ici l'autre étudiant reçoit sa propre tâche,
-- indépendante de la mienne. Je la propose, il l'ajoute à ses tâches ou la refuse.
-- Personne ne peut écrire directement dans les listes d'un autre.
-- =====================================================================

create table if not exists public.task_offers (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  sender_name text not null default '',           -- posé par le trigger (le destinataire ne peut pas lire mon profil)
  title text not null check (char_length(title) between 1 and 300),
  due_at timestamptz,                             -- échéance de la tâche, ou début de sa séance
  context text check (char_length(context) <= 300), -- d'où vient la tâche (cours, séance, liste), pour le destinataire
  created_at timestamptz not null default now(),
  constraint task_offers_not_self check (sender_id <> recipient_id)
);
create index if not exists task_offers_recipient_idx on public.task_offers (recipient_id);

alter table public.task_offers enable row level security;

drop policy if exists "task_offers : voir les siennes" on public.task_offers;
create policy "task_offers : voir les siennes"
  on public.task_offers for select to authenticated
  using (sender_id = (select auth.uid()) or recipient_id = (select auth.uid()));

drop policy if exists "task_offers : envoyer" on public.task_offers;
create policy "task_offers : envoyer"
  on public.task_offers for insert to authenticated
  with check (sender_id = (select auth.uid()));

-- Retirer : l'expéditeur (annuler) ou le destinataire (refuser, ou après l'avoir ajoutée).
drop policy if exists "task_offers : retirer" on public.task_offers;
create policy "task_offers : retirer"
  on public.task_offers for delete to authenticated
  using (sender_id = (select auth.uid()) or recipient_id = (select auth.uid()));

-- Pas de politique UPDATE : une proposition ne se modifie pas.

-- Nom de l'expéditeur imposé par le serveur + garde-fou anti-spam : 20 propositions
-- en attente au maximum d'un même étudiant vers un même étudiant.
create or replace function public.prepare_task_offer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.task_offers o
       where o.sender_id = new.sender_id and o.recipient_id = new.recipient_id) >= 20 then
    raise exception 'Trop de tâches en attente pour cet étudiant : attends qu''il réponde.';
  end if;
  new.sender_name := coalesce((select p.display_name from public.profiles p where p.id = new.sender_id), 'Étudiant');
  return new;
end;
$$;

drop trigger if exists task_offers_prepare on public.task_offers;
create trigger task_offers_prepare
  before insert on public.task_offers
  for each row execute function public.prepare_task_offer();

-- ---------------------------------------------------------------------
-- Le destinataire accepte : la tâche est copiée dans SA liste « Tâches » (créée au
-- besoin) et la proposition disparaît — tout ou rien, dans une seule transaction.
-- security invoker (par défaut) : tout passe par le RLS du destinataire.
-- ---------------------------------------------------------------------
create or replace function public.accept_task_offer(offer uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  o public.task_offers;
  target uuid;
  item uuid;
begin
  if me is null then raise exception 'Non connecté.'; end if;
  delete from public.task_offers where id = offer and recipient_id = me returning * into o;
  if o.id is null then raise exception 'Proposition introuvable (déjà traitée ou annulée).'; end if;

  select l.id into target
    from public.todo_lists l
   where l.user_id = me and l.scope = 'global' and l.group_id is null and l.title = 'Tâches'
   order by l.created_at
   limit 1;
  if target is null then
    insert into public.todo_lists (user_id, title, scope) values (me, 'Tâches', 'global') returning id into target;
  end if;

  insert into public.todo_items (list_id, user_id, title, due_at, position)
  values (target, me, o.title, o.due_at, (extract(epoch from now())::bigint % 2000000000)::integer)
  returning id into item;
  return item;
end;
$$;

revoke execute on function public.accept_task_offer(uuid) from public, anon;
grant execute on function public.accept_task_offer(uuid) to authenticated;

-- Temps réel : le destinataire voit arriver la proposition sans recharger.
do $$
begin
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'task_offers') then
    alter publication supabase_realtime add table public.task_offers;
  end if;
end $$;
