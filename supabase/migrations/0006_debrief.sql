-- =====================================================================
-- Horaire HELMO — débrief quotidien par notification.
-- SQL Editor → New query → Run. Script relançable.
-- Puis redéployer la fonction : npx supabase functions deploy send-reminders …
-- =====================================================================

-- Réglages personnels. Sans ligne, les valeurs par défaut s'appliquent (activé, 20 h).
create table if not exists public.user_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  digest_enabled boolean not null default true,
  digest_hour smallint not null default 20 check (digest_hour between 0 and 23), -- heure de Bruxelles
  digest_last_sent date,                                                         -- jour (Bruxelles) du dernier envoi
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

drop policy if exists "user_settings : gérer les siens" on public.user_settings;
create policy "user_settings : gérer les siens"
  on public.user_settings for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- Appelée chaque minute par l'Edge Function. Renvoie le bilan des étudiants
-- dont c'est l'heure de débrief (heure de Bruxelles), une seule fois par jour :
-- digest_last_sent est posé AVANT l'envoi ; si deux exécutions se chevauchent,
-- la condition "is distinct from" empêche la seconde de renvoyer le même jour.
-- ---------------------------------------------------------------------
create or replace function public.claim_daily_digests()
returns table (
  user_id uuid,
  done_today integer,
  left_today integer,
  tomorrow_tasks integer,
  tomorrow_deadlines integer,
  tomorrow_sessions integer,
  tomorrow_first timestamptz,
  next_eval_title text,
  next_eval_at timestamptz
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
  claimed as (
    insert into public.user_settings (user_id, digest_last_sent)
    select c.user_id, ctx.today from candidates c cross join ctx
    on conflict on constraint user_settings_pkey do update
      set digest_last_sent = excluded.digest_last_sent, updated_at = now()
      where public.user_settings.digest_last_sent is distinct from excluded.digest_last_sent
    returning public.user_settings.user_id
  ),
  -- Tâches visibles par chaque étudiant : ses listes + celles partagées avec ses groupes.
  items as (
    select cl.user_id as uid, i.id, (i.due_at at time zone 'Europe/Brussels')::date as due_day,
           exists (select 1 from public.todo_completions tc where tc.item_id = i.id and tc.user_id = cl.user_id) as done,
           exists (select 1 from public.todo_item_flags f where f.item_id = i.id and f.user_id = cl.user_id
                     and f.my_day = (select today from ctx)) as in_my_day
      from claimed cl
      join public.todo_lists l on l.user_id = cl.user_id
        or (l.group_id is not null and exists (
              select 1 from public.group_members gm where gm.group_id = l.group_id and gm.user_id = cl.user_id))
      join public.todo_items i on i.list_id = l.id
  )
  select
    cl.user_id,
    (select count(*) from public.todo_completions tc
      where tc.user_id = cl.user_id and (tc.done_at at time zone 'Europe/Brussels')::date = ctx.today)::int
    + (select count(*) from public.deadline_completions dc
      where dc.user_id = cl.user_id and (dc.done_at at time zone 'Europe/Brussels')::date = ctx.today)::int,
    (select count(*) from items it where it.uid = cl.user_id and not it.done and (it.due_day <= ctx.today or it.in_my_day))::int,
    (select count(*) from items it where it.uid = cl.user_id and not it.done and it.due_day = ctx.today + 1)::int,
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
    ev.start_at
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
