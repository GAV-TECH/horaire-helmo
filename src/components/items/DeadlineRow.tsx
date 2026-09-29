"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { deleteDeadline, setDeadlineDone } from "@/lib/actions/deadlines";
import { courseColor } from "@/lib/courses";
import type { Deadline } from "@/lib/data/types";
import { DoneBy, SharedBadge } from "@/components/groups/share";
import { useGroups } from "@/components/groups/GroupsContext";
import { Countdown, Importance } from "@/components/deadlines/Countdown";
import { ReminderControl } from "@/components/reminders/ReminderControl";
import { canEdit } from "@/lib/groups";
import { ErrorText, buttonClass } from "@/components/ui";
import { formatDue } from "./format";

export function DeadlineRow({ deadline, now, compact = false }: { deadline: Deadline; now: number; compact?: boolean }) {
  const [done, setOptimisticDone] = useOptimistic(deadline.doneAt !== null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const overdue = !done && Date.parse(deadline.dueAt) < now;
  const { me, groups } = useGroups();
  const editable = canEdit(deadline, me, groups); // mêmes règles que le RLS : on masque ce qui serait refusé

  const toggle = () =>
    startTransition(async () => {
      setOptimisticDone(!done);
      const r = await setDeadlineDone(deadline.id, !done);
      setError(r.ok ? null : r.error);
    });
  const remove = () =>
    startTransition(async () => {
      const r = await deleteDeadline(deadline.id);
      setError(r.ok ? null : r.error);
    });

  return (
    <li
      className="group flex items-start gap-2 rounded-md border-l-4 bg-zinc-50 px-2 py-1.5 dark:bg-zinc-900"
      style={{ borderLeftColor: deadline.courseKey ? courseColor(deadline.courseKey) : "#71717a" }}
    >
      <input
        type="checkbox"
        checked={done}
        onChange={toggle}
        className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600"
        aria-label={`Marquer « ${deadline.title} » comme ${done ? "à faire" : "terminée"}`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <p className={`mr-auto text-sm font-medium ${done ? "text-zinc-400 line-through" : ""}`}>
            ⚑ {deadline.title}
            <SharedBadge groupId={deadline.groupId} ownerId={deadline.ownerId} />
          </p>
          {/* Le coin : importance + compte à rebours */}
          <span className="flex shrink-0 items-center gap-1.5">
            {!done && <Importance priority={deadline.priority} />}
            <Countdown dueAt={deadline.dueAt} now={now} done={done} />
          </span>
        </div>
        <p className="text-xs text-zinc-500">
          <span className={overdue ? "font-medium text-red-600 dark:text-red-400" : ""}>{formatDue(deadline.dueAt)}</span>
          {deadline.courseName && ` · ${deadline.courseName}`}
        </p>
        {deadline.groupId && <DoneBy groupId={deadline.groupId} doneBy={deadline.doneBy} />}
        {!compact && deadline.details && <p className="mt-1 whitespace-pre-wrap text-xs text-zinc-600 dark:text-zinc-400">{deadline.details}</p>}
        {!compact && !done && (
          <div className="mt-1">
            <ReminderControl targetType="deadline" targetId={deadline.id} hasTime groupId={deadline.groupId} />
          </div>
        )}
        <ErrorText>{error}</ErrorText>
      </div>
      {!compact && editable && (
        <span className="flex shrink-0 gap-1">
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
              <Link href={`/deadlines?modifier=${deadline.id}`} className={buttonClass.ghost}>
                Modifier
              </Link>
              <button type="button" onClick={() => setConfirmDelete(true)} className={buttonClass.ghost} aria-label="Supprimer">
                ✕
              </button>
            </>
          )}
        </span>
      )}
    </li>
  );
}
