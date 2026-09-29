"use client";

import { updatePassword } from "@/lib/actions/auth";
import { ActionMessage, Field, buttonClass, cardClass, inputClass, useFormAction } from "@/components/ui";

export function PasswordForm() {
  const { onSubmit, pending, result } = useFormAction(updatePassword, { reset: true });
  return (
    <form onSubmit={onSubmit} className={`${cardClass} flex flex-col gap-3`}>
      <Field label="Nouveau mot de passe" hint="8 caractères minimum.">
        <input name="password" type="password" autoComplete="new-password" required minLength={8} className={inputClass} />
      </Field>
      <Field label="Confirmation">
        <input name="confirm" type="password" autoComplete="new-password" required minLength={8} className={inputClass} />
      </Field>
      <ActionMessage result={result} />
      <button type="submit" disabled={pending} className={buttonClass.primary}>
        Enregistrer
      </button>
    </form>
  );
}
