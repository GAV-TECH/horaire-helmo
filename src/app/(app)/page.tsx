import { ScheduleApp } from "@/components/schedule/ScheduleApp";
import { requireUser } from "@/lib/auth";
import { loadDeadlines, loadSessions, loadTodoLists } from "@/lib/data/queries";
import { requestNow } from "@/lib/request-time";
import { syncSchedule } from "@/lib/sync";
import { dayKey } from "@/lib/time";

const HISTORY_DAYS = 120; // séances passées envoyées au navigateur

export default async function HorairePage() {
  const { user, supabase } = await requireUser();
  const now = await requestNow();

  // Synchro "paresseuse" : ne télécharge le .ics que si la dernière synchro a plus de 5 minutes.
  const sync = await syncSchedule(user.id);

  const since = new Date(now - HISTORY_DAYS * 24 * 60 * 60 * 1000).toISOString();
  // Promise.all : les requêtes partent en parallèle au lieu de s'attendre l'une l'autre.
  const [sessions, deadlines, lists] = await Promise.all([
    loadSessions(supabase, user.id, since),
    loadDeadlines(supabase, user.id),
    loadTodoLists(supabase, user.id),
  ]);

  return (
    <ScheduleApp
      sessions={sessions}
      deadlines={deadlines}
      lists={lists}
      sync={sync}
      initialDay={dayKey(now)}
      initialNow={now}
    />
  );
}
