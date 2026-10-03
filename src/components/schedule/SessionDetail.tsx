"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { deleteManualSession, markChangesSeen } from "@/lib/actions/sessions";
import { isManualSession } from "@/lib/sessions/manual";
import { addSessionTask } from "@/lib/actions/todos";
import { courseColor, parseCourseTitle } from "@/lib/courses";
import type { Course, Deadline, TodoList } from "@/lib/data/types";
import type { StoredSession } from "@/lib/ics/types";
import { formatFr, isoToBrusselsInputs } from "@/lib/time";
import { DeadlineEditor } from "@/components/deadlines/DeadlineEditor";
import { DeadlineRow } from "@/components/items/DeadlineRow";
import { TodoItemRow } from "@/components/items/TodoItemRow";
import { useGroups } from "@/components/groups/GroupsContext";
import { ReminderControl } from "@/components/reminders/ReminderControl";
import { ListMenu } from "@/components/tasks/ListHeader";
import { ActionMessage, buttonClass, inputClass, useFormAction } from "@/components/ui";
import { timeRange } from "./SessionBlock";
import { describeChanges } from "@/lib/sessions/changes";

type Props = {
  session: StoredSession;
  /** Listes de tâches rattachées à cette séance (la mienne, et celles partagées avec moi). */
  taskLists: TodoList[];
  /** Mes projets : une tâche ajoutée ici peut aller directement dans l'un d'eux. */
  projects: TodoList[];
  courseDeadlines: Deadline[];
  /** Pour le formulaire d'échéance : liste des cours et séances ("prochaine séance"). */
  courses: Course[];
  sessions: StoredSession[];
  now: number;
  onClose: () => void;
};

