-- =====================================================================
-- Horaire HELMO — notification push à chaque message d'une discussion de projet.
-- À exécuter APRÈS 0007 (partages) et 0008 (discussion).
-- SQL Editor → New query → Run. Script relançable.
-- Puis redéployer la fonction : npx supabase functions deploy send-reminders …
-- =====================================================================

-- null = pas encore traité par l'Edge Function.
alter table public.project_messages add column if not exists notified_at timestamptz;
create index if not exists project_messages_pending_idx on public.project_messages (created_at) where notified_at is null;

-- Pas de politique UPDATE sur la table : seul le serveur (service_role) modifie notified_at.

-- ---------------------------------------------------------------------
-- Appelée chaque minute par l'Edge Function send-reminders. Réserve les messages
-- pas encore notifiés (jamais deux fois : "for update skip locked" + notified_at)
-- et renvoie une ligne par destinataire : tous ceux qui voient le projet —
-- propriétaire, membres du groupe, étudiants dont le partage est accepté —
-- sauf l'auteur. Un message de plus de 10 minutes est marqué sans être envoyé
-- (pas de rafale de vieilles notifications après une panne ou à l'installation).
-- ---------------------------------------------------------------------
create or replace function public.claim_message_notifications(max_rows integer default 200)
returns table (
  message_id uuid,
  recipient_id uuid,
  list_id uuid,
  project_title text,
  author_name text,
  body text
)
language sql
security definer
set search_path = ''
as $$
  with pending as (
    select m.id
      from public.project_messages m
     where m.notified_at is null
     order by m.created_at
     limit max_rows
       for update skip locked
  ),
  claimed as (
    update public.project_messages m
       set notified_at = now()
      from pending p
     where m.id = p.id
    returning m.id, m.list_id, m.user_id, m.author_name, m.body, m.created_at
  ),
  recipients as (
    select c.id, l.user_id as recipient
      from claimed c join public.todo_lists l on l.id = c.list_id
    union
    select c.id, gm.user_id
      from claimed c
      join public.todo_lists l on l.id = c.list_id
      join public.group_members gm on gm.group_id = l.group_id
    union
    select c.id, s.recipient_id
      from claimed c
      join public.task_shares s on s.list_id = c.list_id and s.status = 'accepted'
  )
  select c.id, r.recipient, c.list_id, l.title, c.author_name, c.body
    from claimed c
    join recipients r on r.id = c.id
    join public.todo_lists l on l.id = c.list_id
   where r.recipient <> c.user_id
     and c.created_at > now() - interval '10 minutes';
$$;

revoke execute on function public.claim_message_notifications(integer) from public, anon, authenticated;
grant execute on function public.claim_message_notifications(integer) to service_role;
