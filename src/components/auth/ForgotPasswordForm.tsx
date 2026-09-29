"use client";

import Link from "next/link";
import { useState } from "react";
import { requestPasswordReset, resetPasswordWithCode } from "@/lib/actions/auth";
import { ActionMessage, Field, buttonClass, cardClass, inputClass, useFormAction } from "@/components/ui";
import { CodeInput } from "./CodeInput";
import { PasswordInput } from "./PasswordInput";

/** Mot de passe oublié en deux étapes : 1. recevoir un code ; 2. code + nouveau mot de passe. */
export function ForgotPasswordForm() {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const request = useFormAction(requestPasswordReset, { onSuccess: () => setStep("code") });
  const reset = useFormAction(resetPasswordWithCode);

  if (step === "email") {
    return (
      <form onSubmit={request.onSubmit} className={`${cardClass} flex flex-col gap-3`}>
        <h1 className="font-semibold">Mot de passe oublié</h1>
        <p className="text-sm text-zinc-500">Tu vas recevoir un code à 6 chiffres pour choisir un nouveau mot de passe.</p>
        <Field label="E-mail">
          <input name="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        </Field>
        <ActionMessage result={request.result} />
        <button type="submit" disabled={request.pending} className={buttonClass.primary}>
          {request.pending ? "Envoi…" : "Recevoir un code"}
        </button>
        <div className="flex justify-between text-sm">
          <button type="button" onClick={() => email && setStep("code")} disabled={!email} className="text-zinc-500 hover:underline disabled:opacity-50">
            J&apos;ai déjà un code
          </button>
          <Link href="/connexion" className="text-zinc-500 hover:underline">
            Retour à la connexion
          </Link>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={reset.onSubmit} className={`${cardClass} flex flex-col gap-3`}>
      <h1 className="font-semibold">Nouveau mot de passe</h1>
      <p className="text-sm text-zinc-500">
        Si un compte existe pour <strong className="text-zinc-800 dark:text-zinc-200">{email}</strong>, un code vient d&apos;y être envoyé. Pense à
        regarder dans les spams.
      </p>
      <input type="hidden" name="email" value={email} />
      <Field label="Code reçu par e-mail">
        <CodeInput />
      </Field>
      <Field label="Nouveau mot de passe" hint="8 caractères minimum.">
        <PasswordInput name="password" autoComplete="new-password" required minLength={8} />
      </Field>
      <Field label="Confirmation">
        <PasswordInput name="confirm" autoComplete="new-password" required minLength={8} />
      </Field>
      <ActionMessage result={reset.result} />
      <button type="submit" disabled={reset.pending} className={buttonClass.primary}>
        {reset.pending ? "Enregistrement…" : "Changer le mot de passe"}
      </button>
      <button type="button" onClick={() => setStep("email")} className="text-center text-sm text-zinc-500 hover:underline">
        Renvoyer un code / changer d&apos;adresse
      </button>
    </form>
  );
}
