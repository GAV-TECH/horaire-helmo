import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Groupe avec lequel l'utilisateur partage TOUTES ses tâches (user_settings.tasks_group_id),
 * ou null. Renvoie null aussi s'il a quitté ce groupe : le RLS de `groups` ne renvoie que
 * les groupes dont on est membre, et créer une liste dans un groupe étranger serait refusé.
 */
export async function tasksShareGroup(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await supabase.from("user_settings").select("tasks_group_id").eq("user_id", userId).maybeSingle();
  const groupId = (data?.tasks_group_id as string | null | undefined) ?? null;
  if (!groupId) return null;
  const { data: group } = await supabase.from("groups").select("id").eq("id", groupId).maybeSingle();
  return group ? groupId : null;
}
