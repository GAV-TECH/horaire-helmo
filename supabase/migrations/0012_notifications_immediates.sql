-- =====================================================================
-- Horaire HELMO — notifications de projet envoyées tout de suite.
-- À exécuter APRÈS 0010 / 0011 et après supabase/cron.local.sql (secret dans Vault).
-- SQL Editor → New query → Run. Script relançable.
--
-- Avant : un message attendait le passage de la tâche planifiée (jusqu'à 1 minute).
-- Maintenant : chaque nouveau message ou document appelle lui-même l'Edge Function
-- send-reminders. La tâche planifiée reste en place, comme filet de sécurité.
-- =====================================================================

create extension if not exists pg_net;

-- security definer : s'exécute avec les droits du créateur (postgres), seul à pouvoir lire
-- le secret dans Vault. L'utilisateur qui écrit un message ne voit jamais ce secret.
create or replace function public.kick_send_reminders()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- pg_net met la requête en file d'attente et ne l'envoie qu'après la validation de la
  -- transaction : quand la fonction s'exécute, le message est déjà visible en base.
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
  -- Un souci d'envoi ne doit JAMAIS empêcher d'écrire le message : la tâche planifiée
  -- (chaque minute) le notifiera.
  return null;
end;
$$;

revoke execute on function public.kick_send_reminders() from public, anon, authenticated;

-- "for each statement" : un seul appel même si plusieurs lignes sont insérées d'un coup.
drop trigger if exists project_messages_kick on public.project_messages;
create trigger project_messages_kick
  after insert on public.project_messages
  for each statement execute function public.kick_send_reminders();

drop trigger if exists project_links_kick on public.project_links;
create trigger project_links_kick
  after insert on public.project_links
  for each statement execute function public.kick_send_reminders();
