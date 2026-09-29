-- =====================================================================
-- Horaire HELMO — phase 4 : groupes, partage, statut "fait" par membre,
-- temps réel. À exécuter une fois : SQL Editor → New query → Run.
--
-- Principe de confidentialité : rien de ce qui existait n'est rendu visible
-- aux autres. Seuls les éléments EXPLICITEMENT partagés (group_id renseigné)
-- le deviennent, et uniquement pour les membres du groupe. Séances, notes,
-- lien .ics et abonnements push restent strictement personnels.
-- =====================================================================

-- La vue et la fonction de la phase 3 dépendent de colonnes modifiées ici :
-- on les supprime, puis on les recrée à la fin.
drop function if exists public.claim_due_reminders(integer);
drop view if exists public.reminder_schedule;

-- ---------------------------------------------------------------------
-- Groupes et membres
-- ---------------------------------------------------------------------

-- Code d'invitation : 12 caractères hexadécimaux issus de gen_random_uuid()
-- (générateur aléatoire sûr), soit 48 bits : impossible à deviner par essais.
create or replace function public.new_invite_code()
returns text
language sql
volatile
set search_path = ''
as $$
  select upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
$$;

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  invite_code text not null unique default public.new_invite_code(),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  -- référence profiles (et non auth.users) : permet de récupérer le nom affiché en une requête
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index group_members_user_idx on public.group_members (user_id);

-- Fonctions utilisées par les politiques RLS. security definer : elles lisent
-- group_members sans repasser par son propre RLS (sinon : récursion infinie).
create or replace function public.is_group_member(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.group_members where group_id = gid and user_id = (select auth.uid()));
$$;

create or replace function public.is_group_admin(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.group_members where group_id = gid and user_id = (select auth.uid()) and role = 'admin'
  );
$$;

create or replace function public.shares_group_with(other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.group_members mine
      join public.group_members theirs on theirs.group_id = mine.group_id
     where mine.user_id = (select auth.uid()) and theirs.user_id = other
  );
$$;

revoke execute on function public.is_group_member(uuid), public.is_group_admin(uuid), public.shares_group_with(uuid) from public, anon;
grant execute on function public.is_group_member(uuid), public.is_group_admin(uuid), public.shares_group_with(uuid) to authenticated;

alter table public.groups enable row level security;
alter table public.group_members enable row level security;

create policy "groups : les membres voient leur groupe"
  on public.groups for select to authenticated
  using (public.is_group_member(id));

create policy "groups : les admins renomment"
  on public.groups for update to authenticated
  using (public.is_group_admin(id))
  with check (public.is_group_admin(id));

create policy "groups : les admins suppriment"
  on public.groups for delete to authenticated
  using (public.is_group_admin(id));

create policy "group_members : les membres voient les autres membres"
  on public.group_members for select to authenticated
  using (public.is_group_member(group_id));

-- Créer un groupe, rejoindre, quitter, gérer les membres : uniquement via les
-- fonctions ci-dessous, qui font plusieurs opérations d'un coup et vérifient les droits.
revoke insert on public.groups from anon, authenticated;
revoke insert, update, delete on public.group_members from anon, authenticated;

-- Les membres d'un même groupe voient le nom affiché des autres (et rien d'autre :
-- profiles ne contient que le nom).
drop policy "profiles : lire son profil" on public.profiles;
create policy "profiles : lire son profil et ceux de ses groupes"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.shares_group_with(id));

