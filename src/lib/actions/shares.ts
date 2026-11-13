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

const querySchema = z.string().trim().min(2).max(60);

/** Recherche d'étudiants par nom ou début d'adresse (2 caractères minimum). */
export async function searchStudents(q: string): Promise<{ ok: true; students: StudentHit[] } | { ok: false; error: string }> {
  const { supabase } = await actionContext();
  const parsed = querySchema.safeParse(q);
  if (!parsed.success) return { ok: false, error: "Tape au moins 2 lettres du nom." };
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

/*
 * Copie d'une tâche envoyée à un étudiant (table task_offers, migration 0015). Contrairement au
 * partage, il reçoit SA propre tâche, indépendante : il l'ajoute à ses tâches ou la refuse.
 */

/** Propose à un étudiant une copie d'une de mes tâches (ou d'une tâche partagée avec moi). */
export async function sendTaskCopy(itemId: string, recipientId: string): Promise<ActionResult> {
  const { user, supabase } = await actionContext();
  if (!idSchema.safeParse(itemId).success) return fail("Tâche invalide.");
  if (!idSchema.safeParse(recipientId).success) return fail("Étudiant invalide.");
  if (recipientId === user.id) return fail("Tu ne peux pas t'envoyer une tâche à toi-même.");

  // Le RLS ne renvoie la tâche que si elle m'est visible. On relit titre et date côté serveur :
  // le navigateur n'envoie que des identifiants.
  const { data: item } = await supabase.from("todo_items").select("title, due_at, todo_lists(title, scope, session_start)").eq("id", itemId).maybeSingle();
  if (!item) return fail("Tâche introuvable.");
  const list = item.todo_lists as unknown as { title: string; scope: string; session_start: string | null } | null;
  const { error } = await supabase.from("task_offers").insert({
    recipient_id: recipientId,
    title: item.title,
    // Tâche de séance sans échéance : la copie prend la date de la séance (comme dans la page Tâches).
    due_at: item.due_at ?? (list?.scope === "session" ? list.session_start : null),
    context: list?.title?.slice(0, 300) ?? null,
  });
  if (error?.code === "P0001") return fail(error.message); // message du garde-fou anti-spam
  if (error) return dbFail(error, "sendTaskCopy");
  revalidateShares();
  return ok("Copie envoyée : il la verra en ouvrant l'app et pourra l'ajouter à ses tâches.");
}

/** Le destinataire ajoute la copie à sa liste « Tâches » (fonction SQL : copie + suppression de la proposition). */
export async function acceptTaskOffer(offerId: string): Promise<ActionResult> {
  const { supabase } = await actionContext();
  if (!idSchema.safeParse(offerId).success) return fail("Proposition invalide.");
  const { error } = await supabase.rpc("accept_task_offer", { offer: offerId });
  if (error?.code === "P0001") return fail(error.message);
  if (error) return dbFail(error, "acceptTaskOffer");
  revalidateShares();
  return ok("Tâche ajoutée à ta liste « Tâches ».");
}

/** Refuser une copie reçue, ou annuler une copie envoyée. */
export async function removeTaskOffer(offerId: string): Promise<ActionResult> {
  const { supabase } = await actionContext();
  if (!idSchema.safeParse(offerId).success) return fail("Proposition invalide.");
  const { error } = await supabase.from("task_offers").delete().eq("id", offerId);
  if (error) return dbFail(error, "removeTaskOffer");
  revalidateShares();
  return ok();
}

/*
 * Partager UNE tâche avec un étudiant (table todo_item_assignees, migration 0020) : c'est la
 * même tâche, chacun la coche pour lui, et elle affiche « 1/2 ». Pas d'accord à donner : il
 * la voit tout de suite et peut se retirer.
 */

/** Confie une tâche que je vois (dans une de mes listes ou une liste partagée avec moi) à un étudiant. */
export async function assignTask(itemId: string, studentId: string): Promise<ActionResult> {
  const { user, supabase } = await actionContext();
  if (!idSchema.safeParse(itemId).success) return fail("Tâche invalide.");
  if (!idSchema.safeParse(studentId).success) return fail("Étudiant invalide.");
  if (studentId === user.id) return fail("Tu participes déjà à cette tâche.");
  const { error } = await supabase.from("todo_item_assignees").insert({ item_id: itemId, user_id: studentId });
  if (error?.code === "23505") return fail("Cette tâche est déjà partagée avec cet étudiant.");
  if (error?.code === "P0001") return fail(error.message); // garde-fou : 10 étudiants maximum
  if (error?.code === "42501") return fail("Seuls ceux qui voient la liste de la tâche peuvent la partager.");
  if (error?.code === "42P01") return fail("Le partage d'une tâche demande la migration 0020.");
  if (error) return dbFail(error, "assignTask");
  refresh();
  return ok("Tâche partagée : elle apparaît dans ses tâches.");
}

/** Retire un étudiant d'une tâche (ou me retire moi-même d'une tâche qu'on m'a confiée). */
export async function unassignTask(itemId: string, studentId: string): Promise<ActionResult> {
  const { supabase } = await actionContext();
  if (!idSchema.safeParse(itemId).success || !idSchema.safeParse(studentId).success) return fail("Partage invalide.");
  const { data, error } = await supabase.from("todo_item_assignees").delete().eq("item_id", itemId).eq("user_id", studentId).select("item_id");
  if (error) return dbFail(error, "unassignTask");
  if (!data?.length) return fail("Tu ne peux pas retirer cet étudiant.");
  refresh();
  return ok();
}
