import { TasksApp } from "@/components/tasks/TasksApp";
import { requireUser } from "@/lib/auth";
import { coursesFrom, loadSessions, loadTodoLists } from "@/lib/data/queries";
import { requestNow } from "@/lib/request-time";

export const metadata = { title: "Tâches · Horaire HELMO" };

export default async function TachesPage() {
  const { user, supabase } = await requireUser();
  const now = await requestNow();
  const since = new Date(now - 365 * 24 * 60 * 60 * 1000).toISOString();
  const [lists, sessions] = await Promise.all([loadTodoLists(supabase, user.id), loadSessions(supabase, user.id, since)]);
  return <TasksApp lists={lists} courses={coursesFrom(sessions)} now={now} />;
}
