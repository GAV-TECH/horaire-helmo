"use client";

import { useState, useTransition } from "react";
import { createReminder, deleteReminder } from "@/lib/actions/reminders";
import type { ReminderTarget } from "@/lib/data/types";
import { REMINDER_PRESETS, describeReminder, reminderStatus } from "@/lib/reminders";
import { ActionMessage, ErrorText, buttonClass, inputClass, useFormAction } from "@/components/ui";
import { useTargetReminders } from "./RemindersContext";

type Props = {
  targetType: ReminderTarget;
  targetId: string;
  /** Faux pour une tâche sans échéance : seuls les rappels à date précise ont alors un sens. */
  hasTime: boolean;
  /** Ouvre directement le formulaire (sinon, bouton "+ Rappel"). */
  startOpen?: boolean;
};

/** Rappels d'un élément : liste (avec suppression) + formulaire d'ajout. */
export function ReminderControl({ targetType, targetId, hasTime, startOpen = false }: Props) {
  const { reminders, now } = useTargetReminders(targetType, targetId);
  const [open, setOpen] = useState(startOpen);
  const [preset, setPreset] = useState<string>(hasTime ? "1h" : "custom");
  const add = useFormAction(createReminder, { onSuccess: () => setOpen(startOpen) });
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const remove = (id: string) =>
    startTransition(async () => {
      const r = await deleteReminder(id);
      setError(r.ok ? null : r.error);
    });

  return (
    <div className="flex flex-col gap-1.5">
      {reminders.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {reminders.map((r) => {
            const status = reminderStatus(r, now);
            return (
              <li
                key={r.id}
                className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
                  status === "pending" ? "border-blue-300 text-blue-700 dark:border-blue-800 dark:text-blue-300" : "border-zinc-300 text-zinc-400 dark:border-zinc-700"
                }`}
              >
                🔔 {describeReminder(r)}
                {status === "sent" && " · envoyé"}
                {status === "skipped" && " · non envoyé (fait / annulé)"}
                <button type="button" disabled={pending} onClick={() => remove(r.id)} className="ml-0.5 hover:text-red-600" aria-label={`Supprimer le rappel ${describeReminder(r)}`}>
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <ErrorText>{error}</ErrorText>

      {open ? (
        <form onSubmit={add.onSubmit} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="targetType" value={targetType} />
          <input type="hidden" name="targetId" value={targetId} />
          <select name="preset" value={preset} onChange={(e) => setPreset(e.target.value)} className={`${inputClass} w-auto`} aria-label="Moment du rappel">
            {REMINDER_PRESETS.map((p) => (
              <option key={p.id} value={p.id} disabled={!hasTime}>
                {p.label}
              </option>
            ))}
            <option value="custom">Date précise…</option>
          </select>
          {preset === "custom" && (
            <>
              <input name="date" type="date" required className={`${inputClass} w-auto`} aria-label="Date du rappel" />
              <input name="time" type="time" required defaultValue="08:00" className={`${inputClass} w-auto`} aria-label="Heure du rappel" />
            </>
          )}
          <button type="submit" disabled={add.pending} className={buttonClass.primary}>
            Ajouter
          </button>
          {!startOpen && (
            <button type="button" onClick={() => setOpen(false)} className={buttonClass.ghost}>
              Annuler
            </button>
          )}
          <div className="w-full">
            <ActionMessage result={add.result} showSuccess={false} />
          </div>
        </form>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className={`${buttonClass.ghost} self-start`}>
          🔔 + Rappel
        </button>
      )}
    </div>
  );
}
