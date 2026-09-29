"use client";

import Link from "next/link";
import { useState, useSyncExternalStore, useTransition } from "react";
import {
  deleteGroup,
  leaveGroup,
  regenerateInviteCode,
  removeMember,
  renameGroup,
  setMemberRole,
} from "@/lib/actions/groups";
import type { ActionResult } from "@/lib/actions/context";
import type { Deadline, TodoList } from "@/lib/data/types";
import { formatInviteCode, inviteUrl } from "@/lib/groups";
import { DeadlineRow } from "@/components/items/DeadlineRow";
import { ActionMessage, PageTitle, buttonClass, cardClass, inputClass, useFormAction } from "@/components/ui";
import { useGroups } from "./GroupsContext";

type Props = { groupId: string; deadlines: Deadline[]; lists: TodoList[]; now: number };

/** Adresse du site, lue dans le navigateur (vide pendant le rendu serveur). */
function useOrigin() {
  return useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  );
}

export function GroupDetail({ groupId, deadlines, lists, now }: Props) {
  const { me, groups } = useGroups();
  const group = groups.find((g) => g.id === groupId);
  const origin = useOrigin();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null); // action en attente de confirmation
  const [copied, setCopied] = useState<string | null>(null);
  const rename = useFormAction(renameGroup);

  if (!group) {
    return (
      <div className="py-16 text-center">
        <p className="font-semibold">Groupe introuvable.</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-zinc-500">
          Seuls ses membres peuvent le voir. Si on t&apos;a invité, utilise le lien d&apos;invitation ou saisis le code dans « Mes
          groupes ».
        </p>
        <Link href="/groupes" className={`${buttonClass.secondary} mt-4`}>
          Mes groupes
        </Link>
      </div>
    );
  }

  const isAdmin = group.myRole === "admin";
  const link = origin ? inviteUrl(origin, group.inviteCode) : "";
  const run = (fn: () => Promise<ActionResult>) =>
    startTransition(async () => {
      setConfirm(null);
      setResult(await fn());
    });
  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied(null); // presse-papiers refusé : l'utilisateur peut toujours sélectionner le texte
    }
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <PageTitle aside={<Link href="/groupes" className={buttonClass.ghost}>← Mes groupes</Link>}>👥 {group.name}</PageTitle>
      <ActionMessage result={result} />

      <section className={cardClass}>
        <h2 className="mb-2 font-semibold">Inviter</h2>
        <p className="mb-2 text-sm text-zinc-500">Partage le code ou le lien : la personne devra avoir un compte et confirmer.</p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="rounded bg-zinc-100 px-2 py-1 text-lg tracking-wider dark:bg-zinc-800">{formatInviteCode(group.inviteCode)}</code>
          <button type="button" onClick={() => copy(group.inviteCode, "code")} className={buttonClass.secondary}>
            {copied === "code" ? "✓ Copié" : "Copier le code"}
          </button>
          {link && (
            <button type="button" onClick={() => copy(link, "lien")} className={buttonClass.secondary}>
              {copied === "lien" ? "✓ Copié" : "Copier le lien"}
            </button>
          )}
        </div>
        {link && <p className="mt-2 break-all text-xs text-zinc-500">{link}</p>}
        {isAdmin && (
          <div className="mt-3">
            {confirm === "regen" ? (
              <span className="flex flex-wrap items-center gap-2 text-sm">
                L&apos;ancien code et l&apos;ancien lien ne marcheront plus.
                <button type="button" disabled={pending} onClick={() => run(() => regenerateInviteCode(group.id))} className={buttonClass.danger}>
                  Confirmer
                </button>
                <button type="button" onClick={() => setConfirm(null)} className={buttonClass.ghost}>
                  Annuler
                </button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirm("regen")} className={buttonClass.ghost}>
                Générer un nouveau code
              </button>
            )}
          </div>
        )}
      </section>

      <section className={cardClass}>
        <h2 className="mb-2 font-semibold">Membres ({group.members.length})</h2>
        <ul className="flex flex-col gap-1.5">
          {group.members.map((m) => (
            <li key={m.userId} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="mr-auto">
                {m.displayName}
                {m.userId === me && <span className="text-zinc-500"> (moi)</span>}
                {m.role === "admin" && (
                  <span className="ml-2 rounded bg-blue-100 px-1.5 text-[11px] text-blue-700 dark:bg-blue-950 dark:text-blue-300">admin</span>
                )}
              </span>
              {isAdmin &&
                m.userId !== me &&
                (confirm === `remove:${m.userId}` ? (
                  <>
                    <button type="button" disabled={pending} onClick={() => run(() => removeMember(group.id, m.userId))} className={buttonClass.danger}>
                      Confirmer l&apos;exclusion
                    </button>
                    <button type="button" onClick={() => setConfirm(null)} className={buttonClass.ghost}>
                      Annuler
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => run(() => setMemberRole(group.id, m.userId, m.role === "admin" ? "member" : "admin"))}
                      className={buttonClass.ghost}
                    >
                      {m.role === "admin" ? "Retirer admin" : "Nommer admin"}
                    </button>
                    <button type="button" onClick={() => setConfirm(`remove:${m.userId}`)} className={`${buttonClass.ghost} text-red-600`}>
                      Exclure
                    </button>
                  </>
                ))}
            </li>
          ))}
        </ul>
      </section>

      <section className={cardClass}>
        <h2 className="mb-2 font-semibold">Partagé avec le groupe</h2>
        {deadlines.length === 0 && lists.length === 0 && (
          <p className="text-sm text-zinc-500">
            Rien pour l&apos;instant. Choisis « Partager avec : {group.name} » en créant une deadline ou une liste de tâches.
          </p>
        )}
        {deadlines.length > 0 && (
          <ul className="mb-3 flex flex-col gap-1.5">
            {deadlines.map((d) => (
              <DeadlineRow key={d.id} deadline={d} now={now} compact />
            ))}
          </ul>
        )}
        {lists.length > 0 && (
          <ul className="flex flex-col gap-1 text-sm">
            {lists.map((l) => (
              <li key={l.id}>
                <Link href="/taches" className="hover:underline">
                  ☐ {l.title}
                </Link>{" "}
                <span className="text-xs text-zinc-500">{l.items.length} tâche(s)</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {isAdmin && (
        <section className={cardClass}>
          <h2 className="mb-2 font-semibold">Administration</h2>
          <form onSubmit={rename.onSubmit} className="flex flex-wrap gap-2">
            <input type="hidden" name="id" value={group.id} />
            <input name="name" defaultValue={group.name} required maxLength={80} className={`${inputClass} min-w-40 flex-1`} aria-label="Nom du groupe" />
            <button type="submit" disabled={rename.pending} className={buttonClass.secondary}>
              Renommer
            </button>
          </form>
          <ActionMessage result={rename.result} />
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        {confirm === "leave" ? (
          <>
            <button type="button" disabled={pending} onClick={() => run(() => leaveGroup(group.id))} className={buttonClass.danger}>
              Confirmer : quitter le groupe
            </button>
            <button type="button" onClick={() => setConfirm(null)} className={buttonClass.ghost}>
              Annuler
            </button>
          </>
        ) : (
          <button type="button" onClick={() => setConfirm("leave")} className={buttonClass.danger}>
            Quitter le groupe
          </button>
        )}
        {isAdmin &&
          (confirm === "delete" ? (
            <>
              <button type="button" disabled={pending} onClick={() => run(() => deleteGroup(group.id))} className={buttonClass.danger}>
                Confirmer : supprimer le groupe pour tout le monde
              </button>
              <button type="button" onClick={() => setConfirm(null)} className={buttonClass.ghost}>
                Annuler
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setConfirm("delete")} className={buttonClass.danger}>
              Supprimer le groupe
            </button>
          ))}
      </div>
      <p className="text-xs text-zinc-500">
        Si tu quittes le groupe, ce que tu y as partagé reste visible par les autres membres. Si le groupe est supprimé, rien n&apos;est
        effacé : chaque élément partagé redevient privé pour son auteur.
      </p>
    </div>
  );
}
