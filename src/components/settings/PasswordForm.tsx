"use client";

import { updatePassword } from "@/lib/actions/auth";
import { ActionMessage, Field, buttonClass, cardClass, useFormAction } from "@/components/ui";
import { PasswordInput } from "@/components/auth/PasswordInput";

export function PasswordForm() {
  const { onSubmit, pending, result } = useFormAction(updatePassword, { reset: true });
  return (
    <form onSubmit={onSubmit} className={`${cardClass} flex flex-col gap-3`}>
      <Field label="Nouveau mot de passe" hint="8 caractères minimum.">
        <PasswordInput name="password" autoComplete="new-password" required minLength={8} />
      </Field>
      <Field label="Confirmation">
        <PasswordInput name="confirm" autoComplete="new-password" required minLength={8} />
      </Field>
      <ActionMessage result={result} />
      <button type="submit" disabled={pending} className={buttonClass.primary}>
        Enregistrer
      </button>
    </form>
  );
}
