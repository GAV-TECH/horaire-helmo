"use server";

import { refresh } from "next/cache";
import { courseKey } from "@/lib/courses";
import { firstError, idSchema, noteCreateSchema, noteUpdateSchema } from "@/lib/validation";
import { actionContext, dbFail, fail, ok, type ActionResult } from "./context";

export async function createNote(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { supabase } = await actionContext();
  const parsed = noteCreateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(firstError(parsed.error));

  const { sessionKey, courseTitle, sessionStart, body } = parsed.data;
  const { error } = await supabase.from("notes").insert({
    session_key: sessionKey,
    course_key: courseKey(courseTitle),
    course_title: courseTitle,
    session_start: sessionStart,
    body,
  });
  if (error) return dbFail(error, "createNote");
  refresh();
  return ok();
}

export async function updateNote(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { supabase } = await actionContext();
  const parsed = noteUpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(firstError(parsed.error));
  // Le RLS garantit qu'on ne peut modifier que ses propres notes.
  const { error } = await supabase.from("notes").update({ body: parsed.data.body }).eq("id", parsed.data.id);
  if (error) return dbFail(error, "updateNote");
  refresh();
  return ok();
}

export async function deleteNote(id: string): Promise<ActionResult> {
  const { supabase } = await actionContext();
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return fail("Note invalide.");
  const { error } = await supabase.from("notes").delete().eq("id", parsed.data);
  if (error) return dbFail(error, "deleteNote");
  refresh();
  return ok();
}
