-- =====================================================================
-- Horaire HELMO — phase 3 : rappels et abonnements Web Push.
-- À exécuter une fois dans Supabase : SQL Editor → New query → Run.
-- (La planification toutes les minutes est dans supabase/cron.sql.)
-- =====================================================================

-- ---------------------------------------------------------------------
-- Rappels. Un rappel vise UNE cible : une séance, une deadline ou une tâche.
-- Moment : soit un décalage avant la cible (offset_minutes : 60 = 1 h avant),
-- soit une date précise (remind_at). Avec un décalage, le rappel suit la
-- cible si elle est déplacée (l'heure est recalculée à chaque passage).
-- ---------------------------------------------------------------------
create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_id uuid references public.sessions (id) on delete cascade,
  deadline_id uuid references public.deadlines (id) on delete cascade,
  todo_item_id uuid references public.todo_items (id) on delete cascade,
  offset_minutes integer check (offset_minutes between 0 and 43200), -- 30 jours max
  remind_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  -- exactement une cible
  check (num_nonnulls(session_id, deadline_id, todo_item_id) = 1),
  -- exactement une façon de fixer le moment
  check (num_nonnulls(offset_minutes, remind_at) = 1)
);

create index reminders_user_idx on public.reminders (user_id);
create index reminders_pending_idx on public.reminders (sent_at) where sent_at is null;

alter table public.reminders enable row level security;

-- La cible doit être visible par l'utilisateur (les sous-requêtes passent par le RLS
-- des tables visées) : impossible de poser un rappel sur la séance de quelqu'un d'autre.
create policy "reminders : gérer ses rappels"
  on public.reminders for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (
      (session_id is not null and exists (select 1 from public.sessions s where s.id = session_id))
      or (deadline_id is not null and exists (select 1 from public.deadlines d where d.id = deadline_id))
      or (todo_item_id is not null and exists (select 1 from public.todo_items i where i.id = todo_item_id))
    )
  );

-- ---------------------------------------------------------------------
-- Vue : chaque rappel avec sa cible et son heure de déclenchement (fire_at).
-- security_invoker : la vue applique le RLS de celui qui la lit.
-- ---------------------------------------------------------------------
create view public.reminder_schedule
with (security_invoker = true)
as
select
  r.id,
  r.user_id,
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
  t.target_done,
  coalesce(r.remind_at, t.target_at - make_interval(mins => r.offset_minutes)) as fire_at
from public.reminders r
left join lateral (
  select s.start_at as target_at, s.title as target_title, s.location as target_detail,
         s.status = 'cancelled' as target_done
    from public.sessions s where s.id = r.session_id
  union all
  select d.due_at, d.title, d.course_name, d.done_at is not null
    from public.deadlines d where d.id = r.deadline_id
  union all
  select i.due_at, i.title, l.title,
         exists (select 1 from public.todo_completions c where c.item_id = i.id and c.user_id = r.user_id)
    from public.todo_items i join public.todo_lists l on l.id = i.list_id
    where i.id = r.todo_item_id
) t on true;

grant select on public.reminder_schedule to authenticated;

-- ---------------------------------------------------------------------
-- Abonnements Web Push : un par appareil / navigateur.
-- ---------------------------------------------------------------------
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null unique check (char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  user_agent text check (char_length(user_agent) <= 300),
  created_at timestamptz not null default now()
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions : gérer ses appareils"
  on public.push_subscriptions for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- Appelée chaque minute par l'Edge Function "send-reminders" (clé secrète).
-- "Réserve" les rappels arrivés à échéance en posant sent_at AVANT l'envoi :
-- si deux exécutions se chevauchent, un rappel n'est jamais envoyé deux fois
-- (FOR UPDATE SKIP LOCKED : la 2e exécution saute les lignes déjà prises).
-- ---------------------------------------------------------------------
create or replace function public.claim_due_reminders(max_rows integer default 200)
returns table (
  id uuid,
  user_id uuid,
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
    returning r.id
  )
  select s.id, s.user_id, s.target_type, s.target_title, s.target_detail,
         s.target_at, coalesce(s.target_done, false), s.fire_at
    from public.reminder_schedule s
    join claimed c on c.id = s.id;
$$;

-- Personne d'autre que le serveur ne doit pouvoir l'appeler.
revoke execute on function public.claim_due_reminders(integer) from public, anon, authenticated;
grant execute on function public.claim_due_reminders(integer) to service_role;
