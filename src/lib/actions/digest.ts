"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { actionContext, dbFail, fail, ok, type ActionResult } from "./context";

const settingsSchema = z.object({
  enabled: z.boolean(),
  hour: z.number().int().min(0).max(23),
});

/** Débrief quotidien : activé ou non, et heure d'envoi (heure de Bruxelles). */
export async function saveDigestSettings(enabled: boolean, hour: number): Promise<ActionResult> {
  const { user, supabase } = await actionContext();
  const parsed = settingsSchema.safeParse({ enabled, hour });
  if (!parsed.success) return fail("Réglage invalide.");
  const { error } = await supabase.from("user_settings").upsert(
    { user_id: user.id, digest_enabled: parsed.data.enabled, digest_hour: parsed.data.hour, updated_at: new Date().toISOString() },
    { onConflict: "user_id" },
  );
  if (error) return dbFail(error, "saveDigestSettings");
  refresh();
  return ok(parsed.data.enabled ? `Débrief activé, chaque jour à ${parsed.data.hour} h.` : "Débrief désactivé.");
}