create or replace function public.create_group(group_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  gid uuid;
begin
  if me is null then raise exception 'Non connecté.'; end if;
  if char_length(trim(group_name)) not between 1 and 80 then
    raise exception 'Le nom du groupe doit faire entre 1 et 80 caractères.';
  end if;
  insert into public.groups (name, created_by) values (trim(group_name), me) returning id into gid;
  insert into public.group_members (group_id, user_id, role) values (gid, me, 'admin');
  return gid;
end;
$$;

create or replace function public.join_group(code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  gid uuid;
begin
  if me is null then raise exception 'Non connecté.'; end if;
  -- On tolère minuscules, espaces et tirets dans le code saisi.
  select id into gid from public.groups where invite_code = upper(regexp_replace(code, '[^A-Za-z0-9]', '', 'g'));
  if gid is null then raise exception 'Code d''invitation inconnu.' using errcode = 'P0002'; end if;
  insert into public.group_members (group_id, user_id) values (gid, me) on conflict do nothing;
  return gid;
end;
$$;

create or replace function public.leave_group(gid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  delete from public.group_members where group_id = gid and user_id = me;
  if not found then return; end if;
  if not exists (select 1 from public.group_members where group_id = gid) then
    delete from public.groups where id = gid; -- plus personne : le groupe disparaît
  elsif not exists (select 1 from public.group_members where group_id = gid and role = 'admin') then
    -- plus d'administrateur : le membre le plus ancien le devient
    update public.group_members set role = 'admin'
     where group_id = gid
       and user_id = (select user_id from public.group_members where group_id = gid order by joined_at limit 1);
  end if;
end;
$$;

create or replace function public.remove_group_member(gid uuid, member uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_group_admin(gid) then raise exception 'Réservé aux administrateurs du groupe.'; end if;
  if member = auth.uid() then raise exception 'Pour partir soi-même, utilise « Quitter le groupe ».'; end if;
  delete from public.group_members where group_id = gid and user_id = member;
end;
$$;

create or replace function public.set_group_member_role(gid uuid, member uuid, new_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_group_admin(gid) then raise exception 'Réservé aux administrateurs du groupe.'; end if;
  if new_role not in ('admin', 'member') then raise exception 'Rôle inconnu.'; end if;
  if new_role = 'member'
     and (select count(*) from public.group_members where group_id = gid and role = 'admin' and user_id <> member) = 0 then
    raise exception 'Le groupe doit garder au moins un administrateur.';
  end if;
  update public.group_members set role = new_role where group_id = gid and user_id = member;
end;
$$;

create or replace function public.regenerate_invite_code(gid uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  code text;
begin
  if not public.is_group_admin(gid) then raise exception 'Réservé aux administrateurs du groupe.'; end if;
  update public.groups set invite_code = public.new_invite_code() where id = gid returning invite_code into code;
  return code;
end;
$$;

revoke execute on function
  public.create_group(text), public.join_group(text), public.leave_group(uuid),
  public.remove_group_member(uuid, uuid), public.set_group_member_role(uuid, uuid, text),
  public.regenerate_invite_code(uuid), public.new_invite_code()
  from public, anon;
grant execute on function
  public.create_group(text), public.join_group(text), public.leave_group(uuid),
  public.remove_group_member(uuid, uuid), public.set_group_member_role(uuid, uuid, text),
  public.regenerate_invite_code(uuid)
  to authenticated;

-- ---------------------------------------------------------------------
-- Deadlines : partage + "fait" par membre (table deadline_completions,
-- comme todo_completions). Les deadlines déjà terminées sont reprises.
-- ---------------------------------------------------------------------
create table public.deadline_completions (
  deadline_id uuid not null references public.deadlines (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  done_at timestamptz not null default now(),
  primary key (deadline_id, user_id)
);

insert into public.deadline_completions (deadline_id, user_id, done_at)
  select id, user_id, done_at from public.deadlines where done_at is not null;
alter table public.deadlines drop column done_at;

alter table public.deadlines add column group_id uuid references public.groups (id) on delete set null;
create index deadlines_group_idx on public.deadlines (group_id) where group_id is not null;

drop policy "deadlines : gérer ses deadlines" on public.deadlines;

create policy "deadlines : voir les siennes et celles de ses groupes"
  on public.deadlines for select to authenticated
  using (user_id = (select auth.uid()) or (group_id is not null and public.is_group_member(group_id)));

create policy "deadlines : créer (partage seulement vers ses groupes)"
  on public.deadlines for insert to authenticated
  with check (user_id = (select auth.uid()) and (group_id is null or public.is_group_member(group_id)));

-- Modifier : l'auteur, ou un admin du groupe pour une deadline partagée.
-- Après modification, une deadline privée doit appartenir à celui qui modifie.
create policy "deadlines : modifier (auteur ou admin du groupe)"
  on public.deadlines for update to authenticated
  using (user_id = (select auth.uid()) or (group_id is not null and public.is_group_admin(group_id)))
  with check (
    (group_id is null and user_id = (select auth.uid()))
    or (group_id is not null and public.is_group_member(group_id))
  );

create policy "deadlines : supprimer (auteur ou admin du groupe)"
  on public.deadlines for delete to authenticated
  using (user_id = (select auth.uid()) or (group_id is not null and public.is_group_admin(group_id)));

alter table public.deadline_completions enable row level security;

-- Visible : ses propres coches, et celles des autres sur une deadline qu'on voit
-- (en pratique : les deadlines partagées de ses groupes).
create policy "deadline_completions : voir"
  on public.deadline_completions for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (select 1 from public.deadlines d where d.id = deadline_id and d.group_id is not null)
  );

create policy "deadline_completions : cocher pour soi"
  on public.deadline_completions for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (select 1 from public.deadlines d where d.id = deadline_id));

create policy "deadline_completions : décocher pour soi"
  on public.deadline_completions for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- Listes de tâches partagées (les tâches suivent leur liste).
-- Une liste liée à une séance ne peut pas être partagée : les UID de
-- séances diffèrent d'un étudiant à l'autre.
-- ---------------------------------------------------------------------
alter table public.todo_lists add column group_id uuid references public.groups (id) on delete set null;
alter table public.todo_lists add constraint todo_lists_shared_not_session check (group_id is null or scope <> 'session');
create index todo_lists_group_idx on public.todo_lists (group_id) where group_id is not null;

drop policy "todo_lists : gérer ses listes" on public.todo_lists;

create policy "todo_lists : voir les siennes et celles de ses groupes"
  on public.todo_lists for select to authenticated
  using (user_id = (select auth.uid()) or (group_id is not null and public.is_group_member(group_id)));

create policy "todo_lists : créer"
  on public.todo_lists for insert to authenticated
  with check (user_id = (select auth.uid()) and (group_id is null or public.is_group_member(group_id)));

create policy "todo_lists : modifier (auteur ou admin du groupe)"
  on public.todo_lists for update to authenticated
  using (user_id = (select auth.uid()) or (group_id is not null and public.is_group_admin(group_id)))
  with check (
    (group_id is null and user_id = (select auth.uid()))
    or (group_id is not null and public.is_group_member(group_id))
  );

create policy "todo_lists : supprimer (auteur ou admin du groupe)"
  on public.todo_lists for delete to authenticated
  using (user_id = (select auth.uid()) or (group_id is not null and public.is_group_admin(group_id)));

drop policy "todo_items : gérer ses tâches" on public.todo_items;

create policy "todo_items : voir les tâches des listes visibles"
  on public.todo_items for select to authenticated
  using (exists (select 1 from public.todo_lists l where l.id = list_id));

-- Ajouter : dans ses listes, ou dans une liste partagée d'un de ses groupes.
create policy "todo_items : ajouter"
  on public.todo_items for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.todo_lists l
       where l.id = list_id
         and (l.user_id = (select auth.uid()) or (l.group_id is not null and public.is_group_member(l.group_id)))
    )
  );

-- Modifier / supprimer : l'auteur de la tâche, le propriétaire de la liste, ou un admin du groupe.
create policy "todo_items : modifier"
  on public.todo_items for update to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.todo_lists l
       where l.id = list_id
         and (l.user_id = (select auth.uid()) or (l.group_id is not null and public.is_group_admin(l.group_id)))
    )
  );

create policy "todo_items : supprimer"
  on public.todo_items for delete to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.todo_lists l
       where l.id = list_id
         and (l.user_id = (select auth.uid()) or (l.group_id is not null and public.is_group_admin(l.group_id)))
    )
  );

