"use client";

import { useState, useTransition } from "react";
import { createNote, deleteNote, updateNote } from "@/lib/actions/notes";
import type { Note } from "@/lib/data/types";
import { Markdown } from "@/components/Markdown";
import { ActionMessage, ErrorText, buttonClass, inputClass, useFormAction } from "@/components/ui";
import { formatFr } from "@/lib/time";

const MARKDOWN_HINT = "Markdown : **gras**, *italique*, - liste, [lien](https://…)";

/** Une note affichée en markdown, modifiable sur place. */
export function NoteCard({ note, header }: { note: Note; header?: React.ReactNode }) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const edit = useFormAction(updateNote, { onSuccess: () => setEditing(false) });

  const remove = () =>
    startTransition(async () => {
      const r = await deleteNote(note.id);
      setError(r.ok ? null : r.error);
    });

  return (
    <article className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
      {header}
      {editing ? (
        <form onSubmit={edit.onSubmit} className="flex flex-col gap-2">
          <input type="hidden" name="id" value={note.id} />
          <textarea name="body" defaultValue={note.body} required rows={5} maxLength={20000} className={inputClass} aria-label="Contenu de la note" />
          <p className="text-xs text-zinc-500">{MARKDOWN_HINT}</p>
          <ActionMessage result={edit.result} />
          <div className="flex gap-2">
            <button type="submit" disabled={edit.pending} className={buttonClass.primary}>
              Enregistrer
            </button>
            <button type="button" onClick={() => setEditing(false)} className={buttonClass.secondary}>
              Annuler
            </button>
          </div>
        </form>
      ) : (
        <>
          <Markdown>{note.body}</Markdown>
          <div className="mt-2 flex items-center gap-1 text-xs text-zinc-400">
            <span className="mr-auto">Modifiée le {formatFr(note.updatedAt, "d MMM à HH:mm")}</span>
            {confirmDelete ? (
              <>
                <button type="button" onClick={remove} disabled={pending} className={`${buttonClass.ghost} text-red-600`}>
                  Supprimer
                </button>
                <button type="button" onClick={() => setConfirmDelete(false)} className={buttonClass.ghost}>
                  Annuler
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => setEditing(true)} className={buttonClass.ghost}>
                  Modifier
                </button>
                <button type="button" onClick={() => setConfirmDelete(true)} className={buttonClass.ghost}>
                  Supprimer
                </button>
              </>
            )}
          </div>
          <ErrorText>{error}</ErrorText>
        </>
      )}
    </article>
  );
}

/** Formulaire d'ajout d'une note à une séance. */
export function NoteForm({ sessionKey, courseTitle, sessionStart }: { sessionKey: string; courseTitle: string; sessionStart: string }) {
  const { onSubmit, pending, result } = useFormAction(createNote, { reset: true });
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      <input type="hidden" name="sessionKey" value={sessionKey} />
      <input type="hidden" name="courseTitle" value={courseTitle} />
      <input type="hidden" name="sessionStart" value={sessionStart} />
      <textarea name="body" required rows={3} maxLength={20000} placeholder="Nouvelle note…" className={inputClass} aria-label="Nouvelle note" />
      <div className="flex items-center gap-2">
        <span className="mr-auto text-xs text-zinc-500">{MARKDOWN_HINT}</span>
        <button type="submit" disabled={pending} className={buttonClass.primary}>
          {pending ? "…" : "Ajouter"}
        </button>
      </div>
      <ActionMessage result={result} />
    </form>
  );
}
