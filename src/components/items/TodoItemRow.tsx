"use client";

import { useOptimistic, useState, useTransition } from "react";
import { sendTaskCopy } from "@/lib/actions/shares";
import { renameTodoItem } from "@/lib/actions/tasks";
import { deleteTodoItem, setTodoDone } from "@/lib/actions/todos";
import type { TodoItem } from "@/lib/data/types";
import { reminderStatus } from "@/lib/reminders";
import { DoneBy } from "@/components/groups/share";
import { ReminderControl } from "@/components/reminders/ReminderControl";
import { useTargetReminders } from "@/components/reminders/RemindersContext";
import { StudentSearch } from "@/components/tasks/StudentSearch";
import { ErrorText, buttonClass, inputClass } from "@/components/ui";
import { formatDue } from "./format";

type Props = {
  item: TodoItem;
  subtitle?: string;
  now: number;
  /** Groupe de la liste, si elle est partagée : affiche qui a fait la tâche. */
  groupId?: string | null;
  /** Masque la suppression quand le RLS la refuserait (ni auteur, ni propriétaire de la liste, ni admin). */
  canDelete?: boolean;
};

/**
 * Une tâche avec sa case à cocher. La coche s'affiche immédiatement (mise à jour "optimiste").
 * ✎ modifie le titre ; ↗ envoie une copie à un étudiant (il reçoit sa propre tâche, à accepter).
 */
export function TodoItemRow({ item, subtitle, now, groupId = null, canDelete = true }: Props) {
  // useOptimistic : affiche tout de suite la nouvelle valeur, puis se recale sur la vraie donnée
  // quand le serveur a répondu (et revient en arrière si l'action a échoué).
  const [done, setOptimisticDone] = useOptimistic(item.done);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showReminders, setShowReminders] = useState(false);
  const [editing, setEditing] = useState(false);
  const [sending, setSending] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const { reminders } = useTargetReminders("todo", item.id);
  const pendingReminders = reminders.filter((r) => reminderStatus(r, now) === "pending").length;

  const toggle = () =>
    startTransition(async () => {
      setOptimisticDone(!done);
      const r = await setTodoDone(item.id, !done);
      setError(r.ok ? null : r.error);
    });

  const remove = () =>
    startTransition(async () => {
      const r = await deleteTodoItem(item.id);
      setError(r.ok ? null : r.error);
    });

  const rename = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = String(new FormData(event.currentTarget).get("title") ?? "");
    startTransition(async () => {
      const r = await renameTodoItem(item.id, title);
      setError(r.ok ? null : r.error);
      if (r.ok) setEditing(false);
    });
  };

  const sendCopy = async (recipientId: string) => {
    const r = await sendTaskCopy(item.id, recipientId);
    setError(r.ok ? null : r.error);
    setInfo(r.ok ? (r.message ?? null) : null);
    if (r.ok) setSending(false);
    return r.ok;
  };

  const overdue = !done && item.dueAt !== null && Date.parse(item.dueAt) < now;

  return (
    <li className="group flex items-start gap-2 py-1">
      <input
        type="checkbox"
        checked={done}
        onChange={toggle}
        className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600"
        aria-label={`Marquer « ${item.title} » comme ${done ? "à faire" : "fait"}`}
      />
      <div className="min-w-0 flex-1">
        {editing ? (
          <form onSubmit={rename} className="flex gap-1">
            <input name="title" defaultValue={item.title} required maxLength={300} autoFocus aria-label="Titre de la tâche" className={inputClass} />
            <button type="submit" disabled={pending} className={buttonClass.primary}>
              OK
            </button>
            <button type="button" onClick={() => setEditing(false)} className={buttonClass.ghost}>
              Annuler
            </button>
          </form>
        ) : (
          <p className={`text-sm ${done ? "text-zinc-400 line-through" : ""}`}>
            {item.title}
            {pendingReminders > 0 && !showReminders && (
              <span className="ml-1 text-xs" title={`${pendingReminders} rappel(s) prévu(s)`}>
                🔔
              </span>
            )}
          </p>
        )}
        {(item.dueAt || subtitle) && (
          <p className="text-xs text-zinc-500">
            {item.dueAt && <span className={overdue ? "font-medium text-red-600 dark:text-red-400" : ""}>{formatDue(item.dueAt)}</span>}
            {item.dueAt && subtitle && " · "}
            {subtitle}
          </p>
        )}
        {groupId && <DoneBy groupId={groupId} doneBy={item.doneBy} />}
        {showReminders && (
          <div className="mt-1">
            <ReminderControl targetType="todo" targetId={item.id} hasTime={item.dueAt !== null} startOpen groupId={groupId} />
          </div>
        )}
        {sending && (
          <div className="mt-1 rounded-md border border-zinc-200 p-2 dark:border-zinc-800">
            <p className="mb-1 text-xs text-zinc-500">Envoyer une copie de cette tâche à un étudiant. Il la reçoit dans ses propres tâches, s&apos;il l&apos;accepte.</p>
            <StudentSearch label={() => "Envoyer"} pending={pending} onPick={(h) => sendCopy(h.id)} />
          </div>
        )}
        {info && <p className="text-xs text-green-700 dark:text-green-400">{info}</p>}
        <ErrorText>{error}</ErrorText>
      </div>
      {confirmDelete ? (
        <span className="flex gap-1">
          <button type="button" onClick={remove} disabled={pending} className={`${buttonClass.ghost} text-red-600`}>
            Supprimer
          </button>
          <button type="button" onClick={() => setConfirmDelete(false)} className={buttonClass.ghost}>
            Annuler
          </button>
        </span>
      ) : (
        <span className="flex gap-0.5 opacity-60 group-hover:opacity-100">
          {!done && (
            <button
              type="button"
              onClick={() => setShowReminders(!showReminders)}
              className={buttonClass.ghost}
              aria-expanded={showReminders}
              aria-label={`Rappels de « ${item.title} »`}
            >
              🔔
            </button>
          )}
          <button type="button" onClick={() => setEditing(!editing)} className={buttonClass.ghost} aria-expanded={editing} aria-label={`Modifier « ${item.title} »`}>
            ✎
          </button>
          <button
            type="button"
            onClick={() => {
              setSending(!sending);
              setInfo(null);
            }}
            className={buttonClass.ghost}
            aria-expanded={sending}
            aria-label={`Envoyer une copie de « ${item.title} » à un étudiant`}
            title="Envoyer une copie à un étudiant"
          >
            ↗
          </button>
          {canDelete && (
            <button type="button" onClick={() => setConfirmDelete(true)} className={buttonClass.ghost} aria-label={`Supprimer « ${item.title} »`}>
              ✕
            </button>
          )}
        </span>
      )}
    </li>
  );
}
