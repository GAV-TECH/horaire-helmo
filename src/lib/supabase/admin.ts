import "server-only";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env";

/**
 * Client "administrateur" avec la clé secrète : il IGNORE le RLS.
 * Réservé au serveur, pour ce que l'utilisateur ne doit pas faire lui-même
 * (lire le lien .ics chiffré, écrire les séances synchronisées).
 * ⚠️ Chaque requête doit filtrer explicitement par user_id.
 */
export function createAdminClient() {
  const env = serverEnv();
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
