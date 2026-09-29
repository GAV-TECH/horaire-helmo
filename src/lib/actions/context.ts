import "server-only";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/** Résultat renvoyé par les server actions au composant qui les appelle. */
export type ActionResult = { ok: true; message?: string; id?: string } | { ok: false; error: string };

export const fail = (error: string): ActionResult => ({ ok: false, error });
export const ok = (message?: string): ActionResult => ({ ok: true, message });

/**
 * Une server action est une route POST publique : n'importe qui peut l'appeler directement.
 * Chaque action commence donc par vérifier qui appelle.
 */
export async function actionContext() {
  const user = await getUser();
  if (!user) throw new Error("Non connecté.");
  return { user, supabase: await createClient() };
}

/** Message générique pour les erreurs de base : on ne renvoie pas le détail technique au navigateur. */
export function dbFail(error: unknown, context: string): ActionResult {
  console.error(`[action:${context}]`, error);
  return fail("L'enregistrement a échoué. Réessaie.");
}
