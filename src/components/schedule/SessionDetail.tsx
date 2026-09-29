"use client";

import Link from "next/link";
import { useEffect, useRef, useTransition } from "react";
import { markChangesSeen } from "@/lib/actions/sessions";
import { addSessionTask } from "@/lib/actions/todos";
import { courseColor } from "@/lib/courses";
import type { Deadline, Note, TodoItem } from "@/lib/data/types";
import type { StoredSession } from "@/lib/ics/types";
import { dayKey, formatFr } from "@/lib/time";
import { DeadlineRow } from "@/components/items/DeadlineRow";
import { NoteCard, NoteForm } from "@/components/items/NoteCard";
import { TodoItemRow } from "@/components/items/TodoItemRow";
import { formatSessionDate } from "@/components/items/format";
import { ActionMessage, buttonClass, inputClass, useFormAction } from "@/components/ui";
import { timeRange } from "./SessionBlock";

type Props = {
  session: StoredSession;
  notes: Note[];
  tasks: TodoItem[];
  courseDeadlines: Deadline[];
  now: number;
  onClose: () => void;
};

/** Panneau de détail : feuille en bas de l'écran sur mobile, panneau latéral sur grand écran. */
export function SessionDetail({ session, notes, tasks, courseDeadlines, now, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus(); // accessibilité : le focus clavier entre dans le panneau
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const color = courseColor(session.courseKey);

  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-labelledby="session-title">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} aria-hidden />
      <aside className="absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-y-auto rounded-t-2xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl dark:bg-zinc-900 md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-[28rem] md:rounded-none">
        <div className="mb-4 flex items-start gap-3">
          <span className="mt-1 h-4 w-4 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />
          <h2 id="session-title" className="flex-1 text-lg font-semibold leading-snug">
            {session.title}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>

        <ChangesBox session={session} />

        {session.status === "cancelled" && !session.changes.cancelled && (
          <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
            Cette séance est annulée.
          </p>
        )}

        <dl className="grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-2 text-sm">
          <dt className="text-zinc-500">Date</dt>
          <dd className="capitalize">{formatFr(session.start, "EEEE d MMMM yyyy")}</dd>
          <dt className="text-zinc-500">Horaire</dt>
          <dd>{timeRange(session)}</dd>
          {session.location && (
            <>
              <dt className="text-zinc-500">Local</dt>
              <dd>{session.location}</dd>
            </>
          )}
          {session.teacher && (
            <>
              <dt className="text-zinc-500">Enseignant</dt>
              <dd>{session.teacher}</dd>
            </>
          )}
        </dl>

        <Section title={`Notes (${notes.length})`}>
          <div className="flex flex-col gap-2">
            {notes.map((note) => (
              <NoteCard key={note.id} note={note} />
            ))}
            <NoteForm sessionKey={session.key} courseTitle={session.title} sessionStart={session.start} />
          </div>
        </Section>

        <Section title="Tâches de cette séance">
          {tasks.length > 0 && (
            <ul className="mb-2">
              {tasks.map((item) => (
                <TodoItemRow key={item.id} item={item} now={now} />
              ))}
            </ul>
          )}
          <SessionTaskForm session={session} />
        </Section>

        <Section title="Deadlines du cours">
          {courseDeadlines.length > 0 ? (
            <ul className="mb-2 flex flex-col gap-1.5">
              {courseDeadlines.map((d) => (
                <DeadlineRow key={d.id} deadline={d} now={now} compact />
              ))}
            </ul>
          ) : (
            <p className="mb-2 text-sm text-zinc-500">Aucune deadline à venir pour ce cours.</p>
          )}
          <Link
            href={`/deadlines?cours=${encodeURIComponent(session.title)}&date=${dayKey(session.start)}`}
            className="text-sm text-blue-600 hover:underline dark:text-blue-400"
          >
            + Ajouter une deadline pour ce cours
          </Link>
        </Section>

        {session.description && (
          <Section title="Description">
            <p className="whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">{session.description}</p>
          </Section>
        )}
      </aside>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

/** Explique ce qui a changé depuis l'import initial, avec un bouton pour faire disparaître le badge. */
function ChangesBox({ session }: { session: StoredSession }) {
  const [pending, startTransition] = useTransition();
  const c = session.changes;
  const lines: string[] = [];
  if (c.cancelled) lines.push("Séance annulée ou retirée de l'horaire.");
  if (c.moved) lines.push(`Déplacée : prévue initialement le ${formatSessionDate(c.moved.fromStart)} – ${formatFr(c.moved.fromEnd, "HH:mm")}.`);
  if (c.room) lines.push(`Local changé : était ${c.room.from ?? "non précisé"}.`);
  if (c.added) lines.push("Séance ajoutée récemment à l'horaire.");
  if (lines.length === 0) return null;

  return (
    <div className="mb-4 rounded-md border border-amber-400 bg-amber-50 p-3 text-sm dark:bg-amber-950/40">
      <ul className="list-disc pl-4">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {!session.changesSeen && (
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(async () => void (await markChangesSeen(session.id)))}
          className={`${buttonClass.secondary} mt-2`}
        >
          OK, vu
        </button>
      )}
    </div>
  );
}

function SessionTaskForm({ session }: { session: StoredSession }) {
  const { onSubmit, pending, result } = useFormAction(addSessionTask, { reset: true });
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-1">
      <input type="hidden" name="courseName" value={session.title} />
      <input type="hidden" name="sessionKey" value={session.key} />
      <input type="hidden" name="sessionStart" value={session.start} />
      <input type="hidden" name="listTitle" value={`${session.title} – ${formatFr(session.start, "d MMM")}`} />
      <div className="flex gap-2">
        <input name="title" required maxLength={300} placeholder="Nouvelle tâche…" className={inputClass} aria-label="Nouvelle tâche" />
        <button type="submit" disabled={pending} className={buttonClass.primary}>
          Ajouter
        </button>
      </div>
      <ActionMessage result={result} />
    </form>
  );
}
