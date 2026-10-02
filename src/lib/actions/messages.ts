"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { firstError, idSchema } from "@/lib/validation";
import { actionContext, dbFail, fail, ok, type ActionResult } from "./context";

const bodySchema = z.string().trim().min(1, "Le message est vide.").max(2000, "2000 caractères maximum.");

/** Envoie un message dans la discussion d'un projet. Le RLS vérifie que le projet m'est visible. */
export async function sendProjectMessage(listId: string, body: string): Promise<ActionResult> {
  const { supabase } = await actionContext();
  if (!idSchema.safeParse(listId).success) return fail("Projet invalide.");
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return fail(firstError(parsed.error));
  const { error } = await supabase.from("project_messages").insert({ list_id: listId, body: parsed.data });
  if (error) return dbFail(error, "sendProjectMessage");
  refresh();
  return ok();
}

/** Supprime un de mes messages (0 ligne = pas le mien : refusé par le RLS). */
export async function deleteProjectMessage(id: string): Promise<ActionResult> {
  const { supabase } = await actionContext();
  if (!idSchema.safeParse(id).success) return fail("Message invalide.");
  const { data, error } = await supabase.from("project_messages").delete().eq("id", id).select("id");
  if (error) return dbFail(error, "deleteProjectMessage");
  if (!data?.length) return fail("Tu ne peux supprimer que tes messages.");
  refresh();
  return ok();
}
