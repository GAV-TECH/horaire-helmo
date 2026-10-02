"use client";

import { useState, useTransition } from "react";
import { addProjectLink, deleteProjectLink } from "@/lib/actions/links";
import type { ProjectLink } from "@/lib/data/types";
import { useGroups } from "@/components/groups/GroupsContext";
import { ActionMessage, useFormAction } from "@/components/ui";
import { buttonClass, inputClass } from "@/components/styles";

/**
 * Documents partagés du projet : des liens vers des fichiers en ligne (Word / OneDrive,
 * Google Docs, PDF…). Tous les membres ouvrent et modifient la même version.
 */
export function ProjectDocs({ projectId, ownerId, links }: { projectId: string; ownerId: string; links: ProjectLink[] }) {
  const { me } = useGroups();
  const [adding, setAdding] = useState(false);
  const [pending, startTransition] = useTransition();
  const { onSubmit, pending: saving, result } = useFormAction(addProjectLink, { onSuccess: () => setAdding(false) });

  return (
    <section aria-label="Documents du projet" className="mt-6 rounded-xl border border-zinc-200 dark:border-zinc-800">
      <div className="flex items-center gap-2 border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
        <h2 className="mr-auto text-sm font-semibold">📎 Documents</h2>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} className={buttonClass.ghost}>
            ＋ Ajouter un lien
          </button>
        )}
      </div>

      {adding && (
        <form onSubmit={onSubmit} className="flex flex-col gap-2 border-b border-zinc-200 p-3 text-sm dark:border-zinc-800">
          <input type="hidden" name="listId" value={projectId} />
          <input name="title" required maxLength={120} autoFocus placeholder="Nom (ex. Rapport final)" aria-label="Nom du document" className={inputClass} />
          <input name="url" type="url" required maxLength={2000} placeholder="Lien de partage (https://…)" aria-label="Lien du document" className={inputClass} />
          <p className="text-xs text-zinc-500">
            Dans Word en ligne ou OneDrive : Partager → Copier le lien, avec le droit de modification pour les membres.
          </p>
          <ActionMessage result={result} showSuccess={false} />
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className={buttonClass.primary}>
              Ajouter
            </button>
            <button type="button" onClick={() => setAdding(false)} className={buttonClass.ghost}>
              Annuler
            </button>
          </div>
        </form>
      )}

      {links.length === 0 && !adding && <p className="p-3 text-sm text-zinc-500">Aucun document. Ajoute le lien d&apos;un fichier partagé.</p>}
      <ul>
        {links.map((l) => (
          <li key={l.id} className="flex items-center gap-2 px-3 py-2 text-sm">
            {/* noopener noreferrer : la page ouverte ne peut pas agir sur l'onglet de l'app */}
            <a href={l.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate font-medium text-blue-600 hover:underline dark:text-blue-400">
              📄 {l.title}
            </a>
            <span className="hidden truncate text-xs text-zinc-500 sm:inline">{hostOf(l.url)}</span>
            {(l.authorId === me || ownerId === me) && (
              <button type="button" disabled={pending} onClick={() => startTransition(async () => void (await deleteProjectLink(l.id)))} className={buttonClass.ghost}>
                Retirer
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** "onedrive.live.com" : montre où mène le lien avant de cliquer. */
function hostOf(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}
