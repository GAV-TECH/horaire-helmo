import { EcheancesApp } from "@/components/deadlines/EcheancesApp";
import { requireUser } from "@/lib/auth";
import { coursesFrom, loadDeadlines, loadSessions } from "@/lib/data/queries";
import { requestNow } from "@/lib/request-time";

export const metadata = { title: "Échéances · Horaire HELMO" };

const DAY = 24 * 60 * 60 * 1000;

export default async function EcheancesPage({ searchParams }: PageProps<"/deadlines">) {
  const { user, supabase } = await requireUser();
  const now = await requestNow();
  const params = await searchParams;
  // Séances de l'année (pour la liste des cours) ; seules les évaluations à venir sont affichées.
  const [deadlines, sessions] = await Promise.all([
    loadDeadlines(supabase, user.id),
    loadSessions(supabase, user.id, new Date(now - 365 * DAY).toISOString()),
  ]);

  // ?modifier=<id> : ouvre une échéance ; ?cours=…&date=… : ouvre l'ajout pré-rempli (depuis une séance).
  const openId = typeof params.modifier === "string" ? params.modifier : null;
  const courseName = typeof params.cours === "string" ? params.cours.slice(0, 300) : undefined;
  const date = typeof params.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : undefined;

  return (
    <EcheancesApp
      deadlines={deadlines}
      sessions={sessions}
      courses={coursesFrom(sessions)}
      now={now}
      openId={openId}
      prefill={courseName || date ? { courseName, date } : null}
    />
  );
}
