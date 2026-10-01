import { TasksApp } from "@/components/tasks/TasksApp";
import { requireUser } from "@/lib/auth";
import { coursesFrom, loadSessions, loadTodoLists } from "@/lib/data/queries";
import { tasksShareGroup } from "@/lib/data/task-sharing";
import { requestNow } from "@/lib/request-time";

export const metadata = { title: "Tâches · Horaire HELMO" };

export default async function TachesPage() {
  const { user, supabase } = await requireUser();
  const now = await requestNow();
  const since = new Date(now - 365 * 24 * 60 * 60 * 1000).toISOString();
  const [lists, sessions, shareAllGroupId] = await Promise.all([
    loadTodoLists(supabase, user.id),
    loadSessions(supabase, user.id, since),
    tasksShareGroup(supabase, user.id), // null aussi avant la migration 0007 (colonne absente → pas de données)
  ]);
  return <TasksApp lists={lists} courses={coursesFrom(sessions)} now={now} shareAllGroupId={shareAllGroupId} />;
}
