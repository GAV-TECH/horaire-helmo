"use client";

import { useState } from "react";
import { saveDeadline } from "@/lib/actions/deadlines";
import type { Course, Deadline, Priority } from "@/lib/data/types";
import { nextSessionOf } from "@/lib/deadlines";
import type { StoredSession } from "@/lib/ics/types";
import { dayKey, formatFr, isoToBrusselsInputs } from "@/lib/time";
import { shiftDay } from "@/lib/calendar";
import { SharePicker } from "@/components/groups/share";
import { ActionMessage, useFormAction } from "@/components/ui";
import { buttonClass, inputClass } from "@/components/styles";
import { IMPORTANCE } from "./Countdown";

type Props = {
  /** Deadline existante à modifier ; sinon création. */
  deadline?: Deadline;
  courses: Course[];
  sessions: StoredSession[];
  now: number;
  /** Pré-remplissage (ex. depuis une séance ou une évaluation). */
  initial?: { title?: string; courseName?: string; date?: string; time?: string };
  compact?: boolean;
  onDone?: () => void;
};

/**
 * Formulaire d'échéance (création ou modification), avec des raccourcis de date :
 * "Prochaine séance" du cours choisi, demain, dans une semaine.
 */
export function DeadlineEditor({ deadline, courses, sessions, now, initial, compact = false, onDone }: Props) {
  const due = deadline ? isoToBrusselsInputs(deadline.dueAt) : null;
  const today = dayKey(now);
  const [courseName, setCourseName] = useState(deadline?.courseName ?? initial?.courseName ?? "");
  const [date, setDate] = useState(due?.date ?? initial?.date ?? "");
  const [time, setTime] = useState(due?.time ?? initial?.time ?? "23:59");
  const [priority, setPriority] = useState<Priority>(deadline?.priority ?? 2);
  const next = courseName ? nextSessionOf(courseName, sessions, now) : null;
  const { onSubmit, pending, result } = useFormAction(saveDeadline, { reset: !deadline, onSuccess: onDone });

  const pick = (d: string, t: string) => {
    setDate(d);
    setTime(t);
  };
  const chip = (active: boolean) =>
    `rounded-full border px-2.5 py-1 text-xs ${active ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300" : "border-zinc-200 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"}`;
  const nextDate = next ? isoToBrusselsInputs(next.start) : null;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      {deadline && <input type="hidden" name="id" value={deadline.id} />}
      <input
        name="title"
        required
        maxLength={200}
        defaultValue={deadline?.title ?? initial?.title}
        placeholder="Ex. Rapport de labo, réviser le chapitre 3…"
        aria-label="Intitulé"
        className={`${inputClass} text-base`}
      />

      <div className={`grid gap-3 ${compact ? "" : "sm:grid-cols-2"}`}>
        <label className="flex flex-col gap-1 text-xs text-zinc-500">
          Cours
          <input name="courseName" list="echeance-courses" maxLength={300} value={courseName} onChange={(e) => setCourseName(e.target.value)} placeholder="Aucun" className={inputClass} />
          <datalist id="echeance-courses">
            {courses.map((c) => (
              <option key={c.key} value={c.name} />
            ))}
          </datalist>
        </label>
        <div className="flex flex-col gap-1 text-xs text-zinc-500">
          Importance
          <div className="flex gap-1.5">
            {([1, 2, 3] as const).map((p) => (
              <button key={p} type="button" onClick={() => setPriority(p)} aria-pressed={priority === p} className={`flex-1 ${chip(priority === p)}`}>
                <span className="font-black">{IMPORTANCE[p].marks}</span> {IMPORTANCE[p].label}
              </button>
            ))}
          </div>
          <input type="hidden" name="priority" value={priority} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5 text-xs text-zinc-500">
        Échéance
        <div className="flex flex-wrap gap-1.5">
          {nextDate && next && (
            <button type="button" onClick={() => pick(nextDate.date, nextDate.time)} className={chip(date === nextDate.date && time === nextDate.time)} title={`Séance du ${formatFr(next.start, "EEEE d MMMM à HH:mm")}`}>
              Prochaine séance · {formatFr(next.start, "EEE d MMM")}
            </button>
          )}
          <button type="button" onClick={() => pick(shiftDay(today, 1), "23:59")} className={chip(date === shiftDay(today, 1))}>
            Demain
          </button>
          <button type="button" onClick={() => pick(shiftDay(today, 7), "23:59")} className={chip(date === shiftDay(today, 7))}>
            Dans une semaine
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input name="date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" className={inputClass} />
          <input name="time" type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Heure" className={inputClass} />
        </div>
      </div>

      {!compact && (
        <label className="flex flex-col gap-1 text-xs text-zinc-500">
          Détails
          <textarea name="details" rows={2} maxLength={5000} defaultValue={deadline?.details ?? ""} placeholder="Consignes, chapitres à revoir…" className={inputClass} />
        </label>
      )}
      <SharePicker defaultValue={deadline?.groupId ?? ""} />
      <ActionMessage result={result} showSuccess={!deadline} />
      <button type="submit" disabled={pending} className={`${buttonClass.primary} self-start`}>
        {pending ? "Enregistrement…" : deadline ? "Enregistrer" : "Ajouter l'échéance"}
      </button>
    </form>
  );
}
