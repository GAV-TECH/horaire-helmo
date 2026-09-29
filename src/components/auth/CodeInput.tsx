"use client";

import { inputClass } from "@/components/styles";

/**
 * Champ pour le code à 6 chiffres reçu par e-mail.
 * autoComplete="one-time-code" : sur téléphone, le clavier propose le code directement.
 */
export function CodeInput({ autoFocus = true }: { autoFocus?: boolean }) {
  return (
    <input
      name="code"
      required
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="[0-9 ]{6,12}"
      maxLength={12}
      placeholder="123456"
      autoFocus={autoFocus}
      aria-label="Code reçu par e-mail"
      className={`${inputClass} text-center font-mono text-2xl tracking-[0.4em]`}
    />
  );
}
