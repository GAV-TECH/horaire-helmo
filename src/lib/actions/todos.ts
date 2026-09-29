"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { firstError, idSchema, todoItemSchema, todoListSchema } from "@/lib/validation";
import { actionContext, dbFail, fail, ok, type ActionResult } from "./context";

export async function createTodoList(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { supabase } = await actionContext();
  const parsed = todoListSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(firstError(parsed.error));
  const { error } = await supabase.from("todo_lists").insert(parsed.data);
  if (error) return dbFail(error, "createTodoList");
  refresh();
  return ok("Liste créée.");
}

export async function deleteTodoList(id: string): Promise<ActionResult> {
  const { supabase } = await actionContext();
  if (!idSchema.safeParse(id).success) return fail("Liste invalide.");
  const { error } = await supabase.from("todo_lists").delete().eq("id", id); // les tâches suivent (on delete cascade)
  if (error) return dbFail(error, "deleteTodoList");
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
    const { data, error } = await supabase.from("todo_lists").insert(list).select("id").single();
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
  const { supabase } = await actionContext();
  if (!idSchema.safeParse(itemId).success) return fail("Tâche invalide.");
  const { error } = done
    ? await supabase.from("todo_completions").upsert({ item_id: itemId }, { onConflict: "item_id,user_id", ignoreDuplicates: true })
    : await supabase.from("todo_completions").delete().eq("item_id", itemId);
  if (error) return dbFail(error, "setTodoDone");
  refresh();
  return ok();
}

export async function deleteTodoItem(id: string): Promise<ActionResult> {
  const { supabase } = await actionContext();
  if (!idSchema.safeParse(id).success) return fail("Tâche invalide.");
  const { error } = await supabase.from("todo_items").delete().eq("id", id);
  if (error) return dbFail(error, "deleteTodoItem");
  refresh();
  return ok();
}
