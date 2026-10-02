-- =====================================================================
-- Horaire HELMO — notification push quand un document est ajouté à un projet.
-- À exécuter APRÈS 0007 (partages) et 0009 (documents).
-- SQL Editor → New query → Run. Script relançable.
-- Puis redéployer la fonction : npx supabase functions deploy send-reminders …
-- =====================================================================

-- null = pas encore traité par l'Edge Function.
alter table public.project_links add column if not exists notified_at timestamptz;
create index if not exists project_links_pending_idx on public.project_links (created_at) where notified_at is null;

-- ---------------------------------------------------------------------
-- Même principe que claim_message_notifications (0010) : réserve les liens pas
-- encore notifiés et renvoie une ligne par destinataire — propriétaire, membres
-- du groupe, étudiants dont le partage est accepté — sauf celui qui a ajouté le
-- lien. Un lien de plus de 10 minutes est marqué sans être envoyé.
-- ---------------------------------------------------------------------
create or replace function public.claim_link_notifications(max_rows integer default 200)
returns table (
  link_id uuid,
  recipient_id uuid,
  list_id uuid,
  project_title text,
  author_name text,
  title text
)
language sql
security definer
set search_path = ''
as $$
  with pending as (
    select k.id
      from public.project_links k
     where k.notified_at is null
     order by k.created_at
     limit max_rows
       for update skip locked
  ),
  claimed as (
    update public.project_links k
       set notified_at = now()
      from pending p
     where k.id = p.id
    returning k.id, k.list_id, k.user_id, k.title, k.created_at
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
  select c.id, r.recipient, c.list_id, l.title, coalesce(p.display_name, 'Étudiant'), c.title
    from claimed c
    join recipients r on r.id = c.id
    join public.todo_lists l on l.id = c.list_id
    left join public.profiles p on p.id = c.user_id
   where r.recipient <> c.user_id
     and c.created_at > now() - interval '10 minutes';
$$;

revoke execute on function public.claim_link_notifications(integer) from public, anon, authenticated;
grant execute on function public.claim_link_notifications(integer) to service_role;
