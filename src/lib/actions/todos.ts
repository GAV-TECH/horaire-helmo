"use server";

import { refresh, revalidatePath } from "next/cache";
import { z } from "zod";
import { firstError, idSchema, todoItemSchema, todoListSchema } from "@/lib/validation";
import { tasksShareGroup } from "@/lib/data/task-sharing";
import { actionContext, dbFail, fail, ok, type ActionResult } from "./context";

export async function createTodoList(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { supabase } = await actionContext();
  const parsed = todoListSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(firstError(parsed.error));
  const { data, error } = await supabase.from("todo_lists").insert(parsed.data).select("id").single();
  if (error) return dbFail(error, "createTodoList");
  refresh();
  return { ok: true, message: "Liste créée.", id: data.id as string }; // l'id permet d'ouvrir la nouvelle liste
}

export async function deleteTodoList(id: string): Promise<ActionResult> {
  const { supabase } = await actionContext();
  if (!idSchema.safeParse(id).success) return fail("Liste invalide.");
  // Les tâches suivent (on delete cascade). 0 ligne supprimée = refusé par le RLS.
  const { data, error } = await supabase.from("todo_lists").delete().eq("id", id).select("id");
  if (error) return dbFail(error, "deleteTodoList");
  if (!data?.length) return fail("Seuls l'auteur et les admins du groupe peuvent supprimer cette liste.");
  refresh();
  return ok();
}

export async function addTodoItem(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { supabase } = await actionContext();
  const parsed = todoItemSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(firstError(parsed.error));
  const { error } = await supabase.from("todo_items").insert({ ...parsed.data, position: Date.now() % 2_000_000_000 });
  if (error) return dbFail(error, "addTodoItem");
  refresh();
  return ok();
}

const sessionTaskSchema = z.object({
  title: z.string().trim().min(1, "La tâche est obligatoire.").max(300),
  courseName: z.string().trim().min(1).max(300),
  sessionKey: z.string().min(1).max(1000),
  sessionStart: z.iso.datetime({ offset: true }),
  listTitle: z.string().trim().min(1).max(200),
});

/**
 * Ajoute une tâche à une séance depuis le panneau de détail : la liste de la séance
 * est créée automatiquement la première fois.
 */
export async function addSessionTask(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { user, supabase } = await actionContext();
  const parsed = sessionTaskSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(firstError(parsed.error));
  const { title, courseName, sessionKey, sessionStart, listTitle } = parsed.data;

  const { data: existing } = await supabase
    .from("todo_lists")
    .select("id")
    .eq("user_id", user.id)
    .eq("scope", "session")
    .eq("session_key", sessionKey)
    .limit(1)
    .maybeSingle();

  let listId = existing?.id as string | undefined;
  if (!listId) {
    const list = todoListSchema.parse({ scope: "session", title: listTitle, courseName, sessionKey, sessionStart });
    // Si toutes mes tâches sont partagées, la nouvelle liste de séance l'est aussi.
    const groupId = await tasksShareGroup(supabase, user.id);
    const { data, error } = await supabase.from("todo_lists").insert({ ...list, group_id: groupId }).select("id").single();
    if (error) return dbFail(error, "addSessionTask.list");
    listId = data.id as string;
  }

  const { error } = await supabase.from("todo_items").insert({ list_id: listId, title, position: Date.now() % 2_000_000_000 });
  if (error) return dbFail(error, "addSessionTask.item");
  refresh();
  return ok();
}

/** Coche / décoche une tâche pour l'utilisateur courant (une ligne dans todo_completions = fait). */
export async function setTodoDone(itemId: string, done: boolean): Promise<ActionResult> {
  const { user, supabase } = await actionContext();
  if (!idSchema.safeParse(itemId).success) return fail("Tâche invalide.");
  const { error } = done
    ? await supabase.from("todo_completions").upsert({ item_id: itemId }, { onConflict: "item_id,user_id", ignoreDuplicates: true })
    : await supabase.from("todo_completions").delete().eq("item_id", itemId).eq("user_id", user.id);
  if (error) return dbFail(error, "setTodoDone");
  refresh();
  return ok();
}

export async function deleteTodoItem(id: string): Promise<ActionResult> {
  const { supabase } = await actionContext();
  if (!idSchema.safeParse(id).success) return fail("Tâche invalide.");
  const { data, error } = await supabase.from("todo_items").delete().eq("id", id).select("id");
  if (error) return dbFail(error, "deleteTodoItem");
  if (!data?.length) return fail("Seuls l'auteur de la tâche, le propriétaire de la liste et les admins peuvent la supprimer.");
  refresh();
  return ok();
}

/** Partage une liste avec un groupe, ou la rend privée (groupId vide). Réservé au propriétaire de la liste. */
export async function setListGroup(listId: string, groupId: string): Promise<ActionResult> {
  const { user, supabase } = await actionContext();
  if (!idSchema.safeParse(listId).success) return fail("Liste invalide.");
  if (groupId && !idSchema.safeParse(groupId).success) return fail("Groupe invalide.");
  const { data, error } = await supabase
    .from("todo_lists")
    .update({ group_id: groupId || null })
    .eq("id", listId)
    .eq("user_id", user.id)
    .select("id");
  if (error) return dbFail(error, "setListGroup");
  if (!data?.length) return fail("Seul le propriétaire peut changer le partage.");
  refresh();
  return ok(groupId ? "Liste partagée." : "Liste redevenue privée.");
}

