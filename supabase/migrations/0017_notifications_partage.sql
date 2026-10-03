-- =====================================================================
-- Horaire HELMO — notification push quand on me partage des tâches.
-- À exécuter APRÈS 0007 (partages) et 0015 (copies de tâches).
-- SQL Editor → New query → Run. Script relançable.
-- Puis redéployer la fonction : npx supabase functions deploy send-reminders …
--
-- Deux cas, notifiés au destinataire :
--   - un étudiant m'envoie la copie d'une tâche (task_offers) ;
--   - un étudiant me demande de partager une liste ou toutes ses tâches (task_shares).
-- =====================================================================

-- null = pas encore traité par l'Edge Function.
alter table public.task_offers add column if not exists notified_at timestamptz;
alter table public.task_shares add column if not exists notified_at timestamptz;

-- Ce qui existe déjà ne doit pas être annoncé après coup.
update public.task_offers set notified_at = created_at where notified_at is null and created_at < now() - interval '10 minutes';
update public.task_shares set notified_at = created_at where notified_at is null and created_at < now() - interval '10 minutes';

-- ---------------------------------------------------------------------
-- Réserve les copies et les demandes de partage pas encore notifiées (jamais deux
-- fois) et renvoie une ligne par destinataire. kind = 'offer' (copie d'une tâche,
-- label = son titre) ou 'share' (demande de partage, label = « la liste … » ou
-- « toutes ses tâches »). Plus de 10 minutes : marqué sans être envoyé.
-- ---------------------------------------------------------------------
create or replace function public.claim_share_notifications(max_rows integer default 200)
returns table (
  kind text,
  id uuid,
  recipient_id uuid,
  sender_name text,
  label text
)
language sql
security definer
set search_path = ''
as $$
  with pending_offers as (
    select o.id from public.task_offers o
     where o.notified_at is null
     order by o.created_at
     limit max_rows
       for update skip locked
  ),
  offers as (
    update public.task_offers o
       set notified_at = now()
      from pending_offers p
     where o.id = p.id
    returning o.id, o.recipient_id, o.sender_name, o.title, o.created_at
  ),
  pending_shares as (
    select s.id from public.task_shares s
     where s.notified_at is null
     order by s.created_at
     limit max_rows
       for update skip locked
  ),
  shares as (
    update public.task_shares s
       set notified_at = now()
      from pending_shares p
     where s.id = p.id
    returning s.id, s.recipient_id, s.owner_id, s.label, s.status, s.created_at
  )
  select 'offer', o.id, o.recipient_id, o.sender_name, o.title
    from offers o
   where o.created_at > now() - interval '10 minutes'
  union all
  select 'share', s.id, s.recipient_id, coalesce(p.display_name, 'Étudiant'), s.label
    from shares s
    left join public.profiles p on p.id = s.owner_id
   where s.created_at > now() - interval '10 minutes'
     and s.status = 'pending';
$$;

revoke execute on function public.claim_share_notifications(integer) from public, anon, authenticated;
grant execute on function public.claim_share_notifications(integer) to service_role;

-- ---------------------------------------------------------------------
-- Envoi immédiat. Même fonction que dans 0012, redéfinie ici à l'identique pour que
-- ce script fonctionne même si 0012 n'a pas été exécuté.
-- ---------------------------------------------------------------------
create extension if not exists pg_net;

create or replace function public.kick_send_reminders()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform net.http_post(
    url := 'https://mlxgvpghjhqzfqsuekuw.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  return null;
exception when others then
  return null; -- ne jamais empêcher l'écriture ; la tâche planifiée (chaque minute) notifiera
end;
$$;

revoke execute on function public.kick_send_reminders() from public, anon, authenticated;

drop trigger if exists task_offers_kick on public.task_offers;
create trigger task_offers_kick
  after insert on public.task_offers
  for each statement execute function public.kick_send_reminders();

drop trigger if exists task_shares_kick on public.task_shares;
create trigger task_shares_kick
  after insert on public.task_shares
  for each statement execute function public.kick_send_reminders();
