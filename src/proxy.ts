import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabasePublicEnv } from "@/lib/supabase/public-env";

/** Pages accessibles sans être connecté. */
const PUBLIC_PATHS = ["/connexion", "/mot-de-passe-oublie", "/auth/"];

/**
 * Exécuté avant chaque requête (Next 16 : "proxy" remplace l'ancien "middleware").
 * 1. Rafraîchit la session Supabase si le jeton a expiré (cookies réécrits dans la réponse).
 * 2. Redirige vers /connexion si on n'est pas connecté. C'est un confort : la vraie
 *    protection reste la vérification dans chaque page/action et le RLS en base.
 */
export async function proxy(request: NextRequest) {
  const { url, key } = supabasePublicEnv();
  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
      },
    },
  });

  // getClaims() vérifie la signature du jeton (ne pas se fier à getSession() côté serveur).
  const { data } = await supabase.auth.getClaims();
  const loggedIn = Boolean(data?.claims);
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  const isApi = pathname.startsWith("/api/"); // les routes API répondent 401 elles-mêmes

  if (!loggedIn && !isPublic && !isApi) {
    const target = request.nextUrl.clone();
    target.pathname = "/connexion";
    // On garde aussi les paramètres (ex. le code d'un lien d'invitation) pour y revenir après connexion.
    const back = pathname + request.nextUrl.search;
    target.search = back === "/" ? "" : `?next=${encodeURIComponent(back)}`;
    return NextResponse.redirect(target);
  }
  if (loggedIn && pathname === "/connexion") {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return response;
}

export const config = {
  // Tout sauf les fichiers statiques.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|apple-icon|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest)$).*)"],
};
