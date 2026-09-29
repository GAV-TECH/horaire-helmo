"use server";

import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { firstError, idSchema } from "@/lib/validation";
import { actionContext, dbFail, fail, ok, type ActionResult } from "./context";

/*
 * Les opérations sur les groupes passent par des fonctions SQL (RPC) qui vérifient
 * elles-mêmes les droits (admin, membre…). Leurs messages d'erreur (codes P0001/P0002,
 * levés par "raise exception") sont écrits pour l'utilisateur : on peut les afficher.
 */
function rpcFail(error: { code?: string; message: string }, context: string): ActionResult {
  if (error.code === "P0001" || error.code === "P0002") return fail(error.message);
  return dbFail(error, context);
}

/**
 * La liste de mes groupes est chargée par le layout, que Next.js ne recharge pas lors d'une
 * redirection. Après avoir créé, rejoint, quitté ou supprimé un groupe, on l'invalide
 * (type "layout" = le layout racine et toutes les pages en dessous).
 */
function revalidateAll() {
  revalidatePath("/", "layout");
}

const nameSchema =z.string().trim().min(1, "Le nom est obligatoire.").max(80, "80 caractères maximum.");
const codeSchema = z.string().trim().min(6, "Code trop court.").max(40);

export async function createGroup(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { supabase } = await actionContext();
  const name = nameSchema.safeParse(formData.get("name"));
  if (!name.success) return fail(firstError(name.error));
  const { data, error } = await supabase.rpc("create_group", { group_name: name.data });
  if (error) return rpcFail(error, "createGroup");
  revalidateAll();
  redirect(`/groupes/${data}`);
}

export async function joinGroup(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { supabase } = await actionContext();
  const code = codeSchema.safeParse(formData.get("code"));
  if (!code.success) return fail(firstError(code.error));
  const { data, error } = await supabase.rpc("join_group", { code: code.data });
  if (error) return rpcFail(error, "joinGroup");
  revalidateAll();
  redirect(`/groupes/${data}`);
}

export async function leaveGroup(groupId: string): Promise<ActionResult> {
  const { supabase } = await actionContext();
  if (!idSchema.safeParse(groupId).success) return fail("Groupe invalide.");
  const { error } = await supabase.rpc("leave_group", { gid: groupId });
  if (error) return rpcFail(error, "leaveGroup");
  revalidateAll();
  redirect("/groupes");
}

export async function removeMember(groupId: string, userId: string): Promise<ActionResult> {
  const { supabase } = await actionContext();
  if (!idSchema.safeParse(groupId).success || !idSchema.safeParse(userId).success) return fail("Données invalides.");
  const { error } = await supabase.rpc("remove_group_member", { gid: groupId, member: userId });
  if (error) return rpcFail(error, "removeMember");
  refresh();
  return ok();
}

export async function setMemberRole(groupId: string, userId: string, role: "admin" | "member"): Promise<ActionResult> {
  const { supabase } = await actionContext();
  if (!idSchema.safeParse(groupId).success || !idSchema.safeParse(userId).success) return fail("Données invalides.");
  if (role !== "admin" && role !== "member") return fail("Rôle invalide.");
  const { error } = await supabase.rpc("set_group_member_role", { gid: groupId, member: userId, new_role: role });
  if (error) return rpcFail(error, "setMemberRole");
  refresh();
  return ok();
}

export async function regenerateInviteCode(groupId: string): Promise<ActionResult> {
  const { supabase } = await actionContext();
  if (!idSchema.safeParse(groupId).success) return fail("Groupe invalide.");
  const { error } = await supabase.rpc("regenerate_invite_code", { gid: groupId });
  if (error) return rpcFail(error, "regenerateInviteCode");
  refresh();
  return ok("Nouveau code créé : l'ancien ne fonctionne plus.");
}

export async function renameGroup(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { supabase } = await actionContext();
  const id = idSchema.safeParse(formData.get("id"));
  const name = nameSchema.safeParse(formData.get("name"));
  if (!id.success) return fail("Groupe invalide.");
  if (!name.success) return fail(firstError(name.error));
  // Le RLS n'autorise la modification qu'aux admins : 0 ligne modifiée sinon.
  const { data, error } = await supabase.from("groups").update({ name: name.data }).eq("id", id.data).select("id");
  if (error) return dbFail(error, "renameGroup");
  if (!data?.length) return fail("Réservé aux administrateurs du groupe.");
  refresh();
  return ok("Groupe renommé.");
}

export async function deleteGroup(groupId: string): Promise<ActionResult> {
  const { supabase } = await actionContext();
  if (!idSchema.safeParse(groupId).success) return fail("Groupe invalide.");
  const { data, error } = await supabase.from("groups").delete().eq("id", groupId).select("id");
  if (error) return dbFail(error, "deleteGroup");
  if (!data?.length) return fail("Réservé aux administrateurs du groupe.");
  revalidateAll();
  redirect("/groupes");
}
