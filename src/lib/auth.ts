import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * Utilisateur connecté, ou null. getClaims() vérifie la signature du jeton de session.
 * React.cache : appelée plusieurs fois pendant un même rendu, elle ne travaille qu'une fois.
 */
export const getUser = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : "" };
});

/** Pour les pages protégées : redirige vers la connexion si besoin. */
export async function requireUser() {
  const user = await getUser();
  if (!user) redirect("/connexion");
  return { user, supabase: await createClient() };
}
