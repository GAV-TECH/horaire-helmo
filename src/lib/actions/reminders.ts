"use server";

import { refresh } from "next/cache";
import { computeFireAt, reminderSchema } from "@/lib/reminders";
import { firstError, idSchema } from "@/lib/validation";
import { actionContext, dbFail, fail, ok, type ActionResult } from "./context";

/** Table, colonne d'heure et moyen de retrouver le groupe de chaque type de cible. */
const TARGETS = {
  session: { table: "sessions", column: "session_id", select: "start_at", time: "start_at" },
  deadline: { table: "deadlines", column: "deadline_id", select: "due_at, group_id", time: "due_at" },
  todo: { table: "todo_items", column: "todo_item_id", select: "due_at, todo_lists(group_id)", time: "due_at" },
} as const;

type TargetRow = { start_at?: string; due_at?: string | null; group_id?: string | null; todo_lists?: { group_id: string | null } | null };

export async function createReminder(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { supabase } = await actionContext();
  const parsed = reminderSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(firstError(parsed.error));
  const { targetType, targetId, offset_minutes, remind_at } = parsed.data;
  const target = TARGETS[targetType];

  // Lecture de la cible via le RLS : si l'utilisateur ne peut pas la voir, on ne la trouve pas.
  const { data: row, error: readError } = await supabase
    .from(target.table)
    .select(target.select)
    .eq("id", targetId)
    .maybeSingle<TargetRow>();
  if (readError) return dbFail(readError, "createReminder.target");
  if (!row) return fail("Élément introuvable.");

  const targetAt = (targetType === "session" ? row.start_at : row.due_at) ?? null;
  const fireAt = computeFireAt(offset_minutes, remind_at, targetAt);
  if (!fireAt) return fail("Cet élément n'a pas d'échéance : choisis une date précise.");
  if (Date.parse(fireAt) <= Date.now()) return fail("Ce moment est déjà passé : choisis un rappel plus proche ou une date précise.");

  // "Pour tout le groupe" : uniquement si la cible est elle-même partagée avec un groupe.
  let groupId: string | null = null;
  if (formData.get("forGroup") === "1") {
    groupId = row.group_id ?? row.todo_lists?.group_id ?? null;
    if (!groupId) return fail("Seul un élément partagé avec un groupe peut avoir un rappel pour tout le groupe.");
  }

  const { error } = await supabase
    .from("reminders")
    .insert({ [target.column]: targetId, offset_minutes, remind_at, group_id: groupId });
  if (error) return dbFail(error, "createReminder");
  refresh();
  return ok(groupId ? "Rappel ajouté pour tout le groupe." : "Rappel ajouté.");
}

export async function deleteReminder(id: string): Promise<ActionResult> {
  const { supabase } = await actionContext();
  if (!idSchema.safeParse(id).success) return fail("Rappel invalide.");
  const { data, error } = await supabase.from("reminders").delete().eq("id", id).select("id");
  if (error) return dbFail(error, "deleteReminder");
  if (!data?.length) return fail("Seuls l'auteur et les admins du groupe peuvent supprimer ce rappel. Tu peux le couper pour toi.");
  refresh();
  return ok();
}

/** Coupe (ou réactive) un rappel partagé POUR MOI SEULEMENT. */
export async function setReminderMuted(id: string, muted: boolean): Promise<ActionResult> {
  const { user, supabase } = await actionContext();
  if (!idSchema.safeParse(id).success) return fail("Rappel invalide.");
  const { error } = muted
    ? await supabase.from("reminder_mutes").upsert({ reminder_id: id }, { onConflict: "reminder_id,user_id", ignoreDuplicates: true })
    : await supabase.from("reminder_mutes").delete().eq("reminder_id", id).eq("user_id", user.id);
  if (error) return dbFail(error, "setReminderMuted");
  refresh();
  return ok();
}
