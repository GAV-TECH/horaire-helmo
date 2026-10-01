"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { courseKey } from "@/lib/courses";
import { MANUAL_PREFIX } from "@/lib/sessions/manual";
import { createAdminClient } from "@/lib/supabase/admin";
import { brusselsToIso } from "@/lib/time";
import { firstError, idSchema } from "@/lib/validation";
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

const manualSchema = z
  .object({
    title: z.string().trim().min(1, "Le titre est obligatoire.").max(200, "200 caractères maximum."),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide."),
    start: z.string().regex(/^\d{2}:\d{2}$/, "Heure de début invalide."),
    end: z.string().regex(/^\d{2}:\d{2}$/, "Heure de fin invalide."),
    location: z.string().trim().max(100, "100 caractères maximum.").optional(),
  })
  .refine((d) => d.end > d.start, "La fin doit être après le début.");

/**
 * Ajoute une plage horaire personnelle (sport, job, rendez-vous…). Les utilisateurs n'ont pas le
 * droit d'écrire dans `sessions` (seule la synchro le fait) : on passe par le client admin, en
 * forçant user_id et la clé "perso:" — la synchro ignore ces lignes (diffSessions).
 */
export async function addManualSession(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { user } = await actionContext();
  const parsed = manualSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(firstError(parsed.error));
  const { title, date, start, end, location } = parsed.data;
  const key = `${MANUAL_PREFIX}${crypto.randomUUID()}`;
  const { error } = await createAdminClient().from("sessions").insert({
    user_id: user.id,
    key,
    uid: key,
    title,
    course_key: courseKey(title),
    location: location || null,
    start_at: brusselsToIso(date, start),
    end_at: brusselsToIso(date, end),
  });
  if (error) return dbFail(error, "addManualSession");
  refresh();
  return ok("Plage ajoutée.");
}

/** Supprime une plage personnelle (jamais une séance HELMO : filtre sur la clé "perso:"). */
export async function deleteManualSession(id: string): Promise<ActionResult> {
  const { user } = await actionContext();
  if (!idSchema.safeParse(id).success) return fail("Plage invalide.");
  const { data, error } = await createAdminClient().from("sessions").delete().eq("id", id).eq("user_id", user.id).like("key", `${MANUAL_PREFIX}%`).select("id");
  if (error) return dbFail(error, "deleteManualSession");
  if (!data?.length) return fail("Seules les plages ajoutées à la main peuvent être supprimées.");
  refresh();
  return ok();
}
