"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { firstError, idSchema } from "@/lib/validation";
import { actionContext, dbFail, fail, ok, type ActionResult } from "./context";

const linkSchema = z.object({
  listId: idSchema,
  title: z.string().trim().min(1, "Le nom est obligatoire.").max(120, "120 caractères maximum."),
  // http(s) uniquement : un lien "javascript:" serait exécuté chez les autres membres au clic.
  url: z
    .string()
    .trim()
    .max(2000, "Lien trop long.")
    .refine((u) => {
      try {
        return ["http:", "https:"].includes(new URL(u).protocol);
      } catch {
        return false;
      }
    }, "Lien invalide : il doit commencer par https://"),
});

/** Ajoute un document (lien) à un projet. Le RLS vérifie que le projet m'est visible. */
export async function addProjectLink(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { supabase } = await actionContext();
  const parsed = linkSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(firstError(parsed.error));
  const { error } = await supabase.from("project_links").insert({ list_id: parsed.data.listId, title: parsed.data.title, url: parsed.data.url });
  if (error) return dbFail(error, "addProjectLink");
  refresh();
  return ok();
}

/** Retire un lien : celui qui l'a ajouté, ou le propriétaire du projet (0 ligne = refusé par le RLS). */
export async function deleteProjectLink(id: string): Promise<ActionResult> {
  const { supabase } = await actionContext();
  if (!idSchema.safeParse(id).success) return fail("Document invalide.");
  const { data, error } = await supabase.from("project_links").delete().eq("id", id).select("id");
  if (error) return dbFail(error, "deleteProjectLink");
  if (!data?.length) return fail("Seuls celui qui a ajouté le lien et le propriétaire du projet peuvent le retirer.");
  refresh();
  return ok();
}
