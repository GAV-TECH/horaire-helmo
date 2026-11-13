"use client";

import { useState, useTransition } from "react";
import type { ActionResult } from "@/lib/actions/context";
import { assignTask, unassignTask } from "@/lib/actions/shares";
import { taskProgress, type TaskEntry } from "@/lib/tasks";
import { useGroups } from "@/components/groups/GroupsContext";
import { buttonClass } from "@/components/styles";
import { StudentSearch } from "./StudentSearch";

/**
 * Partager la tâche avec un étudiant (migration 0020) : qui participe, qui l'a faite, et
 * une recherche pour en ajouter. Chacun coche pour lui ; la ligne de la tâche affiche « 1/2 ».
 */
export function TaskPeople({ entry }: { entry: TaskEntry }) {
  const { item, list } = entry;
  const { me } = useGroups();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const progress = taskProgress(item);
  // Ajouter : il faut voir la liste (pas la liste « Tâches partagées avec moi »). Même règle que le RLS.
  const canAdd = !list.virtual;
  const canManage = item.authorId === me || list.ownerId === me;
  const already = (id: string) => id === item.authorId || (item.assignees ?? []).some((a) => a.userId === id);

  const add = async (studentId: string) => {
    const r = await assignTask(item.id, studentId);
    setMessage(r);
    return r.ok;
  };
  const remove = (studentId: string) =>
    startTransition(async () => {
      setMessage(await unassignTask(item.id, studentId));
    });

  if (!progress && !canAdd) return null;

  return (
    <section className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
      <div className="flex items-center px-3 pt-2.5 text-sm">
        👥 {progress ? "Partagée" : "Partager avec un étudiant"}
        {progress && (
          <span className="ml-auto text-xs font-medium text-violet-600 dark:text-violet-400">
            ✓ {progress.done}/{progress.total}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2 px-3 pb-3 pt-2 text-sm">
        {progress && (
          <ul className="flex flex-col gap-1">
            {progress.participants.map((p) => {
              const removable = p.userId !== item.authorId && (canManage || p.userId === me);
              return (
                <li key={p.userId} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate">
                    {p.userId === me ? "Moi" : p.name}
                    {p.userId === item.authorId && <span className="text-zinc-500"> (auteur)</span>}
                  </span>
                  <span className={p.done ? "text-blue-600 dark:text-blue-400" : "text-zinc-400"}>{p.done ? "✓ fait" : "à faire"}</span>
                  {removable && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => remove(p.userId)}
                      className={buttonClass.ghost}
                      aria-label={p.userId === me ? "Ne plus participer à cette tâche" : `Retirer ${p.name}`}
                    >
                      {p.userId === me ? "Quitter" : "✕"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {canAdd &&
          (open ? (
            <StudentSearch label={(h) => (already(h.id) ? "Déjà ajouté" : "Ajouter")} disabled={(h) => already(h.id)} pending={pending} onPick={(h) => add(h.id)} />
          ) : (
            <button type="button" onClick={() => setOpen(true)} className="self-start text-blue-600 hover:underline dark:text-blue-400">
              ＋ Ajouter un étudiant
            </button>
          ))}

        {message && (
          <p className={`text-xs ${message.ok ? "text-green-700 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>{message.ok ? message.message : message.error}</p>
        )}
      </div>
    </section>
  );
}
