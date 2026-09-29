"use server";

import { refresh } from "next/cache";
import { deadlineSchema, firstError, idSchema } from "@/lib/validation";
import { actionContext, dbFail, fail, ok, type ActionResult } from "./context";

/** Crée une deadline, ou la modifie si le formulaire contient un champ "id". */
export async function saveDeadline(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { supabase } = await actionContext();
  const parsed = deadlineSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(firstError(parsed.error));

  const rawId = formData.get("id");
  if (rawId) {
    const id = idSchema.safeParse(rawId);
    if (!id.success) return fail("Deadline invalide.");
    const { error } = await supabase.from("deadlines").update(parsed.data).eq("id", id.data);
    if (error) return dbFail(error, "updateDeadline");
  } else {
    const { error } = await supabase.from("deadlines").insert(parsed.data);
    if (error) return dbFail(error, "createDeadline");
  }
  refresh();
  return ok(rawId ? "Deadline modifiée." : "Deadline ajoutée.");
}

export async function setDeadlineDone(id: string, done: boolean): Promise<ActionResult> {
  const { supabase } = await actionContext();
  if (!idSchema.safeParse(id).success) return fail("Deadline invalide.");
  const { error } = await supabase
    .from("deadlines")
    .update({ done_at: done ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) return dbFail(error, "setDeadlineDone");
  refresh();
  return ok();
}

export async function deleteDeadline(id: string): Promise<ActionResult> {
  const { supabase } = await actionContext();
  if (!idSchema.safeParse(id).success) return fail("Deadline invalide.");
  const { error } = await supabase.from("deadlines").delete().eq("id", id);
  if (error) return dbFail(error, "deleteDeadline");
  refresh();
  return ok();
}
