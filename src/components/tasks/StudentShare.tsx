"use client";

import { useState, useTransition } from "react";
import type { ActionResult } from "@/lib/actions/context";
import { removeTaskShare, requestTaskShare } from "@/lib/actions/shares";
import { useGroups } from "@/components/groups/GroupsContext";
import { buttonClass } from "@/components/styles";
import { StudentSearch } from "./StudentSearch";

/**
 * Partager avec un étudiant : on tape son nom, des suggestions apparaissent, on en choisit une ; une demande
 * part ; le partage commence quand il l'accepte. listId null = toutes mes tâches.
 * Affiche aussi avec qui c'est déjà partagé (ou en attente), avec un bouton pour retirer.
 */
export function StudentShare({ listId }: { listId: string | null }) {
  const { me, shares } = useGroups();
  const [message, setMessage] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const outgoing = shares.filter((s) => s.ownerId === me && s.listId === listId);

  const run = (fn: () => Promise<ActionResult>) =>
    startTransition(async () => {
      setMessage(await fn());
    });
  const invite = async (recipientId: string) => {
    const r = await requestTaskShare(recipientId, listId ?? "");
    setMessage(r);
    return r.ok;
  };
  const invited = (id: string) => outgoing.some((s) => s.recipientId === id);

  return (
    <div className="flex flex-col gap-2 text-sm">
      <StudentSearch label={(h) => (invited(h.id) ? "Déjà invité" : "Inviter")} disabled={(h) => invited(h.id)} pending={pending} onPick={(h) => invite(h.id)} />

      {outgoing.length > 0 && (
        <ul className="flex flex-col gap-1">
          {outgoing.map((s) => (
            <li key={s.id} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate">
                👥 {s.recipientName}{" "}
                <span className={`text-xs ${s.status === "accepted" ? "text-green-700 dark:text-green-400" : "text-zinc-500"}`}>
                  {s.status === "accepted" ? "✓ partagé" : "en attente d'accord"}
                </span>
              </span>
              <button type="button" disabled={pending} onClick={() => run(() => removeTaskShare(s.id))} className={buttonClass.ghost}>
                {s.status === "accepted" ? "Arrêter" : "Annuler"}
              </button>
            </li>
          ))}
        </ul>
      )}

      {message && <p className={`text-xs ${message.ok ? "text-green-700 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>{message.ok ? message.message : message.error}</p>}
    </div>
  );
}
