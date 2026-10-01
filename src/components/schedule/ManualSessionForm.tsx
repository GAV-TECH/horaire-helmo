"use client";

import { addManualSession } from "@/lib/actions/sessions";
import { ActionMessage, buttonClass, inputClass, useFormAction } from "@/components/ui";

/** Ajouter soi-même une plage à l'horaire (sport, job, rendez-vous…). */
export function ManualSessionForm({ defaultDate, onDone }: { defaultDate: string; onDone: () => void }) {
  const { onSubmit, pending, result } = useFormAction(addManualSession, { onSuccess: onDone });
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2 rounded-md border border-zinc-200 p-3 text-sm dark:border-zinc-800">
      <label className="flex min-w-40 flex-1 flex-col gap-1">
        Titre
        <input name="title" required maxLength={200} autoFocus placeholder="Sport, job, rendez-vous…" className={inputClass} />
      </label>
      <label className="flex flex-col gap-1">
        Date
        <input name="date" type="date" required defaultValue={defaultDate} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1">
        Début
        <input name="start" type="time" required defaultValue="18:00" className={inputClass} />
      </label>
      <label className="flex flex-col gap-1">
        Fin
        <input name="end" type="time" required defaultValue="19:00" className={inputClass} />
      </label>
      <label className="flex min-w-32 flex-1 flex-col gap-1">
        Lieu (facultatif)
        <input name="location" maxLength={100} className={inputClass} />
      </label>
      <button type="submit" disabled={pending} className={buttonClass.primary}>
        Ajouter
      </button>
      <button type="button" onClick={onDone} className={buttonClass.ghost}>
        Annuler
      </button>
      <ActionMessage result={result} showSuccess={false} />
    </form>
  );
}
