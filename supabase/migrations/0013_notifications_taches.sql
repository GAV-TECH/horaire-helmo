-- =====================================================================
-- Horaire HELMO — notification push quand une tâche est ajoutée à une liste partagée.
-- À exécuter APRÈS 0007 (partages) et 0012 (envoi immédiat).
-- SQL Editor → New query → Run. Script relançable.
-- Puis redéployer la fonction : npx supabase functions deploy send-reminders …
-- =====================================================================

-- null = pas encore traité par l'Edge Function.
alter table public.todo_items add column if not exists notified_at timestamptz;
create index if not exists todo_items_pending_idx on public.todo_items (created_at) where notified_at is null;

-- Les tâches qui existent déjà ne doivent pas être annoncées : on les marque comme traitées.
update public.todo_items set notified_at = created_at where notified_at is null and created_at < now() - interval '10 minutes';

-- ---------------------------------------------------------------------
-- Même principe que claim_message_notifications (0010). Destinataires d'une tâche :
-- tous ceux qui voient sa liste — propriétaire, membres du groupe, étudiants dont le
-- partage est accepté (cette liste, ou « toutes mes tâches » hors projets) — sauf
-- celui qui a ajouté la tâche. Liste privée : aucun destinataire, donc rien n'est envoyé.
-- ---------------------------------------------------------------------
create or replace function public.claim_task_notifications(max_rows integer default 200)
returns table (
  item_id uuid,
  recipient_id uuid,
  list_id uuid,
  list_title text,
  list_scope text,
  author_name text,
  title text
)
language sql
security definer
set search_path = ''
as $$
  with pending as (
    select i.id
      from public.todo_items i
     where i.notified_at is null
     order by i.created_at
     limit max_rows
       for update skip locked
  ),
  claimed as (
    update public.todo_items i
       set notified_at = now()
      from pending p
     where i.id = p.id
    returning i.id, i.list_id, i.user_id, i.title, i.created_at
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
      join public.todo_lists l on l.id = c.list_id
      join public.task_shares s
        on s.owner_id = l.user_id
       and s.status = 'accepted'
       and (s.list_id = l.id or (s.list_id is null and l.scope <> 'project'))
  )
  select c.id, r.recipient, c.list_id, l.title, l.scope, coalesce(p.display_name, 'Étudiant'), c.title
    from claimed c
    join recipients r on r.id = c.id
    join public.todo_lists l on l.id = c.list_id
    left join public.profiles p on p.id = c.user_id
   where r.recipient <> c.user_id
     and c.created_at > now() - interval '10 minutes';
$$;

revoke execute on function public.claim_task_notifications(integer) from public, anon, authenticated;
grant execute on function public.claim_task_notifications(integer) to service_role;

-- ---------------------------------------------------------------------
-- Envoi immédiat (comme 0012), mais seulement si la liste est partagée : inutile
-- d'appeler la fonction d'envoi à chaque tâche ajoutée dans une liste privée.
-- ---------------------------------------------------------------------
create or replace function public.kick_send_reminders_for_task()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.todo_lists l
     where l.id = new.list_id
       and (l.group_id is not null
            or exists (select 1 from public.task_shares s
                        where s.owner_id = l.user_id and s.status = 'accepted'
                          and (s.list_id = l.id or (s.list_id is null and l.scope <> 'project'))))
  ) then
    perform net.http_post(
      url := 'https://mlxgvpghjhqzfqsuekuw.supabase.co/functions/v1/send-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  end if;
  return null;
exception when others then
  return null; -- ne jamais empêcher d'ajouter la tâche ; la tâche planifiée notifiera
end;
$$;

revoke execute on function public.kick_send_reminders_for_task() from public, anon, authenticated;

drop trigger if exists todo_items_kick on public.todo_items;
create trigger todo_items_kick
  after insert on public.todo_items
  for each row execute function public.kick_send_reminders_for_task();
