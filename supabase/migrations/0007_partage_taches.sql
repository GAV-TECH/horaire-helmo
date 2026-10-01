-- =====================================================================
-- Horaire HELMO — partager toutes ses tâches d'un coup (séances comprises).
-- SQL Editor → New query → Run. Script relançable.
-- =====================================================================

-- Les listes de séance peuvent maintenant être partagées : la liste garde elle-même
-- le cours et la date de la séance, l'autre étudiant n'a pas besoin du même UID.
-- (Chez lui, l'horaire la rattache à sa séance par cours + heure de début, s'il l'a aussi.)
alter table public.todo_lists drop constraint if exists todo_lists_shared_not_session;

-- Groupe avec lequel TOUTES mes listes de tâches sont partagées, y compris celles créées
-- ensuite (null = pas de partage global). Pas de vérification d'appartenance ici : après
-- avoir quitté le groupe, la valeur resterait et bloquerait les autres réglages. L'app
-- vérifie l'appartenance, et le RLS de todo_lists refuse de toute façon un groupe étranger.
alter table public.user_settings
  add column if not exists tasks_group_id uuid references public.groups (id) on delete set null;
