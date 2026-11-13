import { fromDayKey, shiftDay } from "@/lib/calendar";
import type { TodoItem, TodoList } from "@/lib/data/types";
import { dayKey, formatFr } from "@/lib/time";

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
    case "jour": {
      // Ma journée = ajoutées à la main aujourd'hui (hier = n'y sont plus, automatiquement)
      // + automatiquement : échéance aujourd'hui, celles du PROCHAIN jour qui a des tâches, et les retards.
      const next = nextTaskDay(entries, today);
      return entries.filter((e) => jourSection(e, today, next) !== null);
    }
    case "important":
      return entries.filter((e) => e.item.important);
    case "planifie":
      return entries.filter((e) => taskDate(e) !== null);
    case "toutes":
      return entries;
    case "seances":
      return entries.filter((e) => e.list.scope === "session");
    default:
      return entries.filter((e) => e.list.id === view);
  }
}

/**
 * Date d'une tâche : son échéance, sinon (tâche de séance) le début de la séance, sinon null.
 * Une tâche "à faire pour le cours de jeudi" compte ainsi pour jeudi sans devoir lui mettre une échéance.
 */
export function taskDate(e: TaskEntry): string | null {
  return e.item.dueAt ?? (e.list.scope === "session" ? e.list.sessionStart : null);
}

/** Jour (à Bruxelles) de la tâche, ou null. */
const dueDay = (e: TaskEntry) => {
  const date = taskDate(e);
  return date ? dayKey(date) : null;
};

/** Tâche en retard : non faite, échéance AVANT aujourd'hui (une échéance plus tôt aujourd'hui reste "aujourd'hui"). */
export function isOverdue(e: TaskEntry, today: string): boolean {
  const day = dueDay(e);
  return !e.item.done && day !== null && day < today;
}

/**
 * Prochain jour APRÈS aujourd'hui où une tâche non faite arrive à échéance : demain s'il y a
 * quelque chose demain, sinon le jour d'après, etc. null s'il n'y a plus rien de prévu.
 */
export function nextTaskDay(entries: TaskEntry[], today: string): string | null {
  let next: string | null = null;
  for (const e of entries) {
    const day = dueDay(e);
    if (!e.item.done && day !== null && day > today && (next === null || day < next)) next = day;
  }
  return next;
}

export type JourSection = "retard" | "aujourdhui" | "prochain";

/** Place d'une tâche dans "Ma journée" (`next` = nextTaskDay), ou null si elle n'y figure pas. */
export function jourSection(e: TaskEntry, today: string, next: string | null): JourSection | null {
  if (isOverdue(e, today)) return "retard";
  const day = dueDay(e);
  if (e.item.myDay === today || day === today) return "aujourdhui";
  if (day !== null && day === next) return "prochain";
  return null;
}

/** Sépare les tâches en retard des autres (affichées dans une section à part, en haut). */
export function splitOverdue(entries: TaskEntry[], today: string): { overdue: TaskEntry[]; rest: TaskEntry[] } {
  return { overdue: entries.filter((e) => isOverdue(e, today)), rest: entries.filter((e) => !isOverdue(e, today)) };
}

/** Tri : date (échéance ou séance) la plus proche d'abord (sans échéance à la fin), puis ordre d'ajout. */
export function sortTasks(entries: TaskEntry[]): TaskEntry[] {
  return [...entries].sort((a, b) => {
    // Dates ISO : une comparaison simple de chaînes suffit (pas localeCompare, qui suit les règles de la langue).
    const da = taskDate(a);
    const db = taskDate(b);
    if (da !== db) {
      if (da === null) return 1; // sans échéance → en dernier
      if (db === null) return -1;
      return da < db ? -1 : 1;
    }
    return a.item.position - b.item.position;
  });
}

/** "Aujourd'hui", "Demain", sinon "Jeudi 9 octobre" (avec l'année si ce n'est pas celle d'aujourd'hui). */
export function dayLabel(day: string, today: string): string {
  if (day === today) return "Aujourd'hui";
  if (day === shiftDay(today, 1)) return "Demain";
  const label = formatFr(fromDayKey(day), day.slice(0, 4) === today.slice(0, 4) ? "EEEE d MMMM" : "EEEE d MMMM yyyy");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export type DaySection = { key: string; label: string; items: TaskEntry[] };

/**
 * Regroupe des tâches par jour d'échéance (dans l'ordre des jours), puis "Sans échéance" à la fin.
 * L'ordre des tâches est conservé dans chaque jour : trier avant (sortTasks).
 */
export function groupTasksByDay(entries: TaskEntry[], today: string): DaySection[] {
  const byDay = new Map<string, TaskEntry[]>();
  const undated: TaskEntry[] = [];
  for (const e of entries) {
    const day = dueDay(e);
    if (day === null) undated.push(e);
    else byDay.set(day, [...(byDay.get(day) ?? []), e]);
  }
  const sections = [...byDay.keys()]
    .sort()
    .map((day) => ({ key: day, label: dayLabel(day, today), items: byDay.get(day)! }));
  if (undated.length) sections.push({ key: "sans-date", label: "Sans échéance", items: undated });
  return sections;
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

export type TaskParticipant = { userId: string; name: string; done: boolean };

/**
 * Avancement d'une tâche partagée une par une (migration 0020) : l'auteur + les étudiants
 * à qui elle est confiée, et qui l'a cochée. null si elle n'est confiée à personne.
 * « 1/2 » = done / total. Les coches d'un étudiant retiré ne comptent plus.
 */
export function taskProgress(item: TodoItem): { done: number; total: number; participants: TaskParticipant[] } | null {
  const assignees = item.assignees ?? [];
  if (assignees.length === 0) return null;
  const people = [{ userId: item.authorId, name: item.authorName || "Auteur" }, ...assignees.filter((a) => a.userId !== item.authorId)];
  const participants = people.map((p) => ({ ...p, done: item.doneBy.includes(p.userId) }));
  return { done: participants.filter((p) => p.done).length, total: participants.length, participants };
}
