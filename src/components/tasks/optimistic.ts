import type { TodoItem, TodoList } from "@/lib/data/types";

/**
 * Changements appliqués tout de suite à l'écran, avant la réponse du serveur (useOptimistic).
 * Si l'action échoue, React revient automatiquement aux vraies données.
 */
export type TaskPatch = { itemId: string; changes: Partial<Pick<TodoItem, "done" | "important" | "myDay" | "dueAt" | "title">> };

export function applyTaskPatch(lists: TodoList[], patch: TaskPatch): TodoList[] {
  return lists.map((list) => ({
    ...list,
    items: list.items.map((item) => (item.id === patch.itemId ? { ...item, ...patch.changes } : item)),
  }));
}