const shareNameSchema = z.string().trim().min(1, "Le nom est obligatoire.").max(80, "80 caractères maximum.");

/**
 * "Partager avec un étudiant" : crée un petit groupe pour cette liste et y range la liste.
 * On réutilise les groupes (droits RLS, temps réel, lien d'invitation) plutôt qu'un 2e système
 * de partage. Renvoie l'id du groupe : son lien d'invitation est ensuite affiché dans le menu.
 */
export async function shareListWithNewGroup(listId: string, name: string): Promise<ActionResult> {
  const { user, supabase } = await actionContext();
  if (!idSchema.safeParse(listId).success) return fail("Liste invalide.");
  const parsed = shareNameSchema.safeParse(name);
  if (!parsed.success) return fail(firstError(parsed.error));
  // Vérifié AVANT de créer le groupe, pour ne pas laisser un groupe vide en cas de refus.
  const { data: own, error: ownError } = await supabase.from("todo_lists").select("id").eq("id", listId).eq("user_id", user.id).maybeSingle();
  if (ownError) return dbFail(ownError, "shareListWithNewGroup");
  if (!own) return fail("Seul le propriétaire peut partager cette liste.");

  const { data: groupId, error } = await supabase.rpc("create_group", { group_name: parsed.data });
  if (error) return dbFail(error, "shareListWithNewGroup:create_group");
  const { error: linkError } = await supabase.from("todo_lists").update({ group_id: groupId }).eq("id", listId).eq("user_id", user.id);
  if (linkError) return dbFail(linkError, "shareListWithNewGroup");
  revalidatePath("/", "layout"); // la liste des groupes (et leurs codes) est chargée par le layout
  return { ok: true, message: "Liste partagée : envoie le lien d'invitation à l'étudiant.", id: groupId as string };
}

/*
 * Partage de TOUTES mes tâches avec un groupe (souvent un seul autre étudiant) :
 * mes listes privées passent dans le groupe, et les listes créées ensuite aussi
 * (user_settings.tasks_group_id). Les projets ont leur propre partage et ne bougent pas ;
 * une liste déjà partagée avec un autre groupe le reste.
 */
async function shareAllWith(groupId: string): Promise<ActionResult> {
  const { user, supabase } = await actionContext();
  const { error: settingsError } = await supabase
    .from("user_settings")
    .upsert({ user_id: user.id, tasks_group_id: groupId, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (settingsError) return dbFail(settingsError, "shareAllTasks.settings");
  const { error } = await supabase.from("todo_lists").update({ group_id: groupId }).eq("user_id", user.id).is("group_id", null).neq("scope", "project");
  if (error) return dbFail(error, "shareAllTasks.lists");
  revalidatePath("/", "layout");
  return { ok: true, message: "Toutes tes tâches sont partagées.", id: groupId };
}

/** Partage toutes mes tâches avec un groupe existant (dont je suis membre). */
export async function shareAllTasks(groupId: string): Promise<ActionResult> {
  const { supabase } = await actionContext();
  if (!idSchema.safeParse(groupId).success) return fail("Groupe invalide.");
  const { data: group } = await supabase.from("groups").select("id").eq("id", groupId).maybeSingle();
  if (!group) return fail("Tu ne fais pas partie de ce groupe.");
  return shareAllWith(groupId);
}

/** Partage toutes mes tâches avec un étudiant : crée le groupe, puis on envoie son lien d'invitation. */
export async function shareAllTasksWithNewGroup(name: string): Promise<ActionResult> {
  const { supabase } = await actionContext();
  const parsed = shareNameSchema.safeParse(name);
  if (!parsed.success) return fail(firstError(parsed.error));
  const { data: groupId, error } = await supabase.rpc("create_group", { group_name: parsed.data });
  if (error) return dbFail(error, "shareAllTasksWithNewGroup");
  return shareAllWith(groupId as string);
}

/** Arrête le partage global : mes listes rangées dans ce groupe redeviennent privées (pas les projets). */
export async function stopSharingAllTasks(): Promise<ActionResult> {
  const { user, supabase } = await actionContext();
  const { data } = await supabase.from("user_settings").select("tasks_group_id").eq("user_id", user.id).maybeSingle();
  const groupId = (data?.tasks_group_id as string | null | undefined) ?? null;
  if (groupId) {
    const { error } = await supabase.from("todo_lists").update({ group_id: null }).eq("user_id", user.id).eq("group_id", groupId).neq("scope", "project");
    if (error) return dbFail(error, "stopSharingAllTasks.lists");
  }
  const { error } = await supabase.from("user_settings").update({ tasks_group_id: null, updated_at: new Date().toISOString() }).eq("user_id", user.id);
  if (error) return dbFail(error, "stopSharingAllTasks.settings");
  revalidatePath("/", "layout");
  return ok("Tes tâches sont redevenues privées.");
}
