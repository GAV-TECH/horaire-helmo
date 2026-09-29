import { DeadlinesView } from "@/components/deadlines/DeadlinesView";
import { requireUser } from "@/lib/auth";
import { coursesFrom, loadDeadlines, loadSessions } from "@/lib/data/queries";
import { requestNow } from "@/lib/request-time";

export const metadata = { title: "Deadlines · Horaire HELMO" };

export default async function DeadlinesPage({ searchParams }: PageProps<"/deadlines">) {
  const { user, supabase } = await requireUser();
  const now = await requestNow();
  const params = await searchParams;
  const since = new Date(now - 365 * 24 * 60 * 60 * 1000).toISOString();
  const [deadlines, sessions] = await Promise.all([loadDeadlines(supabase, user.id), loadSessions(supabase, user.id, since)]);

  const editId = typeof params.modifier === "string" ? params.modifier : null;
  return (
    <DeadlinesView
      deadlines={deadlines}
      courses={coursesFrom(sessions)}
      now={now}
      editing={deadlines.find((d) => d.id === editId) ?? null}
      prefill={{
        courseName: typeof params.cours === "string" ? params.cours : "",
        date: typeof params.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : "",
      }}
    />
  );
}
