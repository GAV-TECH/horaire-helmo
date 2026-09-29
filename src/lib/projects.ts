import type { TodoItem, TodoList } from "@/lib/data/types";

/** Avancement d'un projet : tâches faites (par MOI) sur le total. */
export function projectProgress(project: TodoList): { done: number; total: number; percent: number } {
  const total = project.items.length;
  const done = project.items.filter((i) => i.done).length;
  return { done, total, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
}

/** Prochaine tâche à échéance, non faite (y compris en retard) : c'est le prochain "jalon" du projet. */
export function nextDueTask(project: TodoList): TodoItem | null {
  return (
    project.items
      .filter((i) => !i.done && i.dueAt !== null)
      .sort((a, b) => (a.dueAt! < b.dueAt! ? -1 : 1))[0] ?? null
  );
}

/** Projets triés : ceux qui ont l'échéance la plus proche d'abord, puis les autres par nom. */
export function sortProjects(projects: TodoList[]): TodoList[] {
  return [...projects].sort((a, b) => {
    const da = nextDueTask(a)?.dueAt ?? null;
    const db = nextDueTask(b)?.dueAt ?? null;
    if (da && db && da !== db) return da < db ? -1 : 1;
    if (da && !db) return -1;
    if (!da && db) return 1;
    return a.title.localeCompare(b.title, "fr");
  });
}
