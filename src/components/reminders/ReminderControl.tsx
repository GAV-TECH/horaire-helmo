"use client";

import { useState, useTransition } from "react";
import { createReminder, deleteReminder, setReminderMuted } from "@/lib/actions/reminders";
import type { ReminderTarget } from "@/lib/data/types";
import { canEdit } from "@/lib/groups";
import { REMINDER_PRESETS, describeReminder, reminderStatus } from "@/lib/reminders";
import { useGroups } from "@/components/groups/GroupsContext";
import { ActionMessage, ErrorText, buttonClass, inputClass, useFormAction } from "@/components/ui";
import { useTargetReminders } from "./RemindersContext";

type Props = {
  targetType: ReminderTarget;
  targetId: string;
  /** Faux pour une tâche sans échéance : seuls les rappels à date précise ont alors un sens. */
  hasTime: boolean;
  /** Ouvre directement le formulaire (sinon, bouton "+ Rappel"). */
  startOpen?: boolean;
  /** Groupe avec lequel la cible est partagée : permet un rappel "pour tout le groupe". */
  groupId?: string | null;
};

/** Rappels d'un élément : liste (suppression, "couper pour moi") + formulaire d'ajout. */
export function ReminderControl({ targetType, targetId, hasTime, startOpen = false, groupId = null }: Props) {
  const { reminders, now } = useTargetReminders(targetType, targetId);
  const { me, groups } = useGroups();
  const groupName = groups.find((g) => g.id === groupId)?.name;
  const [open, setOpen] = useState(startOpen);
  const [preset, setPreset] = useState<string>(hasTime ? "1h" : "custom");
  const add = useFormAction(createReminder, { onSuccess: () => setOpen(startOpen) });
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      const r = await fn();
      setError(r.ok ? null : (r.error ?? "Erreur."));
    });

  return (
    <div className="flex flex-col gap-1.5">
      {reminders.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {reminders.map((r) => {
            const status = reminderStatus(r, now);
            const label = describeReminder(r);
            return (
              <li
                key={r.id}
                className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
                  status === "pending" && !r.muted
                    ? "border-blue-300 text-blue-700 dark:border-blue-800 dark:text-blue-300"
                    : "border-zinc-300 text-zinc-400 dark:border-zinc-700"
                }`}
              >
                {r.groupId ? "👥" : "🔔"} {label}
                {r.groupId && " · groupe"}
                {r.muted && " · coupé pour moi"}
                {status === "sent" && " · envoyé"}
                {status === "skipped" && " · non envoyé (fait / annulé)"}
                {r.groupId && status === "pending" && (
                  <button type="button" disabled={pending} onClick={() => run(() => setReminderMuted(r.id, !r.muted))} className="ml-0.5 underline">
                    {r.muted ? "réactiver" : "couper pour moi"}
                  </button>
                )}
                {canEdit(r, me, groups) && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => deleteReminder(r.id))}
                    className="ml-0.5 hover:text-red-600"
                    aria-label={`Supprimer le rappel ${label}`}
                  >
                    ✕
                  </button>
                )}
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
          {groupName && (
            <label className="flex items-center gap-1 text-xs">
              <input type="checkbox" name="forGroup" value="1" className="accent-violet-600" />
              pour tout « {groupName} »
            </label>
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
