"use client";

import { useOptimistic, useState, useTransition } from "react";
import type { ActionResult } from "@/lib/actions/context";
import { quickAddTask, renameTodoItem, setTodoDue, setTodoImportant, setTodoMyDay } from "@/lib/actions/tasks";
import { deleteTodoItem, setTodoDone } from "@/lib/actions/todos";
import type { TodoList } from "@/lib/data/types";
import type { TaskEntry } from "@/lib/tasks";
import { brusselsToIso } from "@/lib/time";
import { applyTaskPatch, type TaskPatch } from "./optimistic";

/**
 * Actions sur les tâches, partagées par la page Tâches et la page d'un projet.
 * Chaque clic s'affiche tout de suite (useOptimistic), puis la server action l'enregistre ;
 * en cas d'échec, React revient automatiquement aux vraies données et `error` explique pourquoi.
 */
export function useTaskMutations(serverLists: TodoList[], today: string) {
  const [lists, applyOptimistic] = useOptimistic(serverLists, applyTaskPatch);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const mutate = (patch: TaskPatch | null, action: () => Promise<ActionResult>) =>
    startTransition(async () => {
      if (patch) applyOptimistic(patch);
      const r = await action();
      setError(r.ok ? null : r.error);
    });

  return {
    lists,
    error,
    toggleDone: (e: TaskEntry) => mutate({ itemId: e.item.id, changes: { done: !e.item.done } }, () => setTodoDone(e.item.id, !e.item.done)),
    toggleImportant: (e: TaskEntry) =>
      mutate({ itemId: e.item.id, changes: { important: !e.item.important } }, () => setTodoImportant(e.item.id, !e.item.important)),
    toggleMyDay: (e: TaskEntry) => {
      const on = e.item.myDay !== today;
      mutate({ itemId: e.item.id, changes: { myDay: on ? today : null } }, () => setTodoMyDay(e.item.id, on));
    },
    setDue: (e: TaskEntry, date: string) =>
      mutate({ itemId: e.item.id, changes: { dueAt: date ? brusselsToIso(date, "23:59") : null } }, () => setTodoDue(e.item.id, date)),
    rename: (e: TaskEntry, title: string) => mutate({ itemId: e.item.id, changes: { title } }, () => renameTodoItem(e.item.id, title)),
    remove: (e: TaskEntry) => mutate(null, () => deleteTodoItem(e.item.id)),
    /** Ajout rapide : dans une liste précise, ou depuis une liste intelligente (view). */
    add: (title: string, view: string, listId?: string) => mutate(null, () => quickAddTask(title, listId ? "liste" : view, listId)),
  };
}
