"use server";

import { refresh } from "next/cache";
import { idSchema } from "@/lib/validation";
import { actionContext, dbFail, fail, ok, type ActionResult } from "./context";

/** Marque les changements d'une séance (ou de toutes si id absent) comme vus : le badge disparaît. */
export async function markChangesSeen(id?: string): Promise<ActionResult> {
  const { user, supabase } = await actionContext();
  let query = supabase.from("sessions").update({ changes_seen: true }).eq("user_id", user.id).eq("changes_seen", false);
  if (id !== undefined) {
    if (!idSchema.safeParse(id).success) return fail("Séance invalide.");
    query = query.eq("id", id);
  }
  const { error } = await query;
  if (error) return dbFail(error, "markChangesSeen");
  refresh();
  return ok();
}
