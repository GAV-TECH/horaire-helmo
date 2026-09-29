"use client";

import Link from "next/link";
import { requestPasswordReset } from "@/lib/actions/auth";
import { ActionMessage, Field, buttonClass, cardClass, inputClass, useFormAction } from "@/components/ui";

export function ForgotPasswordForm() {
  const { onSubmit, pending, result } = useFormAction(requestPasswordReset);
  return (
    <form onSubmit={onSubmit} className={`${cardClass} flex flex-col gap-3`}>
      <h1 className="font-semibold">Mot de passe oublié</h1>
      <p className="text-sm text-zinc-500">Tu vas recevoir un lien pour choisir un nouveau mot de passe.</p>
      <Field label="E-mail">
        <input name="email" type="email" autoComplete="email" required className={inputClass} />
      </Field>
      <ActionMessage result={result} />
      <button type="submit" disabled={pending} className={buttonClass.primary}>
        {pending ? "Envoi…" : "Envoyer le lien"}
      </button>
      <Link href="/connexion" className="text-center text-sm text-zinc-500 hover:underline">
        Retour à la connexion
      </Link>
    </form>
  );
}
