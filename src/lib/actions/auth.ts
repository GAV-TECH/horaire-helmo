"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { emailSchema, firstError, passwordSchema, signInSchema, signUpSchema } from "@/lib/validation";
import { fail, ok, type ActionResult } from "./context";

/** Adresse du site (pour les liens dans les e-mails), déduite de la requête. */
async function siteOrigin() {
  const h = await headers();
  return h.get("origin") ?? `https://${h.get("host")}`;
}

/** N'accepte qu'un chemin interne ("/deadlines"), jamais une URL externe (redirection ouverte). */
function safeNext(value: FormDataEntryValue | null) {
  const next = typeof value === "string" ? value : "/";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export async function signIn(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = signInSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(firstError(parsed.error));

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    // Message volontairement vague : on ne révèle pas si l'adresse existe.
    if (error.code === "email_not_confirmed") return fail("Confirme d'abord ton adresse via l'e-mail reçu.");
    return fail("E-mail ou mot de passe incorrect.");
  }
  redirect(safeNext(formData.get("next")));
}

export async function signUp(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = signUpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(firstError(parsed.error));

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { display_name: parsed.data.displayName }, // lu par le trigger qui crée le profil
      emailRedirectTo: `${await siteOrigin()}/auth/confirm`,
    },
  });
  if (error) {
    if (error.code === "weak_password") return fail("Mot de passe trop faible : choisis-en un plus long ou plus varié.");
    if (error.code === "over_email_send_rate_limit") return fail("Trop d'e-mails envoyés. Réessaie dans quelques minutes.");
    return fail("L'inscription a échoué. Vérifie ton adresse et réessaie.");
  }
  // Si la confirmation par e-mail est désactivée dans Supabase, on est directement connecté.
  if (data.session) redirect("/parametres");
  return ok("Compte créé ! Clique sur le lien reçu par e-mail pour l'activer, puis connecte-toi.");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/connexion");
}

export async function requestPasswordReset(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const email = emailSchema.safeParse(formData.get("email"));
  if (!email.success) return fail(firstError(email.error));
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email.data, {
    redirectTo: `${await siteOrigin()}/auth/confirm?next=/parametres/mot-de-passe`,
  });
  // Même réponse que l'adresse existe ou non.
  return ok("Si un compte existe pour cette adresse, un e-mail de réinitialisation vient d'être envoyé.");
}

export async function updatePassword(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const password = passwordSchema.safeParse(formData.get("password"));
  if (!password.success) return fail(firstError(password.error));
  if (formData.get("password") !== formData.get("confirm")) return fail("Les deux mots de passe ne correspondent pas.");

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: password.data });
  if (error) {
    if (error.code === "same_password") return fail("Choisis un mot de passe différent de l'ancien.");
    return fail("Impossible de changer le mot de passe. Reconnecte-toi et réessaie.");
  }
  return ok("Mot de passe modifié.");
}
