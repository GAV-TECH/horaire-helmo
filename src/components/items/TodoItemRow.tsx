"use client";

import { useOptimistic, useState, useTransition } from "react";
import { deleteTodoItem, setTodoDone } from "@/lib/actions/todos";
import type { TodoItem } from "@/lib/data/types";
import { ErrorText, buttonClass } from "@/components/ui";
import { formatDue } from "./format";

/** Une tâche avec sa case à cocher. La coche s'affiche immédiatement (mise à jour "optimiste"). */
export function TodoItemRow({ item, subtitle, now }: { item: TodoItem; subtitle?: string; now: number }) {
  // useOptimistic : affiche tout de suite la nouvelle valeur, puis se recale sur la vraie donnée
  // quand le serveur a répondu (et revient en arrière si l'action a échoué).
  const [done, setOptimisticDone] = useOptimistic(item.done);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const toggle = () =>
    startTransition(async () => {
      setOptimisticDone(!done);
      const r = await setTodoDone(item.id, !done);
      setError(r.ok ? null : r.error);
    });

  const remove = () =>
    startTransition(async () => {
      const r = await deleteTodoItem(item.id);
      setError(r.ok ? null : r.error);
    });

  const overdue = !done && item.dueAt !== null && Date.parse(item.dueAt) < now;

  return (
    <li className="group flex items-start gap-2 py-1">
      <input
        type="checkbox"
        checked={done}
        onChange={toggle}
        className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600"
        aria-label={`Marquer « ${item.title} » comme ${done ? "à faire" : "fait"}`}
      />
      <div className="min-w-0 flex-1">
        <p className={`text-sm ${done ? "text-zinc-400 line-through" : ""}`}>{item.title}</p>
        {(item.dueAt || subtitle) && (
          <p className="text-xs text-zinc-500">
            {item.dueAt && <span className={overdue ? "font-medium text-red-600 dark:text-red-400" : ""}>{formatDue(item.dueAt)}</span>}
            {item.dueAt && subtitle && " · "}
            {subtitle}
          </p>
        )}
        <ErrorText>{error}</ErrorText>
      </div>
      {confirmDelete ? (
        <span className="flex gap-1">
          <button type="button" onClick={remove} disabled={pending} className={`${buttonClass.ghost} text-red-600`}>
            Supprimer
          </button>
          <button type="button" onClick={() => setConfirmDelete(false)} className={buttonClass.ghost}>
            Annuler
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          className={`${buttonClass.ghost} opacity-60 group-hover:opacity-100`}
          aria-label={`Supprimer « ${item.title} »`}
        >
          ✕
        </button>
      )}
    </li>
  );
}
