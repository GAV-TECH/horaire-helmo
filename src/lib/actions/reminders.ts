"use server";

import { refresh } from "next/cache";
import { computeFireAt, reminderSchema } from "@/lib/reminders";
import { firstError, idSchema } from "@/lib/validation";
import { actionContext, dbFail, fail, ok, type ActionResult } from "./context";

/** Table et colonne d'heure de chaque type de cible. */
const TARGETS = {
  session: { table: "sessions", column: "session_id", timeColumn: "start_at" },
  deadline: { table: "deadlines", column: "deadline_id", timeColumn: "due_at" },
  todo: { table: "todo_items", column: "todo_item_id", timeColumn: "due_at" },
} as const;

export async function createReminder(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { supabase } = await actionContext();
  const parsed = reminderSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(firstError(parsed.error));
  const { targetType, targetId, offset_minutes, remind_at } = parsed.data;
  const target = TARGETS[targetType];

  // Lecture de la cible via le RLS : si elle n'appartient pas à l'utilisateur, on ne la trouve pas.
  const { data: row, error: readError } = await supabase
    .from(target.table)
    .select(target.timeColumn)
    .eq("id", targetId)
    .maybeSingle<Record<string, string | null>>();
  if (readError) return dbFail(readError, "createReminder.target");
  if (!row) return fail("Élément introuvable.");

  const fireAt = computeFireAt(offset_minutes, remind_at, row[target.timeColumn] ?? null);
  if (!fireAt) return fail("Cet élément n'a pas d'échéance : choisis une date précise.");
  if (Date.parse(fireAt) <= Date.now()) return fail("Ce moment est déjà passé : choisis un rappel plus proche ou une date précise.");

  const { error } = await supabase.from("reminders").insert({ [target.column]: targetId, offset_minutes, remind_at });
  if (error) return dbFail(error, "createReminder");
  refresh();
  return ok("Rappel ajouté.");
}

export async function deleteReminder(id: string): Promise<ActionResult> {
  const { supabase } = await actionContext();
  if (!idSchema.safeParse(id).success) return fail("Rappel invalide.");
  const { error } = await supabase.from("reminders").delete().eq("id", id);
  if (error) return dbFail(error, "deleteReminder");
  refresh();
  return ok();
}
