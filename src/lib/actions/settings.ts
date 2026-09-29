"use server";

import { refresh } from "next/cache";
import { encryptSecret } from "@/lib/crypto";
import { serverEnv } from "@/lib/env";
import { icsUrlSchema } from "@/lib/ics/fetch";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncSchedule } from "@/lib/sync";
import { displayNameSchema, firstError, isAllowedIcsUrl } from "@/lib/validation";
import { actionContext, dbFail, fail, ok, type ActionResult } from "./context";

/** Enregistre (ou remplace) le lien .ics, chiffré, puis lance une première synchro. */
export async function saveIcsUrl(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { user } = await actionContext();
  const env = serverEnv();

  const url = icsUrlSchema.safeParse(String(formData.get("url") ?? "").trim());
  if (!url.success) return fail(firstError(url.error));
  if (!isAllowedIcsUrl(url.data, env.ICS_ALLOWED_HOSTS)) {
    return fail(`Seuls les liens ${env.ICS_ALLOWED_HOSTS.join(", ")} sont acceptés.`);
  }

  const admin = createAdminClient();
  const { error } = await admin.from("ics_sources").upsert({
    user_id: user.id,
    url_encrypted: encryptSecret(url.data, env.ICS_ENCRYPTION_KEY),
    updated_at: new Date().toISOString(),
    last_synced_at: null, // force une synchro immédiate
    last_error: null,
  });
  if (error) return dbFail(error, "saveIcsUrl");

  const result = await syncSchedule(user.id, { force: true });
  refresh();
  if (result.status === "error") return fail(`Lien enregistré, mais la synchro a échoué : ${result.error}`);
  return ok("Lien enregistré et horaire importé.");
}

/** Supprime le lien et les séances importées. Les notes restent (elles deviennent orphelines). */
export async function deleteIcsSource(): Promise<ActionResult> {
  const { user } = await actionContext();
  const admin = createAdminClient();
  const { error } = await admin.from("ics_sources").delete().eq("user_id", user.id);
  if (error) return dbFail(error, "deleteIcsSource");
  const { error: sessionsError } = await admin.from("sessions").delete().eq("user_id", user.id);
  if (sessionsError) return dbFail(sessionsError, "deleteIcsSource.sessions");
  refresh();
  return ok("Lien et séances supprimés.");
}

export async function saveDisplayName(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { user, supabase } = await actionContext();
  const name = displayNameSchema.safeParse(formData.get("displayName"));
  if (!name.success) return fail(firstError(name.error));
  const { error } = await supabase.from("profiles").update({ display_name: name.data }).eq("id", user.id);
  if (error) return dbFail(error, "saveDisplayName");
  refresh();
  return ok("Nom enregistré.");
}
