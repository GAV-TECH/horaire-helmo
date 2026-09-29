-- =====================================================================
-- Planification des rappels : appelle l'Edge Function "send-reminders"
-- chaque minute. À exécuter APRÈS avoir déployé la fonction (voir README).
--
-- Ne pas remplir à la main : `npm run setup:push` génère supabase/cron.local.sql
-- avec l'identifiant du projet et le secret. Ce script peut être relancé sans risque.
-- =====================================================================

-- pg_cron : planificateur de tâches ; pg_net : requêtes HTTP depuis Postgres.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Le secret est rangé dans Vault (coffre-fort chiffré de Supabase), pas en clair dans la tâche.
-- Créé la première fois, mis à jour les fois suivantes.
do $$
declare
  existing uuid := (select id from vault.secrets where name = 'reminders_cron_secret');
begin
  if existing is null then
    perform vault.create_secret('<CRON_SECRET>', 'reminders_cron_secret');
  else
    perform vault.update_secret(existing, '<CRON_SECRET>');
  end if;
end $$;

-- Avec un nom déjà utilisé, cron.schedule remplace la tâche existante.
select cron.schedule(
  'send-reminders',
  '* * * * *', -- chaque minute
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

-- État (attendre 1 à 2 minutes puis relancer uniquement cette requête pour voir les exécutions) :
select 'tâche' as quoi, jobname as info, active::text as etat, null::timestamptz as quand from cron.job
union all
(select 'exécution', left(return_message, 120), status, start_time from cron.job_run_details order by start_time desc limit 3)
union all
(select 'appel http', coalesce(error_msg, left(content::text, 120)), status_code::text, created from net._http_response order by created desc limit 3);

-- Pour arrêter : select cron.unschedule('send-reminders');
