"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { ActionResult } from "@/lib/actions/context";
import { resendSignupCode, signIn, signUp, verifySignupCode } from "@/lib/actions/auth";
import { ActionMessage, Field, buttonClass, cardClass, inputClass, useFormAction } from "@/components/ui";
import { CodeInput } from "./CodeInput";
import { PasswordInput } from "./PasswordInput";

type Mode = "login" | "signup" | "code";

/** Connexion, création de compte, et confirmation du compte par le code reçu par e-mail. */
export function AuthForms({ next, linkError }: { next: string; linkError: string | null }) {
  const [mode, setMode] = useState<Mode>("login");
  // L'e-mail est partagé entre les étapes : pas besoin de le retaper pour saisir le code.
  const [email, setEmail] = useState("");
  const login = useFormAction(signIn);
  const signup = useFormAction(signUp, { onSuccess: () => setMode("code") });
  const code = useFormAction(verifySignupCode);
  const [resendResult, setResendResult] = useState<ActionResult | null>(null);
  const [resending, startResend] = useTransition();
  const unconfirmed = login.result && !login.result.ok && login.result.error === "UNCONFIRMED";

  const resend = () => startResend(async () => setResendResult(await resendSignupCode(email)));

  const emailField = (
    <Field label="E-mail">
      <input
        name="email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className={inputClass}
      />
    </Field>
  );

  return (
    <div className={cardClass}>
      {mode !== "code" && (
        <div className="mb-4 grid grid-cols-2 rounded-md border border-zinc-300 p-0.5 dark:border-zinc-700" role="tablist">
          {(["login", "signup"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={`rounded px-3 py-1.5 text-sm ${mode === m ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : ""}`}
            >
              {m === "login" ? "Connexion" : "Créer un compte"}
            </button>
          ))}
        </div>
      )}

      {linkError && mode !== "code" && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{linkError}</p>}

      {mode === "login" && (
        <form onSubmit={login.onSubmit} className="flex flex-col gap-3">
          <input type="hidden" name="next" value={next} />
          {emailField}
          <Field label="Mot de passe">
            <PasswordInput name="password" autoComplete="current-password" required />
          </Field>
          {unconfirmed ? (
            <div className="rounded-md bg-amber-50 p-3 text-sm dark:bg-amber-950/40">
              Ton compte n&apos;est pas encore confirmé.
              <button type="button" onClick={() => setMode("code")} className="ml-1 font-medium text-blue-600 underline dark:text-blue-400">
                Saisir le code reçu par e-mail
              </button>
            </div>
          ) : (
            <ActionMessage result={login.result} />
          )}
          <button type="submit" disabled={login.pending} className={buttonClass.primary}>
            {login.pending ? "Connexion…" : "Se connecter"}
          </button>
          <Link href="/mot-de-passe-oublie" className="text-center text-sm text-zinc-500 hover:underline">
            Mot de passe oublié ?
          </Link>
        </form>
      )}

      {mode === "signup" && (
        <form onSubmit={signup.onSubmit} className="flex flex-col gap-3">
          <Field label="Nom affiché" hint="Visible par les membres de tes groupes.">
            <input name="displayName" autoComplete="nickname" required maxLength={60} className={inputClass} />
          </Field>
          {emailField}
          <Field label="Mot de passe" hint="8 caractères minimum.">
            <PasswordInput name="password" autoComplete="new-password" required minLength={8} />
          </Field>
          <ActionMessage result={signup.result} />
          <button type="submit" disabled={signup.pending} className={buttonClass.primary}>
            {signup.pending ? "Création…" : "Créer mon compte"}
          </button>
        </form>
      )}

      {mode === "code" && (
        <form onSubmit={code.onSubmit} className="flex flex-col gap-3">
          <div>
            <h1 className="font-semibold">Confirme ton adresse</h1>
            <p className="mt-1 text-sm text-zinc-500">
              Saisis le code à 6 chiffres envoyé à <strong className="text-zinc-800 dark:text-zinc-200">{email || "ton adresse"}</strong>. Pense à
              regarder dans les spams.
            </p>
          </div>
          {/* Si l'on arrive ici depuis la connexion sans e-mail saisi, on le demande. */}
          {email ? <input type="hidden" name="email" value={email} /> : emailField}
          <CodeInput />
          <ActionMessage result={code.result} />
          <button type="submit" disabled={code.pending} className={buttonClass.primary}>
            {code.pending ? "Vérification…" : "Confirmer"}
          </button>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <button type="button" onClick={resend} disabled={resending || !email} className="text-blue-600 hover:underline disabled:opacity-50 dark:text-blue-400">
              {resending ? "Envoi…" : "Renvoyer le code"}
            </button>
            <button type="button" onClick={() => setMode("login")} className="text-zinc-500 hover:underline">
              Retour à la connexion
            </button>
          </div>
          <ActionMessage result={resendResult} />
        </form>
      )}
    </div>
  );
}
