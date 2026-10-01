"use client";

import { useState, useTransition } from "react";
import type { ActionResult } from "@/lib/actions/context";
import { shareAllTasks, shareAllTasksWithNewGroup, stopSharingAllTasks } from "@/lib/actions/todos";
import { useGroups } from "@/components/groups/GroupsContext";
import { buttonClass, inputClass } from "@/components/styles";
import { InviteLink } from "./ListHeader";

/**
 * Partage de TOUTES mes tâches (vue « Toutes ») : avec un nouvel étudiant (un groupe est créé,
 * on envoie son lien) ou avec un groupe existant. Les listes créées ensuite suivent.
 */
export function ShareAll({ groupId }: { groupId: string | null }) {
  const { groups } = useGroups();
  const [open, setOpen] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const group = groups.find((g) => g.id === groupId);

  const run = (fn: () => Promise<ActionResult>) =>
    startTransition(async () => {
      const r = await fn();
      setError(r.ok ? null : r.error);
      if (r.ok) {
        setOpen(false);
        setConfirmStop(false);
      }
    });

  if (group) {
    return (
      <div className="mx-4 mb-2 flex flex-col gap-2 md:mx-6">
        <InviteLink name={group.name} code={group.inviteCode} intro={`Toutes tes tâches sont partagées (${group.members.length} membre${group.members.length > 1 ? "s" : ""}).`} />
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {confirmStop ? (
            <>
              Tes listes redeviendront privées.
              <button type="button" disabled={pending} onClick={() => run(stopSharingAllTasks)} className={buttonClass.danger}>
                Arrêter le partage
              </button>
              <button type="button" onClick={() => setConfirmStop(false)} className={buttonClass.ghost}>
                Annuler
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setConfirmStop(true)} className={buttonClass.ghost}>
              Arrêter de tout partager
            </button>
          )}
        </div>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </div>
    );
  }

  if (!open) {
    return (
      <div className="mx-4 mb-2 md:mx-6">
        <button type="button" onClick={() => setOpen(true)} className={buttonClass.secondary}>
          👥 Partager toutes mes tâches
        </button>
      </div>
    );
  }

  return (
    <div className="mx-4 mb-3 flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-3 text-sm md:mx-6 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-zinc-500">
        Toutes tes listes, tâches de séances comprises, et celles que tu créeras ensuite seront visibles par l&apos;autre étudiant. Chacun
        coche ses tâches pour soi. Les projets gardent leur propre partage.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const name = String(new FormData(e.currentTarget).get("name") ?? "");
          run(() => shareAllTasksWithNewGroup(name));
        }}
        className="flex flex-col gap-1.5"
      >
        <span className="font-medium">Avec un étudiant</span>
        <div className="flex gap-2">
          <input name="name" defaultValue="Nos tâches" maxLength={80} aria-label="Nom du partage" className={inputClass} />
          <button type="submit" disabled={pending} className={buttonClass.primary}>
            Créer le lien
          </button>
        </div>
      </form>
      {groups.length > 0 && (
        <label className="flex flex-col gap-1.5">
          <span className="font-medium">Ou avec un de tes groupes</span>
          <select defaultValue="" disabled={pending} onChange={(e) => e.target.value && run(() => shareAllTasks(e.target.value))} className={inputClass}>
            <option value="">Choisir un groupe…</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                👥 {g.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setOpen(false)} className={buttonClass.ghost}>
          Annuler
        </button>
        {error && <p className="text-red-600 dark:text-red-400">{error}</p>}
      </div>
    </div>
  );
}
