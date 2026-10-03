-- =====================================================================
-- Horaire HELMO — débrief quotidien plus complet.
-- À exécuter APRÈS 0007 (partages), 0008 (discussion), 0014 (non lus), 0015 (copies).
-- SQL Editor → New query → Run. Script relançable.
-- Puis redéployer la fonction : npx supabase functions deploy send-reminders …
--
-- Une notification par jour, à l'heure choisie dans Rappels :
--   - pour demain : les cours, la LISTE des tâches à faire, les échéances ;
--   - aujourd'hui : tâches faites / restantes, messages non lus dans les discussions,
--     tâches que les autres ont ajoutées dans mes listes partagées, copies de tâches reçues.
-- Corrige aussi le compte « pour demain » : une tâche de séance sans échéance compte
-- pour le jour de sa séance (comme dans la page Tâches), et les listes partagées par un
-- étudiant (0007) sont prises en compte, plus seulement celles des groupes.
-- =====================================================================

-- Le type de retour change : il faut supprimer l'ancienne fonction avant de la recréer.
drop function if exists public.claim_daily_digests();

create function public.claim_daily_digests()
returns table (
  user_id uuid,
  done_today integer,
  left_today integer,
  tomorrow_tasks integer,
  tomorrow_deadlines integer,
  tomorrow_sessions integer,
  tomorrow_first timestamptz,
  next_eval_title text,
  next_eval_at timestamptz,
  tomorrow_titles text[],   -- titres des tâches de demain (8 au plus, dans l'ordre de leur heure)
  unread_messages integer,  -- messages des autres, non lus, dans mes discussions de projet
  new_tasks integer,        -- tâches ajoutées aujourd'hui par d'autres dans des listes que je vois
  pending_offers integer    -- copies de tâches reçues, pas encore acceptées ni refusées
)
language sql
security definer
set search_path = ''
as $$
  with ctx as (
    select (now() at time zone 'Europe/Brussels')::date as today,
           extract(hour from now() at time zone 'Europe/Brussels')::int as hour
  ),
  candidates as (
    select distinct ps.user_id
      from public.push_subscriptions ps
      left join public.user_settings us on us.user_id = ps.user_id
      cross join ctx
     where coalesce(us.digest_enabled, true)
       and coalesce(us.digest_hour, 20) = ctx.hour
       and (us.digest_last_sent is null or us.digest_last_sent < ctx.today)
  ),
  -- digest_last_sent est posé AVANT l'envoi : jamais deux débriefs le même jour.
  claimed as (
    insert into public.user_settings (user_id, digest_last_sent)
    select c.user_id, ctx.today from candidates c cross join ctx
    on conflict on constraint user_settings_pkey do update
      set digest_last_sent = excluded.digest_last_sent, updated_at = now()
      where public.user_settings.digest_last_sent is distinct from excluded.digest_last_sent
    returning public.user_settings.user_id
  ),
  -- Listes visibles par chaque étudiant : les siennes, celles de ses groupes, celles partagées avec lui.
  visible as (
    select cl.user_id as uid, l.id as list_id, l.scope, l.session_start
      from claimed cl
      join public.todo_lists l
        on l.user_id = cl.user_id
        or (l.group_id is not null and exists (
              select 1 from public.group_members gm where gm.group_id = l.group_id and gm.user_id = cl.user_id))
        or exists (
              select 1 from public.task_shares s
               where s.recipient_id = cl.user_id and s.owner_id = l.user_id and s.status = 'accepted'
                 and (s.list_id = l.id or (s.list_id is null and l.scope <> 'project')))
  ),
  items as (
    select v.uid, i.id, i.title, i.user_id as author, i.created_at,
           -- Date de la tâche : son échéance, sinon le début de sa séance.
           coalesce(i.due_at, case when v.scope = 'session' then v.session_start end) as task_at,
           exists (select 1 from public.todo_completions tc where tc.item_id = i.id and tc.user_id = v.uid) as done,
           exists (select 1 from public.todo_item_flags f where f.item_id = i.id and f.user_id = v.uid
                     and f.my_day = (select today from ctx)) as in_my_day
      from visible v
      join public.todo_items i on i.list_id = v.list_id
  )
  select
    cl.user_id,
    (select count(*) from public.todo_completions tc
      where tc.user_id = cl.user_id and (tc.done_at at time zone 'Europe/Brussels')::date = ctx.today)::int
    + (select count(*) from public.deadline_completions dc
      where dc.user_id = cl.user_id and (dc.done_at at time zone 'Europe/Brussels')::date = ctx.today)::int,
    (select count(*) from items it
      where it.uid = cl.user_id and not it.done
        and ((it.task_at at time zone 'Europe/Brussels')::date <= ctx.today or it.in_my_day))::int,
    (select count(*) from items it
      where it.uid = cl.user_id and not it.done and (it.task_at at time zone 'Europe/Brussels')::date = ctx.today + 1)::int,
    (select count(*) from public.deadlines d
      where (d.user_id = cl.user_id or (d.group_id is not null and exists (
               select 1 from public.group_members gm where gm.group_id = d.group_id and gm.user_id = cl.user_id)))
        and (d.due_at at time zone 'Europe/Brussels')::date = ctx.today + 1
        and not exists (select 1 from public.deadline_completions dc where dc.deadline_id = d.id and dc.user_id = cl.user_id))::int,
    (select count(*) from public.sessions s
      where s.user_id = cl.user_id and s.status = 'active'
        and (s.start_at at time zone 'Europe/Brussels')::date = ctx.today + 1)::int,
    (select min(s.start_at) from public.sessions s
      where s.user_id = cl.user_id and s.status = 'active'
        and (s.start_at at time zone 'Europe/Brussels')::date = ctx.today + 1),
    ev.title,
    ev.start_at,
    (select array_agg(t.title order by t.task_at, t.title)
       from (select it.title, it.task_at from items it
              where it.uid = cl.user_id and not it.done and (it.task_at at time zone 'Europe/Brussels')::date = ctx.today + 1
              order by it.task_at, it.title
              limit 8) t),
    (select count(*) from visible v
       join public.project_messages m on m.list_id = v.list_id
       left join public.project_reads r on r.list_id = m.list_id and r.user_id = cl.user_id
      where v.uid = cl.user_id and m.user_id <> cl.user_id
        and (r.last_read_at is null or m.created_at > r.last_read_at))::int,
    (select count(*) from items it
      where it.uid = cl.user_id and it.author <> cl.user_id
        and (it.created_at at time zone 'Europe/Brussels')::date = ctx.today)::int,
    (select count(*) from public.task_offers o where o.recipient_id = cl.user_id)::int
  from claimed cl
  cross join ctx
  left join lateral (
    select s.title, s.start_at from public.sessions s
     where s.user_id = cl.user_id and s.status = 'active'
       and s.start_at > now() and s.start_at < now() + interval '7 days'
       and s.title ~* '([ée]valuation|examen|interro)'
     order by s.start_at limit 1
  ) ev on true;
$$;

revoke execute on function public.claim_daily_digests() from public, anon, authenticated;
grant execute on function public.claim_daily_digests() to service_role;