drop policy "todo_completions : gérer ses coches" on public.todo_completions;

create policy "todo_completions : voir"
  on public.todo_completions for select to authenticated
  using (user_id = (select auth.uid()) or exists (select 1 from public.todo_items i where i.id = item_id));

create policy "todo_completions : cocher pour soi"
  on public.todo_completions for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (select 1 from public.todo_items i where i.id = item_id));

create policy "todo_completions : décocher pour soi"
  on public.todo_completions for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- Rappels partagés : group_id renseigné = tous les membres sont notifiés.
-- Uniquement sur une deadline ou une tâche partagée avec CE groupe.
-- Chacun peut couper un rappel partagé pour lui-même (reminder_mutes).
-- ---------------------------------------------------------------------
alter table public.reminders add column group_id uuid references public.groups (id) on delete cascade;
alter table public.reminders add constraint reminders_shared_not_session check (group_id is null or session_id is null);

drop policy "reminders : gérer ses rappels" on public.reminders;

create policy "reminders : voir les siens et ceux de ses groupes"
  on public.reminders for select to authenticated
  using (user_id = (select auth.uid()) or (group_id is not null and public.is_group_member(group_id)));

create policy "reminders : créer"
  on public.reminders for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (
      (session_id is not null and exists (select 1 from public.sessions s where s.id = session_id))
      or (deadline_id is not null and exists (
            select 1 from public.deadlines d
             where d.id = deadline_id and (reminders.group_id is null or d.group_id = reminders.group_id)))
      or (todo_item_id is not null and exists (
            select 1 from public.todo_items i join public.todo_lists l on l.id = i.list_id
             where i.id = todo_item_id and (reminders.group_id is null or l.group_id = reminders.group_id)))
    )
    and (group_id is null or public.is_group_member(group_id))
  );

create policy "reminders : supprimer (auteur ou admin du groupe)"
  on public.reminders for delete to authenticated
  using (user_id = (select auth.uid()) or (group_id is not null and public.is_group_admin(group_id)));

