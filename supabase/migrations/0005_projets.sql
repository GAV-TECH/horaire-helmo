-- =====================================================================
-- Horaire HELMO — Projets, et suppression des notes de séance.
-- SQL Editor → New query → Run. Script relançable.
--
-- Un projet est une liste de tâches de type 'project' : il profite de tout
-- ce qui existe déjà (tâches à cocher, échéances, rappels, partage avec un
-- groupe, "fait" par membre, temps réel).
-- ⚠️ La table des notes est SUPPRIMÉE avec son contenu (choix validé).
-- =====================================================================

-- Contrainte sur la colonne scope : on ajoute 'project'.
alter table public.todo_lists drop constraint if exists todo_lists_scope_check;
alter table public.todo_lists add constraint todo_lists_scope_check
  check (scope in ('global', 'course', 'session', 'project'));

-- Contrainte "champs obligatoires selon le type" (nommée todo_lists_check par Postgres en phase 2).
alter table public.todo_lists drop constraint if exists todo_lists_check;
alter table public.todo_lists drop constraint if exists todo_lists_scope_fields;
alter table public.todo_lists add constraint todo_lists_scope_fields check (
  scope in ('global', 'project')
  or (scope = 'course' and course_key is not null)
  or (scope = 'session' and course_key is not null and session_key is not null and session_start is not null)
);

-- Notes de séance : fonctionnalité retirée.
drop table if exists public.notes;
