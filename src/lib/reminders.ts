import { z } from "zod";
import type { Reminder } from "@/lib/data/types";
import { brusselsToIso, formatFr } from "@/lib/time";

/** Rappels prédéfinis, relatifs à l'heure de la cible. */
export const REMINDER_PRESETS = [
  { id: "15m", label: "15 min avant", minutes: 15 },
  { id: "1h", label: "1 h avant", minutes: 60 },
  { id: "1d", label: "1 jour avant", minutes: 24 * 60 },
] as const;

export const reminderSchema = z
  .object({
    targetType: z.enum(["session", "deadline", "todo"]),
    targetId: z.uuid(),
    preset: z.enum(["15m", "1h", "1d", "custom"]),
    date: z.string().optional(),
    time: z.string().optional(),
  })
  .superRefine((r, ctx) => {
    if (r.preset === "custom" && !(/^\d{4}-\d{2}-\d{2}$/.test(r.date ?? "") && /^\d{2}:\d{2}$/.test(r.time ?? ""))) {
      ctx.addIssue({ code: "custom", message: "Choisis une date et une heure." });
    }
  })
  .transform((r) => ({
    targetType: r.targetType,
    targetId: r.targetId,
    offset_minutes: r.preset === "custom" ? null : REMINDER_PRESETS.find((p) => p.id === r.preset)!.minutes,
    remind_at: r.preset === "custom" ? brusselsToIso(r.date!, r.time!) : null,
  }));

/**
 * Heure à laquelle le rappel partira. Null si impossible à calculer
 * (rappel relatif sur une tâche sans échéance).
 */
export function computeFireAt(offsetMinutes: number | null, remindAt: string | null, targetAt: string | null): string | null {
  if (remindAt) return remindAt;
  if (offsetMinutes === null || !targetAt) return null;
  return new Date(Date.parse(targetAt) - offsetMinutes * 60_000).toISOString();
}

/** "1 h avant" ou "lun. 6 oct. à 08:00". */
export function describeReminder(r: Pick<Reminder, "offsetMinutes" | "remindAt">): string {
  if (r.remindAt) return formatFr(r.remindAt, "EEE d MMM 'à' HH:mm");
  const preset = REMINDER_PRESETS.find((p) => p.minutes === r.offsetMinutes);
  if (preset) return preset.label;
  const minutes = r.offsetMinutes ?? 0;
  return minutes % 60 === 0 ? `${minutes / 60} h avant` : `${minutes} min avant`;
}

/** Statut affiché dans la liste des rappels. */
export function reminderStatus(r: Reminder, now: number): "pending" | "sent" | "skipped" | "late" {
  if (r.sentAt) return r.targetDone ? "skipped" : "sent";
  if (r.targetDone) return "skipped";
  if (r.fireAt && Date.parse(r.fireAt) < now - 5 * 60_000) return "late"; // la tâche planifiée n'est pas passée
  return "pending";
}
