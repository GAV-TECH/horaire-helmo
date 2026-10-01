"use client";

import { useState, useTransition } from "react";
import type { ActionResult } from "@/lib/actions/context";
import { renameTodoList } from "@/lib/actions/tasks";
import { deleteTodoList, setListGroup } from "@/lib/actions/todos";
import type { TodoList } from "@/lib/data/types";
import { canEdit } from "@/lib/groups";
import { useGroups } from "@/components/groups/GroupsContext";
import { buttonClass, inputClass } from "@/components/styles";
import { StudentShare } from "./StudentShare";

/** Menu "⋯" d'une liste : renommer, partager, supprimer (selon les droits). */
export function ListMenu({ list, onDeleted }: { list: TodoList; onDeleted: () => void }) {
  const { me, groups, shares } = useGroups();
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const editable = canEdit(list, me, groups);
  const isOwner = list.ownerId === me;
  if (!editable && !isOwner) return null;

  const run = (fn: () => Promise<ActionResult>, after?: () => void) =>
    startTransition(async () => {
      const r = await fn();
      setError(r.ok ? null : r.error);
      if (r.ok) after?.();
    });

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Options de la liste" className="rounded-md px-2 py-1 text-lg leading-none text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">
        ⋯
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
          {editable && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const title = String(new FormData(e.currentTarget).get("title") ?? "");
                run(() => renameTodoList(list.id, title), () => setOpen(false));
              }}
              className="flex gap-2"
            >
              <input name="title" defaultValue={list.title} maxLength={200} aria-label="Nom de la liste" className={inputClass} />
              <button type="submit" disabled={pending} className={buttonClass.secondary}>
                OK
              </button>
            </form>
          )}
          {/* Seul le propriétaire change le partage. */}
          {isOwner && (
            <div className="flex flex-col gap-1.5 text-xs text-zinc-500">
              Partage
              {groups.length > 0 && (
                <select value={list.groupId ?? ""} disabled={pending} onChange={(e) => run(() => setListGroup(list.id, e.target.value))} aria-label="Partager avec un groupe" className={inputClass}>
                  <option value="">Aucun groupe</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      👥 {g.name}
                    </option>
                  ))}
                </select>
              )}
              {/* Ouvert d'office si la liste est déjà partagée avec des étudiants (pour voir qui, et retirer). */}
              {sharing || shares.some((s) => s.listId === list.id) ? (
                <StudentShare listId={list.id} />
              ) : (
                <button type="button" onClick={() => setSharing(true)} className={`${buttonClass.secondary} justify-start`}>
                  👤 Partager avec un étudiant…
                </button>
              )}
            </div>
          )}
          {editable &&
            (confirmDelete ? (
              <div className="flex flex-col gap-2 text-sm">
                Supprimer la liste et toutes ses tâches{list.groupId ? " (pour tout le groupe)" : ""} ?
                <div className="flex gap-2">
                  <button type="button" disabled={pending} onClick={() => run(() => deleteTodoList(list.id), onDeleted)} className={buttonClass.danger}>
                    Supprimer
                  </button>
                  <button type="button" onClick={() => setConfirmDelete(false)} className={buttonClass.ghost}>
                    Annuler
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirmDelete(true)} className={`${buttonClass.danger} justify-start`}>
                Supprimer la liste
              </button>
            ))}
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        </div>
      )}
    </div>
  );
}

