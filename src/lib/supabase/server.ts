import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabasePublicEnv } from "./public-env";

/**
 * Client Supabase "au nom de l'utilisateur connecté" : il lit la session dans les cookies,
 * et toutes ses requêtes passent par les politiques RLS. À recréer à chaque requête.
 */
export async function createClient() {
  const { url, key } = supabasePublicEnv();
  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Appelé depuis un Server Component, qui ne peut pas écrire de cookies :
          // sans gravité, le proxy (src/proxy.ts) rafraîchit la session à chaque requête.
        }
      },
    },
  });
}
