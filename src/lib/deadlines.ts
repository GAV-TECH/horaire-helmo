import { fromDayKey, shiftDay, weekDays } from "@/lib/calendar";
import { parseCourseTitle, sameCourse } from "@/lib/courses";
import type { Deadline } from "@/lib/data/types";
import type { StoredSession } from "@/lib/ics/types";
import { dayKey } from "@/lib/time";

/* Page "Échéances" : évaluations détectées dans l'horaire + dates ajoutées par l'étudiant. */

export type Urgency = "late" | "urgent" | "soon" | "later";

/** Nombre de jours de CALENDRIER (à Bruxelles) entre aujourd'hui et l'échéance. */
export function daysUntil(dueAt: string, now: number): number {
  const ms = fromDayKey(dayKey(dueAt)).getTime() - fromDayKey(dayKey(now)).getTime();
  return Math.round(ms / 86_400_000); // arrondi : les jours de changement d'heure durent 23 ou 25 h
}

/** Compte à rebours affiché dans le coin : "En retard", "Aujourd'hui", "Demain", "J-3"… */
export function countdown(dueAt: string, now: number): { label: string; urgency: Urgency } {
  if (Date.parse(dueAt) < now) return { label: "En retard", urgency: "late" };
  const days = daysUntil(dueAt, now);
  if (days === 0) return { label: "Aujourd'hui", urgency: "urgent" };
  if (days === 1) return { label: "Demain", urgency: "urgent" };
  return { label: `J-${days}`, urgency: days <= 7 ? "soon" : "later" };
}

export type Section = "retard" | "semaine" | "semaine-prochaine" | "plus-tard";

export const SECTION_LABELS: Record<Section, string> = {
  retard: "En retard",
  semaine: "Cette semaine",
  "semaine-prochaine": "Semaine prochaine",
  "plus-tard": "Plus tard",
};

/** Section d'une échéance : cette semaine = jusqu'au dimanche, semaine prochaine = lundi → dimanche suivants. */
export function sectionOf(dueAt: string, now: number): Section {
  if (Date.parse(dueAt) < now) return "retard";
  const day = dayKey(dueAt);
  const thisSunday = weekDays(dayKey(now))[6];
  if (day <= thisSunday) return "semaine";
  if (day <= shiftDay(thisSunday, 7)) return "semaine-prochaine";
  return "plus-tard";
}

/** Début de la prochaine séance (à venir) d'un cours — pour "à rendre pour la prochaine séance". */
export function nextSessionOf(course: string, sessions: StoredSession[], now: number): StoredSession | null {
  return (
    sessions
      .filter((s) => s.status === "active" && Date.parse(s.start) > now && sameCourse(s.title, course))
      .sort((a, b) => a.start.localeCompare(b.start))[0] ?? null
  );
}

/** Une ligne de la page Échéances : une deadline (modifiable) ou une évaluation de l'horaire. */
export type Echeance =
  | { type: "deadline"; id: string; dueAt: string; deadline: Deadline }
  | { type: "evaluation"; id: string; dueAt: string; session: StoredSession };

/** Évaluations à venir de l'horaire + deadlines, triées par date. */
export function buildEcheances(deadlines: Deadline[], sessions: StoredSession[], now: number): Echeance[] {
  const evaluations: Echeance[] = sessions
    .filter((s) => s.status === "active" && Date.parse(s.end) > now && parseCourseTitle(s.title).isEvaluation)
    .map((s) => ({ type: "evaluation", id: `eval-${s.id}`, dueAt: s.start, session: s }));
  const own: Echeance[] = deadlines.map((d) => ({ type: "deadline", id: d.id, dueAt: d.dueAt, deadline: d }));
  return [...evaluations, ...own].sort((a, b) => (a.dueAt < b.dueAt ? -1 : a.dueAt > b.dueAt ? 1 : 0));
}
