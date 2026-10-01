"use client";

import { useState, useTransition } from "react";
import type { ActionResult } from "@/lib/actions/context";
import { renameTodoList } from "@/lib/actions/tasks";
import { deleteTodoList, setListGroup, shareListWithNewGroup } from "@/lib/actions/todos";
import type { TodoList } from "@/lib/data/types";
import { canEdit, formatInviteCode, inviteUrl } from "@/lib/groups";
import { useGroups } from "@/components/groups/GroupsContext";
import { buttonClass, inputClass } from "@/components/styles";

/** Menu "⋯" d'une liste : renommer, partager, supprimer (selon les droits). */
export function ListMenu({ list, onDeleted }: { list: TodoList; onDeleted: () => void }) {
  const { me, groups } = useGroups();
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const editable = canEdit(list, me, groups);
  const isOwner = list.ownerId === me;
  const listGroup = groups.find((g) => g.id === list.groupId);
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
        <div className="absolute right-0 z-20 mt-1 flex w-64 flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
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
                  <option value="">Privée</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      👥 {g.name}
                    </option>
                  ))}
                </select>
              )}
              {sharing ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const name = String(new FormData(e.currentTarget).get("name") ?? "");
                    run(() => shareListWithNewGroup(list.id, name), () => setSharing(false));
                  }}
                  className="flex flex-col gap-1.5"
                >
                  <span>Un petit groupe est créé pour cette liste ; tu recevras un lien à envoyer à l&apos;étudiant.</span>
                  <div className="flex gap-2">
                    <input name="name" defaultValue={list.title.slice(0, 80)} maxLength={80} aria-label="Nom du partage" className={inputClass} />
                    <button type="submit" disabled={pending} className={buttonClass.primary}>
                      Créer
                    </button>
                  </div>
                </form>
              ) : (
                <button type="button" onClick={() => setSharing(true)} className={`${buttonClass.secondary} justify-start`}>
                  👤 Partager avec un étudiant…
                </button>
              )}
            </div>
          )}
          {listGroup && <InviteLink name={listGroup.name} code={listGroup.inviteCode} />}
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

/** Lien d'invitation du groupe avec lequel des tâches sont partagées : à envoyer à l'autre étudiant. */
export function InviteLink({ name, code, intro }: { name: string; code: string; intro?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl(window.location.origin, code));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false); // presse-papiers refusé : le code reste affiché
    }
  };
  return (
    <div className="flex flex-col gap-1.5 rounded-md bg-violet-50 p-2 text-xs text-violet-800 dark:bg-violet-950/60 dark:text-violet-200">
      <span>
        {intro ?? "Partagée."} Groupe 👥 <strong>{name}</strong>. Pour inviter quelqu&apos;un, envoie-lui le lien (il doit avoir un compte) :
      </span>
      <div className="flex items-center gap-2">
        <button type="button" onClick={copy} className={buttonClass.secondary}>
          {copied ? "✓ Lien copié" : "Copier le lien"}
        </button>
        <code className="tracking-wider">{formatInviteCode(code)}</code>
      </div>
    </div>
  );
}
