"use client";

import { useMemo, useOptimistic, useState, useTransition } from "react";
import { deleteDeadline, setDeadlineDone } from "@/lib/actions/deadlines";
import { courseColor, parseCourseTitle } from "@/lib/courses";
import type { Course, Deadline } from "@/lib/data/types";
import { SECTION_LABELS, buildEcheances, countdown, sectionOf, type Echeance, type Section } from "@/lib/deadlines";
import { canEdit } from "@/lib/groups";
import type { StoredSession } from "@/lib/ics/types";
import { formatFr } from "@/lib/time";
import { DoneBy, SharedBadge } from "@/components/groups/share";
import { useGroups } from "@/components/groups/GroupsContext";
import { ReminderControl } from "@/components/reminders/ReminderControl";
import { PageTitle } from "@/components/ui";
import { buttonClass } from "@/components/styles";
import { Countdown, IMPORTANCE, Importance } from "./Countdown";
import { DeadlineEditor } from "./DeadlineEditor";

type Filter = "tout" | "evaluations" | "miennes" | "terminees";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "tout", label: "Tout" },
  { id: "evaluations", label: "Évaluations" },
  { id: "miennes", label: "Mes échéances" },
  { id: "terminees", label: "Terminées" },
];
const SECTIONS: Section[] = ["retard", "semaine", "semaine-prochaine", "plus-tard"];

type Props = {
  deadlines: Deadline[];
  sessions: StoredSession[];
  courses: Course[];
  now: number;
  /** Ouvert au chargement (lien "Modifier" ou "Ajouter pour ce cours"). */
  openId?: string | null;
  prefill?: { courseName?: string; date?: string } | null;
};

/** Page Échéances : évaluations détectées dans l'horaire + échéances personnelles, avec compte à rebours. */
export function EcheancesApp({ deadlines: serverDeadlines, sessions, courses, now, openId = null, prefill = null }: Props) {
  // Cocher "fait" s'affiche tout de suite (useOptimistic), puis la server action l'enregistre.
  const [deadlines, setOptimisticDone] = useOptimistic(serverDeadlines, (list, patch: { id: string; done: boolean }) =>
    list.map((d) => (d.id === patch.id ? { ...d, doneAt: patch.done ? new Date(now).toISOString() : null } : d)),
  );
  const [, startTransition] = useTransition();
  const [filter, setFilter] = useState<Filter>("tout");
  const [selectedId, setSelectedId] = useState<string | null>(openId);
  const [adding, setAdding] = useState(prefill !== null && !openId);
  const [error, setError] = useState<string | null>(null);

  const all = useMemo(() => buildEcheances(deadlines, sessions, now), [deadlines, sessions, now]);
  const isDone = (e: Echeance) => e.type === "deadline" && e.deadline.doneAt !== null;
  const visible = all.filter((e) =>
    filter === "terminees" ? isDone(e) : !isDone(e) && (filter === "tout" || (filter === "evaluations") === (e.type === "evaluation")),
  );
  const count = (f: Filter) =>
    all.filter((e) => (f === "terminees" ? isDone(e) : !isDone(e) && (f === "tout" || (f === "evaluations") === (e.type === "evaluation")))).length;
  const selected = all.find((e) => e.id === selectedId) ?? null;

  const toggleDone = (d: Deadline) =>
    startTransition(async () => {
      setOptimisticDone({ id: d.id, done: d.doneAt === null });
      const r = await setDeadlineDone(d.id, d.doneAt === null);
      setError(r.ok ? null : r.error);
    });

  return (
    <div className="mx-auto flex max-w-6xl gap-6">
      <div className={`min-w-0 flex-1 ${selected ? "hidden md:block" : ""}`}>
        <PageTitle
          aside={
            <button type="button" onClick={() => (setAdding(!adding), setSelectedId(null))} className={buttonClass.primary}>
              {adding ? "Fermer" : "＋ Nouvelle échéance"}
            </button>
          }
        >
          Échéances
        </PageTitle>
        <p className="-mt-2 mb-4 text-sm text-zinc-500">Les évaluations de ton horaire apparaissent toutes seules. Ajoute tes propres dates : remises, révisions…</p>

        {adding && (
          <section className="mb-5 rounded-xl border border-blue-200 bg-white p-4 dark:border-blue-900 dark:bg-zinc-900">
            <DeadlineEditor courses={courses} sessions={sessions} now={now} initial={prefill ?? undefined} onDone={() => setAdding(false)} />
          </section>
        )}

        <div className="mb-4 flex flex-wrap gap-1.5" role="tablist" aria-label="Filtrer les échéances">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={`rounded-full px-3 py-1 text-sm ${filter === f.id ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"}`}
            >
              {f.label} <span className="tabular-nums opacity-60">{count(f.id)}</span>
            </button>
          ))}
        </div>
        {error && <p role="alert" className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

        {visible.length === 0 && (
          <p className="py-12 text-center text-sm text-zinc-500">
            {filter === "terminees" ? "Rien de terminé pour l'instant." : filter === "evaluations" ? "Aucune évaluation à venir dans ton horaire." : "Aucune échéance à venir. Profites-en !"}
          </p>
        )}

        {filter === "terminees" ? (
          <CardList items={visible} now={now} selectedId={selectedId} onOpen={setSelectedId} onToggle={toggleDone} />
        ) : (
          SECTIONS.map((section) => {
            const items = visible.filter((e) => sectionOf(e.dueAt, now) === section);
            if (items.length === 0) return null;
            return (
              <section key={section} className="mb-5">
                <h2 className={`mb-2 text-sm font-semibold ${section === "retard" ? "text-red-600 dark:text-red-400" : "text-zinc-500"}`}>
                  {SECTION_LABELS[section]} · {items.length}
                </h2>
                <CardList items={items} now={now} selectedId={selectedId} onOpen={setSelectedId} onToggle={toggleDone} />
              </section>
            );
          })
        )}
      </div>

      {selected && (
        <aside className="w-full shrink-0 md:w-[24rem]">
          <div className="md:sticky md:top-16">
            <Detail echeance={selected} sessions={sessions} courses={courses} now={now} onClose={() => setSelectedId(null)} onToggle={toggleDone} />
          </div>
        </aside>
      )}
    </div>
  );
}

