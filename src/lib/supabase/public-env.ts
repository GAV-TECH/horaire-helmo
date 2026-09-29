/**
 * URL et clé publique Supabase. Elles peuvent aller au navigateur (préfixe NEXT_PUBLIC_) :
 * la clé publique ne donne accès qu'à ce que les politiques RLS autorisent.
 * Next.js remplace ces expressions au build : il faut écrire process.env.NOM en entier.
 */
export function supabasePublicEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY doivent être définies (voir README).");
  }
  return { url, key };
}
