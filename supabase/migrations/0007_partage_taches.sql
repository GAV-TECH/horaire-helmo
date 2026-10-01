-- =====================================================================
-- Horaire HELMO — partage de tâches d'étudiant à étudiant, avec accord.
-- SQL Editor → New query → Run. Script relançable.
--
-- Je cherche un étudiant par son nom, je lui envoie une demande (une liste,
-- ou toutes mes tâches) ; il l'accepte ou la refuse. Une fois acceptée :
--   - il voit mes listes concernées et leurs tâches, en temps réel ;
--   - il peut ajouter et MODIFIER les tâches (titre, échéance) ;
--   - « fait » reste personnel (todo_completions : une coche par étudiant).
-- =====================================================================

-- Les listes de séance peuvent être partagées : la liste garde elle-même le cours et la
-- date. Chez l'autre étudiant, l'horaire la rattache à sa séance par cours + heure de début.
alter table public.todo_lists drop constraint if exists todo_lists_shared_not_session;

-- Premier essai (partage global via un groupe), abandonné.
alter table public.user_settings drop column if exists tasks_group_id;

create table if not exists public.task_shares (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  list_id uuid references public.todo_lists (id) on delete cascade, -- null = toutes mes listes (hors projets)
  label text not null check (char_length(label) between 1 and 200), -- ce que voit le destinataire avant d'accepter
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint task_shares_not_self check (owner_id <> recipient_id)
);
create unique index if not exists task_shares_unique
  on public.task_shares (owner_id, recipient_id, coalesce(list_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists task_shares_recipient_idx on public.task_shares (recipient_id);

alter table public.task_shares enable row level security;

drop policy if exists "task_shares : voir les siens" on public.task_shares;
create policy "task_shares : voir les siens"
  on public.task_shares for select to authenticated
  using (owner_id = (select auth.uid()) or recipient_id = (select auth.uid()));

-- Demander : uniquement pour moi-même, en attente, et pour une liste qui m'appartient.
drop policy if exists "task_shares : demander" on public.task_shares;
create policy "task_shares : demander"
  on public.task_shares for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and status = 'pending'
    and responded_at is null
    and (list_id is null or exists (select 1 from public.todo_lists l where l.id = list_id and l.user_id = (select auth.uid())))
  );

-- Retirer : le propriétaire (annuler / arrêter) ou le destinataire (refuser / quitter).
drop policy if exists "task_shares : retirer" on public.task_shares;
create policy "task_shares : retirer"
  on public.task_shares for delete to authenticated
  using (owner_id = (select auth.uid()) or recipient_id = (select auth.uid()));

-- Pas de politique UPDATE : accepter passe par respond_task_share (ci-dessous), qui ne
-- touche qu'au statut. Sinon le destinataire pourrait modifier owner_id ou list_id.

-- ---------------------------------------------------------------------
-- Fonctions d'aide (security definer : lisent task_shares sans repasser par son RLS).
-- ---------------------------------------------------------------------

-- Ai-je accès à cette liste grâce à un partage accepté ?
create or replace function public.has_task_share(list_owner uuid, the_list uuid, list_scope text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.task_shares s
     where s.recipient_id = (select auth.uid())
       and s.owner_id = list_owner
       and s.status = 'accepted'
       and (s.list_id = the_list or (s.list_id is null and list_scope <> 'project'))
  );
$$;

-- Un partage (même en attente) me relie-t-il à cet étudiant ? Sert à afficher son nom.
create or replace function public.shares_tasks_with(other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.task_shares s
     where (s.owner_id = (select auth.uid()) and s.recipient_id = other)
        or (s.recipient_id = (select auth.uid()) and s.owner_id = other)
  );
$$;

-- Recherche d'un étudiant par nom (ou début d'adresse e-mail) : 3 caractères minimum,
-- 6 résultats maximum, l'adresse est masquée (« gi…@gmail.com ») pour distinguer
-- deux homonymes sans exposer les adresses.
create or replace function public.find_students(q text)
returns table (id uuid, display_name text, email_hint text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  needle text := trim(coalesce(q, ''));
  pattern text;
begin
  if me is null then raise exception 'Non connecté.'; end if;
  if char_length(needle) < 3 then return; end if;
  pattern := replace(replace(replace(left(needle, 60), '\', '\\'), '%', '\%'), '_', '\_');
  return query
    select p.id, p.display_name,
           left(split_part(u.email, '@', 1), 2) || '…@' || split_part(u.email, '@', 2)
      from public.profiles p
      join auth.users u on u.id = p.id
     where p.id <> me
       and (p.display_name ilike '%' || pattern || '%' or u.email ilike pattern || '%')
     order by p.display_name
     limit 6;
end;
$$;

-- Accepter (statut → accepted) ou refuser (suppression). Réservé au destinataire.
create or replace function public.respond_task_share(share uuid, accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'Non connecté.'; end if;
  if accept then
    update public.task_shares set status = 'accepted', responded_at = now()
     where id = share and recipient_id = me and status = 'pending';
  else
    delete from public.task_shares where id = share and recipient_id = me;
  end if;
  if not found then raise exception 'Demande introuvable (déjà traitée ou annulée).'; end if;
end;
$$;

revoke execute on function public.has_task_share(uuid, uuid, text), public.shares_tasks_with(uuid),
  public.find_students(text), public.respond_task_share(uuid, boolean) from public, anon;
grant execute on function public.has_task_share(uuid, uuid, text), public.shares_tasks_with(uuid),
  public.find_students(text), public.respond_task_share(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- Politiques élargies aux partages acceptés.
-- ---------------------------------------------------------------------
drop policy if exists "profiles : lire son profil et ceux de ses groupes" on public.profiles;
drop policy if exists "profiles : lire son profil, ses groupes et ses partages" on public.profiles;
create policy "profiles : lire son profil, ses groupes et ses partages"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.shares_group_with(id) or public.shares_tasks_with(id));

drop policy if exists "todo_lists : voir les siennes et celles de ses groupes" on public.todo_lists;
create policy "todo_lists : voir les siennes et celles de ses groupes"
  on public.todo_lists for select to authenticated
  using (
    user_id = (select auth.uid())
    or (group_id is not null and public.is_group_member(group_id))
    or public.has_task_share(user_id, id, scope)
  );

drop policy if exists "todo_items : ajouter" on public.todo_items;
create policy "todo_items : ajouter"
  on public.todo_items for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.todo_lists l
       where l.id = list_id
         and (l.user_id = (select auth.uid())
              or (l.group_id is not null and public.is_group_member(l.group_id))
              or public.has_task_share(l.user_id, l.id, l.scope))
    )
  );

-- Modifier : l'auteur, le propriétaire de la liste, un admin du groupe, ou l'étudiant
-- avec qui la liste est partagée (les tâches partagées sont modifiables par les deux).
drop policy if exists "todo_items : modifier" on public.todo_items;
create policy "todo_items : modifier"
  on public.todo_items for update to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.todo_lists l
       where l.id = list_id
         and (l.user_id = (select auth.uid())
              or (l.group_id is not null and public.is_group_admin(l.group_id))
              or public.has_task_share(l.user_id, l.id, l.scope))
    )
  );

-- Temps réel : le destinataire voit arriver la demande, le propriétaire voit l'acceptation.
do $$
begin
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'task_shares') then
    alter publication supabase_realtime add table public.task_shares;
  end if;
end $$;
