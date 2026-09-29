"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { brusselsToIso, dayKey } from "@/lib/time";
import { firstError, idSchema } from "@/lib/validation";
import { actionContext, dbFail, fail, ok, type ActionResult } from "./context";

/*
 * Actions de la page Tâches façon To Do : marqueurs personnels (étoile, Ma journée),
 * échéance, renommage, ajout rapide. Les marqueurs vont dans todo_item_flags (une ligne
 * par tâche ET par utilisateur) : un upsert ne modifie que la colonne envoyée.
 */

async function setFlag(itemId: string, values: { important?: boolean; my_day?: string | null }, context: string) {
  const { supabase } = await actionContext();
  if (!idSchema.safeParse(itemId).success) return fail("Tâche invalide.");
  const { error } = await supabase.from("todo_item_flags").upsert({ item_id: itemId, ...values }, { onConflict: "item_id,user_id" });
  if (error) return dbFail(error, context);
  refresh();
  return ok();
}

/** Étoile personnelle. */
export async function setTodoImportant(itemId: string, important: boolean): Promise<ActionResult> {
  return setFlag(itemId, { important: important === true }, "setTodoImportant");
}

/** "Ma journée" : on enregistre la date du jour (Bruxelles) ; le lendemain, la tâche n'y est plus. */
export async function setTodoMyDay(itemId: string, inMyDay: boolean): Promise<ActionResult> {
  return setFlag(itemId, { my_day: inMyDay ? dayKey(Date.now()) : null }, "setTodoMyDay");
}

const dueSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")),
  time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
});

/** Échéance d'une tâche (date vide = retirer). Heure par défaut : 23:59, heure de Bruxelles. */
export async function setTodoDue(itemId: string, date: string, time?: string): Promise<ActionResult> {
  const { supabase } = await actionContext();
  const parsed = dueSchema.safeParse({ date, time });
  if (!idSchema.safeParse(itemId).success || !parsed.success) return fail("Date invalide.");
  const dueAt = parsed.data.date ? brusselsToIso(parsed.data.date, parsed.data.time ?? "23:59") : null;
  const { data, error } = await supabase.from("todo_items").update({ due_at: dueAt }).eq("id", itemId).select("id");
  if (error) return dbFail(error, "setTodoDue");
  if (!data?.length) return fail("Seuls l'auteur de la tâche, le propriétaire de la liste et les admins peuvent la modifier.");
  refresh();
  return ok();
}

const titleSchema = z.string().trim().min(1, "Le titre ne peut pas être vide.").max(300, "300 caractères maximum.");

export async function renameTodoItem(itemId: string, title: string): Promise<ActionResult> {
  const { supabase } = await actionContext();
  const parsed = titleSchema.safeParse(title);
  if (!idSchema.safeParse(itemId).success) return fail("Tâche invalide.");
  if (!parsed.success) return fail(firstError(parsed.error));
  const { data, error } = await supabase.from("todo_items").update({ title: parsed.data }).eq("id", itemId).select("id");
  if (error) return dbFail(error, "renameTodoItem");
  if (!data?.length) return fail("Seuls l'auteur de la tâche, le propriétaire de la liste et les admins peuvent la modifier.");
  refresh();
  return ok();
}

export async function renameTodoList(listId: string, title: string): Promise<ActionResult> {
  const { supabase } = await actionContext();
  const parsed = z.string().trim().min(1, "Le nom ne peut pas être vide.").max(200).safeParse(title);
  if (!idSchema.safeParse(listId).success) return fail("Liste invalide.");
  if (!parsed.success) return fail(firstError(parsed.error));
  const { data, error } = await supabase.from("todo_lists").update({ title: parsed.data }).eq("id", listId).select("id");
  if (error) return dbFail(error, "renameTodoList");
  if (!data?.length) return fail("Seuls l'auteur et les admins du groupe peuvent renommer cette liste.");
  refresh();
  return ok();
}

const DEFAULT_LIST_TITLE = "Tâches";

const quickAddSchema = z.object({
  title: titleSchema,
  /** Liste précise, ou vide si l'ajout se fait depuis une liste intelligente. */
  listId: z.uuid().optional().or(z.literal("")),
  view: z.enum(["jour", "important", "planifie", "toutes", "seances", "liste"]),
});

/**
 * Ajout rapide ("＋ Ajouter une tâche", puis Entrée). Depuis une liste intelligente, la tâche
 * va dans la liste personnelle « Tâches » (créée au besoin) et reçoit le marqueur de la vue :
 * Ma journée → dans Ma journée, Important → étoilée, Planifié → échéance aujourd'hui.
 */
export async function quickAddTask(title: string, view: string, listId?: string): Promise<ActionResult> {
  const { user, supabase } = await actionContext();
  const parsed = quickAddSchema.safeParse({ title, view, listId });
  if (!parsed.success) return fail(firstError(parsed.error));

  let targetList = parsed.data.listId || null;
  if (!targetList) {
    const { data: existing } = await supabase
      .from("todo_lists")
      .select("id")
      .eq("user_id", user.id)
      .eq("scope", "global")
      .is("group_id", null)
      .eq("title", DEFAULT_LIST_TITLE)
      .limit(1)
      .maybeSingle();
    targetList = (existing?.id as string | undefined) ?? null;
    if (!targetList) {
      const { data, error } = await supabase
        .from("todo_lists")
        .insert({ title: DEFAULT_LIST_TITLE, scope: "global" })
        .select("id")
        .single();
      if (error) return dbFail(error, "quickAddTask.list");
      targetList = data.id as string;
    }
  }

  const today = dayKey(Date.now());
  const { data: item, error } = await supabase
    .from("todo_items")
    .insert({
      list_id: targetList,
      title: parsed.data.title,
      position: Date.now() % 2_000_000_000,
      due_at: parsed.data.view === "planifie" ? brusselsToIso(today, "23:59") : null,
    })
    .select("id")
    .single();
  if (error) return dbFail(error, "quickAddTask.item");

  if (parsed.data.view === "jour" || parsed.data.view === "important") {
    const flags = parsed.data.view === "jour" ? { my_day: today } : { important: true };
    const { error: flagError } = await supabase.from("todo_item_flags").insert({ item_id: item.id, ...flags });
    if (flagError) return dbFail(flagError, "quickAddTask.flag");
  }
  refresh();
  return { ok: true, id: item.id as string };
}
