import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Arrivée depuis un lien reçu par e-mail (confirmation d'inscription, mot de passe oublié).
 * Deux formats possibles selon le modèle d'e-mail Supabase :
 * - ?token_hash=…&type=… (recommandé, voir README) : fonctionne même si l'e-mail est ouvert sur un autre appareil ;
 * - ?code=… (modèle par défaut) : ne fonctionne que dans le navigateur qui a fait la demande.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = searchParams.get("next") ?? "/";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";

  const supabase = await createClient();
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");

  let ok = false;
  if (tokenHash && type) {
    ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error;
  } else if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  }

  if (!ok) return NextResponse.redirect(`${origin}/connexion?erreur=lien`);
  // Après une récupération de mot de passe, on envoie vers le formulaire de nouveau mot de passe.
  const target = type === "recovery" ? "/parametres/mot-de-passe" : safeNext;
  return NextResponse.redirect(`${origin}${target}`);
}
