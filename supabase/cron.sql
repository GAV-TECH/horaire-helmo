-- =====================================================================
-- Planification des rappels : appelle l'Edge Function "send-reminders"
-- chaque minute. À exécuter APRÈS avoir déployé la fonction (voir README).
--
-- Remplace les deux valeurs entre < > avant d'exécuter :
--   <PROJECT_REF>   : l'identifiant du projet (dans l'URL du dashboard)
--   <CRON_SECRET>   : le même secret que celui donné à la fonction
-- ⚠️ Ne commite pas ce fichier une fois rempli.
-- =====================================================================

-- pg_cron : planificateur de tâches ; pg_net : requêtes HTTP depuis Postgres.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Le secret est rangé dans Vault (coffre-fort chiffré de Supabase), pas en clair dans la tâche.
select vault.create_secret('<CRON_SECRET>', 'reminders_cron_secret');

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

-- Pour vérifier : select * from cron.job_run_details order by start_time desc limit 5;
-- Pour arrêter  : select cron.unschedule('send-reminders');
