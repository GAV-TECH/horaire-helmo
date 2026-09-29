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
    // .select() : on récupère les lignes modifiées ; 0 ligne = le RLS a refusé (ni auteur, ni admin).
    const { data, error } = await supabase.from("deadlines").update(parsed.data).eq("id", id.data).select("id");
    if (error) return dbFail(error, "updateDeadline");
    if (!data?.length) return fail("Seuls l'auteur et les admins du groupe peuvent modifier cette deadline.");
  } else {
    const { error } = await supabase.from("deadlines").insert(parsed.data);
    if (error) return dbFail(error, "createDeadline");
  }
  refresh();
  return ok(rawId ? "Deadline modifiée." : "Deadline ajoutée.");
}

/** Terminée / pas terminée POUR MOI (chaque membre d'un groupe coche pour lui-même). */
export async function setDeadlineDone(id: string, done: boolean): Promise<ActionResult> {
  const { user, supabase } = await actionContext();
  if (!idSchema.safeParse(id).success) return fail("Deadline invalide.");
  const { error } = done
    ? await supabase
        .from("deadline_completions")
        .upsert({ deadline_id: id }, { onConflict: "deadline_id,user_id", ignoreDuplicates: true })
    : await supabase.from("deadline_completions").delete().eq("deadline_id", id).eq("user_id", user.id);
  if (error) return dbFail(error, "setDeadlineDone");
  refresh();
  return ok();
}

export async function deleteDeadline(id: string): Promise<ActionResult> {
  const { supabase } = await actionContext();
  if (!idSchema.safeParse(id).success) return fail("Deadline invalide.");
  const { data, error } = await supabase.from("deadlines").delete().eq("id", id).select("id");
  if (error) return dbFail(error, "deleteDeadline");
  if (!data?.length) return fail("Seuls l'auteur et les admins du groupe peuvent supprimer cette deadline.");
  refresh();
  return ok();
}
