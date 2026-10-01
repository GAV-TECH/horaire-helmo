"use client";

import { useState, useTransition } from "react";
import type { ActionResult } from "@/lib/actions/context";
import { removeTaskShare, requestTaskShare, searchStudents } from "@/lib/actions/shares";
import type { StudentHit } from "@/lib/data/types";
import { useGroups } from "@/components/groups/GroupsContext";
import { buttonClass, inputClass } from "@/components/styles";

/**
 * Partager avec un étudiant : on tape son nom, on choisit dans les résultats, une demande
 * part ; le partage commence quand il l'accepte. listId null = toutes mes tâches.
 * Affiche aussi avec qui c'est déjà partagé (ou en attente), avec un bouton pour retirer.
 */
export function StudentShare({ listId }: { listId: string | null }) {
  const { me, shares } = useGroups();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<StudentHit[] | null>(null);
  const [message, setMessage] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const outgoing = shares.filter((s) => s.ownerId === me && s.listId === listId);

  const search = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const r = await searchStudents(query);
      setMessage(r.ok ? null : { ok: false, error: r.error });
      setHits(r.ok ? r.students : null);
    });
  };
  const run = (fn: () => Promise<ActionResult>, after?: () => void) =>
    startTransition(async () => {
      const r = await fn();
      setMessage(r);
      if (r.ok) after?.();
    });

  return (
    <div className="flex flex-col gap-2 text-sm">
      <form onSubmit={search} className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          maxLength={60}
          placeholder="Nom de l'étudiant"
          aria-label="Nom de l'étudiant"
          className={inputClass}
        />
        <button type="submit" disabled={pending || query.trim().length < 3} className={buttonClass.secondary}>
          Chercher
        </button>
      </form>

      {hits && hits.length === 0 && <p className="text-xs text-zinc-500">Personne trouvé. L&apos;étudiant doit avoir un compte sur l&apos;app.</p>}
      {hits && hits.length > 0 && (
        <ul className="flex flex-col gap-1">
          {hits.map((h) => {
            const already = outgoing.some((s) => s.recipientId === h.id);
            return (
              <li key={h.id} className="flex items-center gap-2 rounded-md bg-zinc-50 px-2 py-1.5 dark:bg-zinc-800/60">
                <span className="min-w-0 flex-1 truncate">
                  {h.displayName} <span className="text-xs text-zinc-500">{h.emailHint}</span>
                </span>
                <button
                  type="button"
                  disabled={pending || already}
                  onClick={() => run(() => requestTaskShare(h.id, listId ?? ""), () => setHits(null))}
                  className={buttonClass.primary}
                >
                  {already ? "Déjà invité" : "Inviter"}
                </button>
              </li>
            );
          })}
        </ul>
      )}

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
