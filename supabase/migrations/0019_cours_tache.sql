-- =====================================================================
-- Horaire HELMO — lier une tâche à un cours.
-- SQL Editor → New query → Run. Script relançable.
--
-- Le cours est choisi dans le détail de la tâche (page Tâches). Il appartient à la
-- tâche : dans une liste partagée, tout le monde le voit. Les règles d'accès ne
-- changent pas : qui peut modifier la tâche peut changer son cours.
-- =====================================================================

alter table public.todo_items add column if not exists course_name text;

alter table public.todo_items drop constraint if exists todo_items_course_name_length;
alter table public.todo_items add constraint todo_items_course_name_length
  check (course_name is null or char_length(course_name) between 1 and 300);