function CardList(props: { items: Echeance[]; now: number; selectedId: string | null; onOpen: (id: string) => void; onToggle: (d: Deadline) => void }) {
  return (
    <ul className="flex flex-col gap-2">
      {props.items.map((e) => (
        <EcheanceCard key={e.id} echeance={e} now={props.now} selected={e.id === props.selectedId} onOpen={() => props.onOpen(e.id)} onToggle={props.onToggle} />
      ))}
    </ul>
  );
}

/** Une échéance : barre de couleur du cours, intitulé, infos, et dans le coin compte à rebours + importance. */
function EcheanceCard({ echeance: e, now, selected, onOpen, onToggle }: { echeance: Echeance; now: number; selected: boolean; onOpen: () => void; onToggle: (d: Deadline) => void }) {
  const isEval = e.type === "evaluation";
  const parsed = isEval ? parseCourseTitle(e.session.title) : null;
  const course = isEval ? parsed!.course : e.deadline.courseName;
  const done = e.type === "deadline" && e.deadline.doneAt !== null;
  const color = course ? courseColor(course) : "#71717a";

  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(k) => (k.key === "Enter" || k.key === " ") && k.target === k.currentTarget && (k.preventDefault(), onOpen())}
        aria-current={selected ? "true" : undefined}
        className={`relative flex cursor-pointer items-start gap-3 rounded-xl border border-l-4 bg-white py-3 pl-3 pr-3 transition-colors hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:bg-zinc-900 dark:hover:bg-zinc-800/70 ${
          selected ? "border-blue-500" : "border-zinc-200 dark:border-zinc-800"
        }`}
        style={{ borderLeftColor: color }}
      >
        {isEval ? (
          <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center text-base" aria-hidden>
            🎓
          </span>
        ) : (
          <button
            type="button"
            onClick={(ev) => (ev.stopPropagation(), onToggle(e.deadline))}
            aria-label={done ? "Marquer comme à faire" : "Marquer comme terminée"}
            className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 ${done ? "border-green-600 bg-green-600 text-white" : "border-zinc-400 hover:border-blue-600"}`}
          >
            {done && <span className="text-[10px] leading-none">✓</span>}
          </button>
        )}

        <div className="min-w-0 flex-1 pr-20">
          <p className={`font-medium ${done ? "text-zinc-400 line-through" : ""}`}>
            {isEval ? (
              <>
                <span className="mr-1.5 rounded bg-red-600 px-1.5 py-0.5 align-middle text-[10px] font-bold uppercase tracking-wide text-white">Évaluation</span>
                {parsed!.course}
              </>
            ) : (
              e.deadline.title
            )}
          </p>
          <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-zinc-500">
            <span className="capitalize">{formatFr(e.dueAt, "EEE d MMM · HH:mm")}</span>
            {!isEval && course && <span>· {course}</span>}
            {isEval && (e.session.location ?? parsed!.room) && <span>· {e.session.location ?? parsed!.room}</span>}
            {e.type === "deadline" && <SharedBadge groupId={e.deadline.groupId} ownerId={e.deadline.ownerId} />}
          </p>
          {e.type === "deadline" && e.deadline.groupId && <DoneBy groupId={e.deadline.groupId} doneBy={e.deadline.doneBy} />}
        </div>

        {/* Le coin : compte à rebours + importance, lisibles d'un coup d'œil */}
        <div className="absolute right-3 top-3 flex items-center gap-1.5">
          {e.type === "deadline" && !done && <Importance priority={e.deadline.priority} />}
          <Countdown dueAt={e.dueAt} now={now} done={done} />
        </div>
      </div>
    </li>
  );
}

function Detail(props: { echeance: Echeance; sessions: StoredSession[]; courses: Course[]; now: number; onClose: () => void; onToggle: (d: Deadline) => void }) {
  const { echeance: e, sessions, courses, now, onClose } = props;
  const { me, groups } = useGroups();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [preparing, setPreparing] = useState(false);

  const header = (title: React.ReactNode) => (
    <div className="mb-3 flex items-start gap-2">
      <button type="button" onClick={onClose} className="text-sm text-blue-600 md:hidden">
        ‹ Échéances
      </button>
      <h2 className="mr-auto hidden text-lg font-semibold md:block">{title}</h2>
      <Countdown dueAt={e.dueAt} now={now} done={e.type === "deadline" && e.deadline.doneAt !== null} />
      <button type="button" onClick={onClose} className="hidden text-zinc-400 hover:text-zinc-700 md:block" aria-label="Fermer">
        ✕
      </button>
    </div>
  );
  const box = "rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900";

  if (e.type === "evaluation") {
    const p = parseCourseTitle(e.session.title);
    return (
      <div className={box}>
        {header("Évaluation")}
        <p className="text-lg font-semibold md:text-base">{p.course}</p>
        <dl className="mt-3 grid grid-cols-[6rem_1fr] gap-y-1.5 text-sm">
          <dt className="text-zinc-500">Quand</dt>
          <dd className="capitalize">{formatFr(e.session.start, "EEEE d MMMM · HH:mm")}–{formatFr(e.session.end, "HH:mm")}</dd>
          {(e.session.location ?? p.room) && (
            <>
              <dt className="text-zinc-500">Local</dt>
              <dd>{e.session.location ?? p.room}</dd>
            </>
          )}
          {p.teachers.length > 0 && (
            <>
              <dt className="text-zinc-500">Enseignants</dt>
              <dd>{p.teachers.join(", ")}</dd>
            </>
          )}
        </dl>
        <p className="mt-2 text-xs text-zinc-500">Détectée automatiquement dans ton horaire HELMO ({countdown(e.dueAt, now).label.toLowerCase()}).</p>
        <div className="mt-4">
          <p className="mb-1.5 text-sm font-semibold">🔔 Rappels</p>
          <ReminderControl targetType="session" targetId={e.session.id} hasTime />
        </div>
        <div className="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          {preparing ? (
            <DeadlineEditor
              courses={courses}
              sessions={sessions}
              now={now}
              compact
              initial={{ title: `Réviser pour l'évaluation de ${p.course}`, courseName: p.course }}
              onDone={() => setPreparing(false)}
            />
          ) : (
            <button type="button" onClick={() => setPreparing(true)} className={buttonClass.secondary}>
              ＋ Ajouter une échéance de préparation
            </button>
          )}
        </div>
      </div>
    );
  }

  const d = e.deadline;
  const editable = canEdit(d, me, groups);
  return (
    <div className={box}>
      {header(editable ? "Modifier l'échéance" : d.title)}
      {editable ? (
        // key : repart des valeurs de CETTE échéance quand on en ouvre une autre
        <DeadlineEditor key={d.id} deadline={d} courses={courses} sessions={sessions} now={now} compact />
      ) : (
        <div className="text-sm">
          <p className="font-semibold">{d.title}</p>
          <p className="text-zinc-500">
            {formatFr(d.dueAt, "EEEE d MMMM · HH:mm")}
            {d.courseName && ` · ${d.courseName}`} · importance {IMPORTANCE[d.priority].label.toLowerCase()}
          </p>
          {d.details && <p className="mt-2 whitespace-pre-wrap">{d.details}</p>}
          <p className="mt-2 text-xs text-zinc-500">Partagée par un membre du groupe : seuls l&apos;auteur et les admins peuvent la modifier.</p>
        </div>
      )}
      <div className="mt-4 flex flex-col gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <button type="button" onClick={() => props.onToggle(d)} className={`${buttonClass.secondary} self-start`}>
          {d.doneAt ? "↺ Marquer comme à faire" : "✓ Marquer comme terminée"}
        </button>
        {d.groupId && <DoneBy groupId={d.groupId} doneBy={d.doneBy} />}
        <div>
          <p className="mb-1.5 text-sm font-semibold">🔔 Rappels</p>
          <ReminderControl targetType="deadline" targetId={d.id} hasTime groupId={d.groupId} />
        </div>
        {editable &&
          (confirmDelete ? (
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const r = await deleteDeadline(d.id);
                    if (r.ok) onClose();
                    else setError(r.error);
                  })
                }
                className={buttonClass.danger}
              >
                Confirmer la suppression
              </button>
              <button type="button" onClick={() => setConfirmDelete(false)} className={buttonClass.ghost}>
                Annuler
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)} className={`${buttonClass.danger} self-start`}>
              Supprimer l&apos;échéance
            </button>
          ))}
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </div>
    </div>
  );
}