create table public.reminder_mutes (
  reminder_id uuid not null references public.reminders (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  primary key (reminder_id, user_id)
);

alter table public.reminder_mutes enable row level security;

create policy "reminder_mutes : gérer les siens"
  on public.reminder_mutes for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and exists (select 1 from public.reminders r where r.id = reminder_id));

-- ---------------------------------------------------------------------
-- Vue des rappels (recréée) : "fait" et "coupé" sont calculés pour la
-- personne qui lit (auth.uid()) ; à défaut (serveur), pour l'auteur.
-- ---------------------------------------------------------------------
create view public.reminder_schedule
with (security_invoker = true)
as
select
  r.id,
  r.user_id,
  r.group_id,
  r.offset_minutes,
  r.remind_at,
  r.sent_at,
  r.created_at,
  case
    when r.session_id is not null then 'session'
    when r.deadline_id is not null then 'deadline'
    else 'todo'
  end as target_type,
  coalesce(r.session_id, r.deadline_id, r.todo_item_id) as target_id,
  t.target_at,
  t.target_title,
  t.target_detail,
  case
    when r.session_id is not null then t.cancelled
    when r.deadline_id is not null then exists (
      select 1 from public.deadline_completions dc
       where dc.deadline_id = r.deadline_id and dc.user_id = coalesce((select auth.uid()), r.user_id))
    else exists (
      select 1 from public.todo_completions tc
       where tc.item_id = r.todo_item_id and tc.user_id = coalesce((select auth.uid()), r.user_id))
  end as target_done,
  exists (select 1 from public.reminder_mutes m where m.reminder_id = r.id and m.user_id = (select auth.uid())) as muted,
  coalesce(r.remind_at, t.target_at - make_interval(mins => r.offset_minutes)) as fire_at
from public.reminders r
left join lateral (
  select s.start_at as target_at, s.title as target_title, s.location as target_detail, s.status = 'cancelled' as cancelled
    from public.sessions s where s.id = r.session_id
  union all
  select d.due_at, d.title, d.course_name, false
    from public.deadlines d where d.id = r.deadline_id
  union all
  select i.due_at, i.title, l.title, false
    from public.todo_items i join public.todo_lists l on l.id = i.list_id
   where i.id = r.todo_item_id
) t on true;

grant select on public.reminder_schedule to authenticated;

-- Réserve les rappels dus et renvoie une ligne PAR DESTINATAIRE :
-- l'auteur pour un rappel personnel, chaque membre (sauf ceux qui l'ont coupé)
-- pour un rappel partagé. "Fait" est évalué pour chaque destinataire.
create or replace function public.claim_due_reminders(max_rows integer default 200)
returns table (
  id uuid,
  recipient_id uuid,
  target_type text,
  target_title text,
  target_detail text,
  target_at timestamptz,
  target_done boolean,
  fire_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  with due as (
    select r.id
      from public.reminders r
      join public.reminder_schedule s on s.id = r.id
     where r.sent_at is null
       and s.fire_at <= now()
     order by s.fire_at
     limit max_rows
       for update of r skip locked
  ),
  claimed as (
    update public.reminders r
       set sent_at = now()
      from due
     where r.id = due.id
    returning r.id, r.user_id, r.group_id, r.session_id, r.deadline_id, r.todo_item_id
  )
  select c.id, m.user_id, s.target_type, s.target_title, s.target_detail, s.target_at,
         case
           when c.session_id is not null then coalesce(s.target_done, false)
           when c.deadline_id is not null then exists (
             select 1 from public.deadline_completions dc where dc.deadline_id = c.deadline_id and dc.user_id = m.user_id)
           else exists (
             select 1 from public.todo_completions tc where tc.item_id = c.todo_item_id and tc.user_id = m.user_id)
         end,
         s.fire_at
    from claimed c
    join public.reminder_schedule s on s.id = c.id
    cross join lateral (
      select c.user_id where c.group_id is null
      union
      select gm.user_id from public.group_members gm where c.group_id is not null and gm.group_id = c.group_id
    ) as m (user_id)
   where not exists (select 1 from public.reminder_mutes rm where rm.reminder_id = c.id and rm.user_id = m.user_id);
$$;

revoke execute on function public.claim_due_reminders(integer) from public, anon, authenticated;
grant execute on function public.claim_due_reminders(integer) to service_role;

-- ---------------------------------------------------------------------
-- Temps réel : Supabase Realtime diffuse les changements de ces tables aux
-- navigateurs connectés, en respectant le RLS (chacun ne reçoit que ce qu'il voit).
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table
  public.groups, public.group_members, public.deadlines, public.deadline_completions,
  public.todo_lists, public.todo_items, public.todo_completions, public.reminders;
