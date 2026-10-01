import { shiftDay } from "@/lib/calendar";
import type { TodoItem, TodoList } from "@/lib/data/types";
import { dayKey } from "@/lib/time";

/** Listes "intelligentes" de la page Tâches (façon Microsoft To Do). */
export const SMART_VIEWS = [
  { id: "jour", name: "Ma journée", icon: "☀" },
  { id: "important", name: "Important", icon: "☆" },
  { id: "planifie", name: "Planifié", icon: "▦" },
  { id: "toutes", name: "Toutes", icon: "∞" },
  { id: "seances", name: "Séances", icon: "▣" },
] as const;

export type SmartViewId = (typeof SMART_VIEWS)[number]["id"];
export type TaskEntry = { item: TodoItem; list: TodoList };

export function isSmartView(view: string): view is SmartViewId {
  return SMART_VIEWS.some((v) => v.id === view);
}

/** Toutes les tâches, chacune avec sa liste (utile pour les vues qui mélangent plusieurs listes). */
export function flattenTasks(lists: TodoList[]): TaskEntry[] {
  return lists.flatMap((list) => list.items.map((item) => ({ item, list })));
}

/** Les tâches d'une vue : liste intelligente ou liste précise. `today` = "AAAA-MM-JJ" à Bruxelles. */
export function tasksForView(entries: TaskEntry[], view: string, today: string): TaskEntry[] {
  switch (view) {
    case "jour":
      // Ma journée = ajoutées à la main aujourd'hui (hier = n'y sont plus, automatiquement)
      // + automatiquement : échéance aujourd'hui ou DEMAIN, et les tâches en retard non faites.
      return entries.filter((e) => jourSection(e, today) !== null);
    case "important":
      return entries.filter((e) => e.item.important);
    case "planifie":
      return entries.filter((e) => e.item.dueAt !== null);
    case "toutes":
      return entries;
    case "seances":
      return entries.filter((e) => e.list.scope === "session");
    default:
      return entries.filter((e) => e.list.id === view);
  }
}

/** Jour (à Bruxelles) de l'échéance d'une tâche, ou null. */
const dueDay = (e: TaskEntry) => (e.item.dueAt ? dayKey(e.item.dueAt) : null);

/** Tâche en retard : non faite, échéance AVANT aujourd'hui (une échéance plus tôt aujourd'hui reste "aujourd'hui"). */
export function isOverdue(e: TaskEntry, today: string): boolean {
  const day = dueDay(e);
  return !e.item.done && day !== null && day < today;
}

export type JourSection = "retard" | "aujourdhui" | "demain";

/** Place d'une tâche dans "Ma journée", ou null si elle n'y figure pas. */
export function jourSection(e: TaskEntry, today: string): JourSection | null {
  if (isOverdue(e, today)) return "retard";
  const day = dueDay(e);
  if (e.item.myDay === today || day === today) return "aujourdhui";
  if (day === shiftDay(today, 1)) return "demain";
  return null;
}

/** Sépare les tâches en retard des autres (affichées dans une section à part, en haut). */
export function splitOverdue(entries: TaskEntry[], today: string): { overdue: TaskEntry[]; rest: TaskEntry[] } {
  return { overdue: entries.filter((e) => isOverdue(e, today)), rest: entries.filter((e) => !isOverdue(e, today)) };
}

/** Tri : échéance la plus proche d'abord (sans échéance à la fin), puis ordre d'ajout. */
export function sortTasks(entries: TaskEntry[]): TaskEntry[] {
  return [...entries].sort((a, b) => {
    // Dates ISO : une comparaison simple de chaînes suffit (pas localeCompare, qui suit les règles de la langue).
    const da = a.item.dueAt;
    const db = b.item.dueAt;
    if (da !== db) {
      if (da === null) return 1; // sans échéance → en dernier
      if (db === null) return -1;
      return da < db ? -1 : 1;
    }
    return a.item.position - b.item.position;
  });
}

export type PlannedGroup = "retard" | "aujourdhui" | "demain" | "semaine" | "plus-tard";

export const PLANNED_LABELS: Record<PlannedGroup, string> = {
  retard: "En retard",
  aujourdhui: "Aujourd'hui",
  demain: "Demain",
  semaine: "Dans les 7 jours",
  "plus-tard": "Plus tard",
};

/** Groupe d'une échéance dans la vue "Planifié" (jours comptés à Bruxelles). */
export function plannedGroup(dueAt: string, now: number): PlannedGroup {
  const today = dayKey(now);
  const day = dayKey(dueAt);
  if (day < today) return "retard"; // même règle que isOverdue : plus tôt aujourd'hui = "aujourd'hui"
  if (day === today) return "aujourdhui";
  if (day === shiftDay(today, 1)) return "demain";
  if (day <= shiftDay(today, 7)) return "semaine";
  return "plus-tard";
}

/** Dates proposées en un clic pour l'échéance : aujourd'hui, demain, lundi prochain. */
export function quickDueDates(today: string): { label: string; date: string }[] {
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay(); // 0 = dimanche
  const toMonday = ((8 - weekday) % 7) || 7; // toujours un lundi FUTUR
  return [
    { label: "Aujourd'hui", date: today },
    { label: "Demain", date: shiftDay(today, 1) },
    { label: "Lundi prochain", date: shiftDay(today, toMonday) },
  ];
}
