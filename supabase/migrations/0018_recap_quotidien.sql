-- =====================================================================
-- Horaire HELMO — trace du débrief quotidien dans l'app (page Rappels).
-- À exécuter APRÈS 0008 (discussion), 0009 (documents), 0014 (non lus).
-- SQL Editor → New query → Run. Script relançable.
-- Puis redéployer la fonction : npx supabase functions deploy send-reminders …
--
-- Chaque débrief envoyé est aussi enregistré ici : la notification disparaît,
-- le récap reste lisible dans Rappels. Il liste en plus les projets où il y a du
-- nouveau (messages non lus, documents ajoutés depuis 24 h).
-- =====================================================================

create table if not exists public.digest_log (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null default ((now() at time zone 'Europe/Brussels')::date),
  body text not null,
  -- [{ list_id, title, messages, links }] : les projets où il y a du nouveau.
  projects jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.digest_log enable row level security;

-- Lecture seule pour l'étudiant ; l'écriture est faite par l'Edge Function (service_role).
drop policy if exists "digest_log : lire les siens" on public.digest_log;
create policy "digest_log : lire les siens"
  on public.digest_log for select to authenticated
  using (user_id = (select auth.uid()));

revoke insert, update, delete on public.digest_log from anon, authenticated;

-- ---------------------------------------------------------------------
-- Pour chaque étudiant demandé : ses projets (les siens, ceux de ses groupes, ceux
-- partagés avec lui) où il y a du nouveau venant des AUTRES :
--   messages = messages non lus de la discussion ;
--   links    = documents ajoutés depuis 24 h.
-- ---------------------------------------------------------------------
create or replace function public.digest_project_news(uids uuid[])
returns table (
  user_id uuid,
  list_id uuid,
  title text,
  messages integer,
  links integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select n.uid, n.id, n.title, n.messages, n.links
    from (
      select u.uid, l.id, l.title,
             (select count(*) from public.project_messages m
                left join public.project_reads r on r.list_id = m.list_id and r.user_id = u.uid
               where m.list_id = l.id and m.user_id <> u.uid
                 and (r.last_read_at is null or m.created_at > r.last_read_at))::int as messages,
             (select count(*) from public.project_links k
               where k.list_id = l.id and k.user_id <> u.uid
                 and k.created_at > now() - interval '24 hours')::int as links
        from unnest(uids) as u(uid)
        join public.todo_lists l
          on l.scope = 'project'
         and (l.user_id = u.uid
              or (l.group_id is not null and exists (
                    select 1 from public.group_members gm where gm.group_id = l.group_id and gm.user_id = u.uid))
              or exists (
                    select 1 from public.task_shares s
                     where s.recipient_id = u.uid and s.owner_id = l.user_id
                       and s.status = 'accepted' and s.list_id = l.id))
    ) n
   where n.messages > 0 or n.links > 0
   order by n.uid, n.messages + n.links desc, n.title;
$$;

revoke execute on function public.digest_project_news(uuid[]) from public, anon, authenticated;
grant execute on function public.digest_project_news(uuid[]) to service_role;
