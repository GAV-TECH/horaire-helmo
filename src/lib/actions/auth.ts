"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
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
    // Le formulaire reconnaît ce code "UNCONFIRMED" et propose de saisir le code reçu par e-mail.
    if (error.code === "email_not_confirmed") return fail("UNCONFIRMED");
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
  return ok("Compte créé ! Saisis le code à 6 chiffres reçu par e-mail.");
}

/* ---------------------------------------------------------------------------------------
 * Codes de sécurité reçus par e-mail (plutôt que des liens) : ils fonctionnent aussi dans
 * l'app installée et sur un autre appareil que celui où l'on a fait la demande.
 * ------------------------------------------------------------------------------------- */

/** Le code peut être tapé avec des espaces ("123 456") : on ne garde que les chiffres. */
const codeSchema = z
  .string()
  .transform((v) => v.replace(/\D/g, ""))
  .pipe(z.string().regex(/^\d{6,10}$/, "Le code contient 6 chiffres."));

function otpFail(error: { code?: string }): ActionResult {
  if (error.code === "otp_expired") return fail("Code incorrect ou expiré. Vérifie le dernier e-mail reçu, ou demande un nouveau code.");
  if (error.code === "over_email_send_rate_limit" || error.code === "over_request_rate_limit") {
    return fail("Trop de tentatives. Attends une minute avant de réessayer.");
  }
  return fail("Le code n'a pas pu être vérifié. Réessaie ou demande un nouveau code.");
}

/** Inscription : vérifie le code reçu par e-mail ; le compte est activé et l'utilisateur connecté. */
export async function verifySignupCode(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const email = emailSchema.safeParse(formData.get("email"));
  const code = codeSchema.safeParse(formData.get("code"));
  if (!email.success) return fail(firstError(email.error));
  if (!code.success) return fail(firstError(code.error));

  const supabase = await createClient();
  // "email" est le type actuel ; "signup" est accepté par les anciennes configurations Supabase.
  let { error } = await supabase.auth.verifyOtp({ email: email.data, token: code.data, type: "email" });
  if (error) ({ error } = await supabase.auth.verifyOtp({ email: email.data, token: code.data, type: "signup" }));
  if (error) return otpFail(error);
  redirect("/parametres"); // première connexion : on invite à coller le lien de l'horaire
}

/** Renvoie le code d'inscription. Même réponse que le compte existe ou non (pas de fuite d'information). */
export async function resendSignupCode(email: string): Promise<ActionResult> {
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) return fail(firstError(parsed.error));
  const supabase = await createClient();
  const { error } = await supabase.auth.resend({ type: "signup", email: parsed.data });
  if (error && (error.code === "over_email_send_rate_limit" || error.code === "over_request_rate_limit")) {
    return fail("Un code vient déjà d'être envoyé. Attends une minute avant d'en demander un autre.");
  }
  return ok("Si un compte en attente existe pour cette adresse, un nouveau code vient d'être envoyé.");
}

/** Mot de passe oublié, étape 2 : code reçu + nouveau mot de passe → connecté avec le nouveau mot de passe. */
export async function resetPasswordWithCode(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const email = emailSchema.safeParse(formData.get("email"));
  const code = codeSchema.safeParse(formData.get("code"));
  const password = passwordSchema.safeParse(formData.get("password"));
  if (!email.success) return fail(firstError(email.error));
  if (!code.success) return fail(firstError(code.error));
  if (!password.success) return fail(firstError(password.error));
  if (formData.get("password") !== formData.get("confirm")) return fail("Les deux mots de passe ne correspondent pas.");

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email: email.data, token: code.data, type: "recovery" });
  if (error) return otpFail(error);
  // Le code valide ouvre une session temporaire, qui permet de changer le mot de passe.
  const { error: updateError } = await supabase.auth.updateUser({ password: password.data });
  if (updateError) {
    if (updateError.code === "same_password") return fail("Choisis un mot de passe différent de l'ancien.");
    if (updateError.code === "weak_password") return fail("Mot de passe trop faible : choisis-en un plus long ou plus varié.");
    return fail("Le mot de passe n'a pas pu être changé. Recommence la procédure.");
  }
  redirect("/");
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
  // Même réponse que l'adresse existe ou non (on ne révèle pas quels comptes existent).
  return ok("Si un compte existe pour cette adresse, un code vient d'être envoyé par e-mail.");
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
