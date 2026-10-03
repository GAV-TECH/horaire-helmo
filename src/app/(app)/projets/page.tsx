import { ProjectsHome } from "@/components/projects/ProjectsHome";
import { requireUser } from "@/lib/auth";
import { coursesFrom, loadSessions, loadTodoLists, loadUnreadCounts } from "@/lib/data/queries";
import { requestNow } from "@/lib/request-time";

export const metadata = { title: "Projets · Horaire HELMO" };

export default async function ProjetsPage() {
  const { user, supabase } = await requireUser();
  const now = await requestNow();
  const since = new Date(now - 365 * 24 * 60 * 60 * 1000).toISOString();
  const [lists, sessions, unread] = await Promise.all([loadTodoLists(supabase, user.id), loadSessions(supabase, user.id, since), loadUnreadCounts(supabase)]);
  return <ProjectsHome projects={lists.filter((l) => l.scope === "project")} courses={coursesFrom(sessions)} unread={unread} now={now} />;
}
