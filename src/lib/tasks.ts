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
      return entries.filter((e) => e.item.myDay === today); // hier = n'y est plus, automatiquement
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
  if (Date.parse(dueAt) < now) return "retard";
  const today = dayKey(now);
  const day = dayKey(dueAt);
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
