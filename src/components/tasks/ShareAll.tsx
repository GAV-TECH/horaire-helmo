"use client";

import { useState, useTransition } from "react";
import { removeTaskShare } from "@/lib/actions/shares";
import { useGroups } from "@/components/groups/GroupsContext";
import { buttonClass } from "@/components/styles";
import { StudentShare } from "./StudentShare";

/**
 * Vue « Toutes » : partager toutes mes tâches avec un étudiant (séances comprises, et les listes
 * créées ensuite ; pas les projets), et voir les étudiants qui partagent les leurs avec moi.
 */
export function ShareAll() {
  const { me, shares } = useGroups();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const mineCount = shares.filter((s) => s.ownerId === me && s.listId === null).length;
  const incoming = shares.filter((s) => s.recipientId === me && s.status === "accepted");

  return (
    <div className="mx-4 mb-2 flex flex-col gap-2 md:mx-6">
      {open ? (
        <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-start gap-2">
            <p className="flex-1 text-sm text-zinc-500">
              Toutes tes listes, tâches de séances comprises, et celles que tu créeras ensuite. L&apos;étudiant doit accepter ; ensuite vous
              voyez et modifiez les mêmes tâches, en direct. Chacun coche pour soi. Les projets se partagent à part.
            </p>
            <button type="button" onClick={() => setOpen(false)} aria-label="Fermer" className="text-zinc-500">
              ✕
            </button>
          </div>
          <StudentShare listId={null} />
        </div>
      ) : (
        <div>
          <button type="button" onClick={() => setOpen(true)} className={buttonClass.secondary}>
            👥 Partager toutes mes tâches{mineCount > 0 ? ` · ${mineCount}` : ""}
          </button>
        </div>
      )}

      {incoming.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm text-zinc-500">
          {incoming.map((s) => (
            <li key={s.id} className="flex items-center gap-2">
              <span className="flex-1">
                👥 {s.ownerName} partage {s.label} avec toi.
              </span>
              <button type="button" disabled={pending} onClick={() => startTransition(async () => void (await removeTaskShare(s.id)))} className={buttonClass.ghost}>
                Quitter
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
