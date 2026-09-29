"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { saveDeadline } from "@/lib/actions/deadlines";
import { PRIORITY_LABELS, type Course, type Deadline } from "@/lib/data/types";
import { isoToBrusselsInputs } from "@/lib/time";
import { DeadlineRow } from "@/components/items/DeadlineRow";
import { ActionMessage, Field, PageTitle, buttonClass, cardClass, inputClass, useFormAction } from "@/components/ui";

type Props = {
  deadlines: Deadline[];
  courses: Course[];
  now: number;
  editing: Deadline | null;
  prefill: { courseName: string; date: string };
};

export function DeadlinesView({ deadlines, courses, now, editing, prefill }: Props) {
  const open = deadlines.filter((d) => !d.doneAt);
  const late = open.filter((d) => Date.parse(d.dueAt) < now);
  const upcoming = open.filter((d) => Date.parse(d.dueAt) >= now);
  const done = deadlines.filter((d) => d.doneAt).reverse();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <PageTitle>Deadlines</PageTitle>

      {/* key : change de formulaire (création ↔ modification) en repartant de zéro */}
      <DeadlineForm key={editing?.id ?? "new"} courses={courses} editing={editing} prefill={prefill} />

      {late.length > 0 && <Group title="En retard" items={late} now={now} />}
      <Group title="À venir" items={upcoming} now={now} empty="Aucune deadline à venir." />
      {done.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm font-semibold text-zinc-500">Terminées ({done.length})</summary>
          <ul className="mt-2 flex flex-col gap-1.5">
            {done.map((d) => (
              <DeadlineRow key={d.id} deadline={d} now={now} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Group({ title, items, now, empty }: { title: string; items: Deadline[]; now: number; empty?: string }) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold">{title}</h2>
      {items.length === 0 ? (
        <p className="text-sm text-zinc-500">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {items.map((d) => (
            <DeadlineRow key={d.id} deadline={d} now={now} />
          ))}
        </ul>
      )}
    </section>
  );
}

function DeadlineForm({ courses, editing, prefill }: { courses: Course[]; editing: Deadline | null; prefill: Props["prefill"] }) {
  const router = useRouter();
  const { onSubmit, pending, result } = useFormAction(saveDeadline, {
    reset: !editing,
    // Après une modification, on quitte le mode édition (retire ?modifier= de l'URL).
    onSuccess: () => editing && router.replace("/deadlines"),
  });
  const due = editing ? isoToBrusselsInputs(editing.dueAt) : { date: prefill.date, time: "23:59" };

  return (
    <form onSubmit={onSubmit} className={`${cardClass} flex flex-col gap-3`}>
      <h2 className="font-semibold">{editing ? "Modifier la deadline" : "Nouvelle deadline"}</h2>
      {editing && <input type="hidden" name="id" value={editing.id} />}
      <Field label="Titre">
        <input name="title" required maxLength={200} defaultValue={editing?.title} placeholder="Rapport de labo" className={inputClass} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date">
          <input name="date" type="date" required defaultValue={due.date} className={inputClass} />
        </Field>
        <Field label="Heure">
          <input name="time" type="time" defaultValue={due.time} className={inputClass} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Cours (facultatif)">
          {/* datalist : propose les cours de l'horaire tout en permettant un texte libre */}
          <input name="courseName" list="courses" maxLength={300} defaultValue={editing?.courseName ?? prefill.courseName} className={inputClass} />
        </Field>
        <Field label="Priorité">
          <select name="priority" defaultValue={editing?.priority ?? 2} className={inputClass}>
            {([1, 2, 3] as const).map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABELS[p]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <datalist id="courses">
        {courses.map((c) => (
          <option key={c.key} value={c.name} />
        ))}
      </datalist>
      <Field label="Détails (facultatif)">
        <textarea name="details" rows={2} maxLength={5000} defaultValue={editing?.details ?? ""} className={inputClass} />
      </Field>
      <ActionMessage result={result} />
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className={buttonClass.primary}>
          {editing ? "Enregistrer" : "Ajouter"}
        </button>
        {editing && (
          <Link href="/deadlines" className={buttonClass.secondary}>
            Annuler
          </Link>
        )}
      </div>
    </form>
  );
}
