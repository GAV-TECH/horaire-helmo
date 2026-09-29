"use client";

import { useState, useTransition } from "react";
import { deleteIcsSource, saveDisplayName, saveIcsUrl } from "@/lib/actions/settings";
import type { ActionResult } from "@/lib/actions/context";
import { formatFr } from "@/lib/time";
import { ActionMessage, Field, buttonClass, cardClass, inputClass, useFormAction } from "@/components/ui";

type SourceStatus = { updatedAt: string; lastSyncedAt: string | null; lastError: string | null } | null;

export function SettingsForms({ displayName, source }: { displayName: string; source: SourceStatus }) {
  const name = useFormAction(saveDisplayName);
  const [editingUrl, setEditingUrl] = useState(source === null);
  const ics = useFormAction(saveIcsUrl, { reset: true, onSuccess: () => setEditingUrl(false) });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteResult, setDeleteResult] = useState<ActionResult | null>(null);
  const [deleting, startDelete] = useTransition();

  return (
    <>
      <section className={cardClass}>
        <h2 className="mb-1 font-semibold">Lien de l&apos;horaire (.ics)</h2>
        <p className="mb-3 text-sm text-zinc-500">
          Sur mon-espace.helmo.be, ouvre ton horaire et copie le lien d&apos;abonnement iCalendar. Il est chiffré et reste sur le
          serveur : il n&apos;est plus jamais affiché, ni envoyé à ton navigateur.
        </p>

        {source && (
          <dl className="mb-3 grid grid-cols-[9rem_1fr] gap-x-2 gap-y-1 text-sm">
            <dt className="text-zinc-500">Lien enregistré le</dt>
            <dd>{formatFr(source.updatedAt, "d MMMM yyyy à HH:mm")}</dd>
            <dt className="text-zinc-500">Dernière synchro</dt>
            <dd>{source.lastSyncedAt ? formatFr(source.lastSyncedAt, "d MMMM à HH:mm") : "jamais"}</dd>
            {source.lastError && (
              <>
                <dt className="text-zinc-500">Problème</dt>
                <dd className="text-red-600 dark:text-red-400">{source.lastError}</dd>
              </>
            )}
          </dl>
        )}

        {editingUrl ? (
          <form onSubmit={ics.onSubmit} className="flex flex-col gap-2">
            <Field label={source ? "Nouveau lien" : "Lien"} hint="Si tu as régénéré ton token sur mon-espace, colle simplement le nouveau lien.">
              <input
                name="url"
                type="url"
                required
                autoComplete="off"
                spellCheck={false}
                placeholder="https://mon-espace.helmo.be/MonHoraire/ICalendarEtudiant/Fichier?token=…"
                className={inputClass}
              />
            </Field>
            <ActionMessage result={ics.result} />
            <div className="flex gap-2">
              <button type="submit" disabled={ics.pending} className={buttonClass.primary}>
                {ics.pending ? "Import en cours…" : "Enregistrer et importer"}
              </button>
              {source && (
                <button type="button" onClick={() => setEditingUrl(false)} className={buttonClass.secondary}>
                  Annuler
                </button>
              )}
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap gap-2">
            <ActionMessage result={ics.result} />
            <button type="button" onClick={() => setEditingUrl(true)} className={buttonClass.secondary}>
              Remplacer le lien
            </button>
            {confirmDelete ? (
              <>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => startDelete(async () => setDeleteResult(await deleteIcsSource()))}
                  className={buttonClass.danger}
                >
                  Confirmer la suppression
                </button>
                <button type="button" onClick={() => setConfirmDelete(false)} className={buttonClass.secondary}>
                  Annuler
                </button>
              </>
            ) : (
              <button type="button" onClick={() => setConfirmDelete(true)} className={buttonClass.danger}>
                Supprimer le lien et les séances
              </button>
            )}
          </div>
        )}
        <div className="mt-2">
          <ActionMessage result={deleteResult} />
        </div>
      </section>

      <section className={cardClass}>
        <h2 className="mb-3 font-semibold">Profil</h2>
        <form onSubmit={name.onSubmit} className="flex flex-col gap-2">
          <Field label="Nom affiché" hint="Visible par les membres de tes groupes (phase 4).">
            <input name="displayName" defaultValue={displayName} required maxLength={60} className={inputClass} />
          </Field>
          <ActionMessage result={name.result} />
          <button type="submit" disabled={name.pending} className={`${buttonClass.primary} self-start`}>
            Enregistrer
          </button>
        </form>
      </section>
    </>
  );
}