/** Panneau de détail : feuille en bas de l'écran sur mobile, panneau latéral sur grand écran. */
export function SessionDetail({ session, taskLists, projects, courseDeadlines, courses, sessions, now, onClose }: Props) {
  const { me, shares } = useGroups();
  const tasks = taskLists.flatMap((l) => l.items);
  const myList = taskLists.find((l) => l.ownerId === me); // créée à ma première tâche sur cette séance
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus(); // accessibilité : le focus clavier entre dans le panneau
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const color = courseColor(session.courseKey);
  const parsed = parseCourseTitle(session.title);
  const room = session.location ?? parsed.room;
  const teachers = parsed.teachers.length ? parsed.teachers.join(", ") : session.teacher;
  const [addingDeadline, setAddingDeadline] = useState(false);
  const start = isoToBrusselsInputs(session.start);

  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-labelledby="session-title">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} aria-hidden />
      <aside className="absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-y-auto rounded-t-2xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl dark:bg-zinc-900 md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-[28rem] md:rounded-none">
        <div className="mb-4 flex items-start gap-3">
          <span className="mt-1 h-4 w-4 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />
          <div className="flex-1">
            <h2 id="session-title" className="text-lg font-semibold leading-snug">
              {parsed.course}
            </h2>
            {parsed.isEvaluation ? (
              <span className="mt-1 inline-block rounded bg-red-600 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">Évaluation</span>
            ) : (
              parsed.kind && <p className="text-sm capitalize text-zinc-500">{parsed.kind}</p>
            )}
          </div>
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
        {isManualSession(session) && <DeleteManual id={session.id} onDeleted={onClose} />}

        {session.status === "cancelled" && !session.changes.cancelled && !session.changes.removed && (
          <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
            Cette séance est annulée.
          </p>
        )}

        <dl className="grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-2 text-sm">
          <dt className="text-zinc-500">Date</dt>
          <dd className="capitalize">{formatFr(session.start, "EEEE d MMMM yyyy")}</dd>
          <dt className="text-zinc-500">Horaire</dt>
          <dd>{timeRange(session)}</dd>
          {room && (
            <>
              <dt className="text-zinc-500">Local</dt>
              <dd>{room}</dd>
            </>
          )}
          {teachers && (
            <>
              <dt className="text-zinc-500">Enseignant(s)</dt>
              <dd>{teachers}</dd>
            </>
          )}
        </dl>

        <Section title={`Échéances du cours${courseDeadlines.length ? ` (${courseDeadlines.length})` : ""}`}>
          {courseDeadlines.length > 0 ? (
            <ul className="mb-3 flex flex-col gap-1.5">
              {courseDeadlines.map((d) => (
                <DeadlineRow key={d.id} deadline={d} now={now} compact />
              ))}
            </ul>
          ) : (
            !addingDeadline && <p className="mb-2 text-sm text-zinc-500">Aucune échéance à venir pour ce cours.</p>
          )}
          {addingDeadline ? (
            <div className="rounded-lg border border-blue-200 p-3 dark:border-blue-900">
              {/* Pré-réglé "pour cette séance" : date et heure de début de la séance */}
              <DeadlineEditor
                courses={courses}
                sessions={sessions}
                now={now}
                compact
                initial={{ courseName: parsed.course, date: start.date, time: start.time }}
                onDone={() => setAddingDeadline(false)}
              />
              <button type="button" onClick={() => setAddingDeadline(false)} className={`${buttonClass.ghost} mt-2`}>
                Annuler
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => setAddingDeadline(true)} className={buttonClass.secondary}>
                ＋ Ajouter une échéance
              </button>
              <Link href="/deadlines" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
                Toutes les échéances
              </Link>
            </div>
          )}
        </Section>

        <Section title="Rappels">
          <ReminderControl targetType="session" targetId={session.id} hasTime />
        </Section>

        <Section title="Tâches de cette séance">
          {tasks.length > 0 && (
            <ul className="mb-2">
              {tasks.map((item) => (
                <TodoItemRow key={item.id} item={item} now={now} />
              ))}
            </ul>
          )}
          <SessionTaskForm session={session} projects={projects} />
          {/* Partage des tâches de la séance : avec un groupe ou un étudiant (même menu que dans Tâches). */}
          {myList ? (
            <div className="mt-2 flex items-center gap-2 text-xs text-zinc-500">
              <span className="mr-auto">
                {myList.groupId || shares.some((s) => s.listId === myList.id) ? "👥 Tâches de cette séance partagées" : "Partager les tâches de cette séance"}
              </span>
              <ListMenu list={myList} onDeleted={() => {}} />
            </div>
          ) : (
            <p className="mt-2 text-xs text-zinc-500">Ajoute une première tâche pour pouvoir la partager avec un étudiant ou un groupe.</p>
          )}
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
  // Toujours affiché (même déjà "vu") : l'historique de ce qui a changé sur cette séance.
  const changes = describeChanges(session);
  if (changes.length === 0) return null;

  return (
    <div className="mb-4 rounded-md border border-amber-400 bg-amber-50 p-3 text-sm dark:bg-amber-950/40">
      <p className="mb-1 font-medium">Modifiée par HELMO</p>
      <ul className="flex flex-col gap-1">
        {changes.map((c) => (
          <li key={c.kind}>
            {c.icon} <strong>{c.label}</strong>
            {c.detail && ` : ${c.detail}`}
          </li>
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

function SessionTaskForm({ session, projects }: { session: StoredSession; projects: TodoList[] }) {
  const { onSubmit, pending, result } = useFormAction(addSessionTask, { reset: true });
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-1">
      <input type="hidden" name="courseName" value={session.title} />
      <input type="hidden" name="sessionKey" value={session.key} />
      <input type="hidden" name="sessionStart" value={session.start} />
      {/* courseName reste l'intitulé complet (il sert à retrouver la séance) ; le nom de la liste est lisible. */}
      <input type="hidden" name="listTitle" value={`${parseCourseTitle(session.title).course} – ${formatFr(session.start, "d MMM")}`} />
      {projects.length > 0 && (
        <select name="projectId" defaultValue="" aria-label="Où ajouter la tâche" className={inputClass}>
          <option value="">Dans cette séance</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              Dans le projet : {p.title}
            </option>
          ))}
        </select>
      )}
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

/** Plage ajoutée à la main : seule sorte de séance qu'on peut supprimer. */
function DeleteManual({ id, onDeleted }: { id: string; onDeleted: () => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <p className="mb-3 flex items-center gap-2 text-sm text-zinc-500">
      <span className="flex-1">Plage ajoutée par toi.</span>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await deleteManualSession(id);
            if (r.ok) onDeleted();
            else setError(r.error);
          })
        }
        className={buttonClass.danger}
      >
        Supprimer
      </button>
      {error && <span className="text-red-600 dark:text-red-400">{error}</span>}
    </p>
  );
}
