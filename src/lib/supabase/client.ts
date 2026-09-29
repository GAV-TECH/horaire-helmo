import { createBrowserClient } from "@supabase/ssr";
import { supabasePublicEnv } from "./public-env";

/**
 * Client Supabase côté navigateur (clé publique + session lue dans les cookies).
 * Utilisé uniquement pour le temps réel : toutes les lectures/écritures passent par le serveur.
 */
export function createClient() {
  const { url, key } = supabasePublicEnv();
  return createBrowserClient(url, key);
}
