"use server";

import { refresh, revalidatePath } from "next/cache";
import { z } from "zod";
import type { StudentHit } from "@/lib/data/types";
import { idSchema } from "@/lib/validation";
import { actionContext, dbFail, fail, ok, type ActionResult } from "./context";

/*
 * Partage de tâches d'étudiant à étudiant (table task_shares, migration 0007) :
 * je cherche un étudiant, je lui envoie une demande, il accepte ou refuse. Les droits
 * sont vérifiés par le RLS et par les fonctions SQL ; ici on valide et on traduit.
 */

/** Les partages sont chargés par le layout (bandeau des demandes) : on l'invalide. */
const revalidateShares = () => revalidatePath("/", "layout");

const querySchema = z.string().trim().min(3).max(60);

/** Recherche d'étudiants par nom ou début d'adresse (3 caractères minimum). */
export async function searchStudents(q: string): Promise<{ ok: true; students: StudentHit[] } | { ok: false; error: string }> {
  const { supabase } = await actionContext();
  const parsed = querySchema.safeParse(q);
  if (!parsed.success) return { ok: false, error: "Tape au moins 3 lettres du nom." };
  const { data, error } = await supabase.rpc("find_students", { q: parsed.data });
  if (error) {
    console.error("[action:searchStudents]", error);
    return { ok: false, error: "La recherche a échoué. La migration 0007 a-t-elle été exécutée ?" };
  }
  return {
    ok: true,
    students: ((data ?? []) as { id: string; display_name: string; email_hint: string }[]).map((s) => ({
      id: s.id,
      displayName: s.display_name,
      emailHint: s.email_hint,
    })),
  };
}

/** Envoie une demande de partage : une liste précise, ou toutes mes tâches (listId vide). */
export async function requestTaskShare(recipientId: string, listId: string): Promise<ActionResult> {
  const { user, supabase } = await actionContext();
  if (!idSchema.safeParse(recipientId).success) return fail("Étudiant invalide.");
  if (recipientId === user.id) return fail("Tu ne peux pas partager avec toi-même.");
  if (listId && !idSchema.safeParse(listId).success) return fail("Liste invalide.");

  // Ce que verra le destinataire AVANT d'accepter (il n'a pas encore accès à la liste).
  let label = "toutes ses tâches";
  if (listId) {
    const { data: list } = await supabase.from("todo_lists").select("title").eq("id", listId).eq("user_id", user.id).maybeSingle();
    if (!list) return fail("Seul le propriétaire de la liste peut la partager.");
    label = `la liste « ${list.title as string} »`;
  }

  const { error } = await supabase.from("task_shares").insert({ recipient_id: recipientId, list_id: listId || null, label });
  if (error?.code === "23505") return fail("Une demande existe déjà pour cet étudiant.");
  if (error) return dbFail(error, "requestTaskShare");
  revalidateShares();
  return ok("Demande envoyée : le partage commencera quand l'étudiant l'aura acceptée.");
}

/** Le destinataire accepte (le partage commence) ou refuse (la demande est supprimée). */
export async function respondTaskShare(shareId: string, accept: boolean): Promise<ActionResult> {
  const { supabase } = await actionContext();
  if (!idSchema.safeParse(shareId).success) return fail("Demande invalide.");
  const { error } = await supabase.rpc("respond_task_share", { share: shareId, accept: accept === true });
  if (error?.code === "P0001") return fail(error.message);
  if (error) return dbFail(error, "respondTaskShare");
  revalidateShares();
  refresh();
  return ok(accept ? "Partage accepté : ses tâches sont dans ta page Tâches." : "Demande refusée.");
}

/** Annuler une demande, arrêter un partage (propriétaire) ou le quitter (destinataire). */
export async function removeTaskShare(shareId: string): Promise<ActionResult> {
  const { supabase } = await actionContext();
  if (!idSchema.safeParse(shareId).success) return fail("Partage invalide.");
  const { data, error } = await supabase.from("task_shares").delete().eq("id", shareId).select("id");
  if (error) return dbFail(error, "removeTaskShare");
  if (!data?.length) return fail("Partage introuvable.");
  revalidateShares();
  return ok("Partage arrêté.");
}
