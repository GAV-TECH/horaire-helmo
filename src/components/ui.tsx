"use client";

import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import type { ActionResult } from "@/lib/actions/context";

export { buttonClass, cardClass, inputClass } from "./styles";

type FormAction = (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;

/**
 * Soumet un formulaire à une server action. Contrairement à <form action={...}>, les champs
 * ne sont vidés QUE si l'action réussit (reset: true) : une erreur de validation ne fait pas perdre la saisie.
 */
export function useFormAction(action: FormAction, options: { reset?: boolean; onSuccess?: () => void } = {}) {
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    startTransition(async () => {
      const r = await action(null, data);
      setResult(r);
      if (r.ok) {
        if (options.reset) form.reset();
        options.onSuccess?.();
      }
    });
  };
  return { onSubmit, pending, result };
}

/** Pour les actions déclenchées par un clic (cocher, supprimer…). */
export function useActionRunner() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<ActionResult>) =>
    startTransition(async () => {
      const r = await fn();
      setError(r.ok ? null : r.error);
    });
  return { run, pending, error };
}

export function ActionMessage({ result, showSuccess = true }: { result: ActionResult | null; showSuccess?: boolean }) {
  if (!result) return null;
  if (!result.ok) {
    return (
      <p role="alert" className="text-sm text-red-600 dark:text-red-400">
        {result.error}
      </p>
    );
  }
  if (!showSuccess || !result.message) return null;
  return (
    <p role="status" className="text-sm text-green-700 dark:text-green-400">
      {result.message}
    </p>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="text-xs text-red-600 dark:text-red-400">
      {children}
    </p>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {hint && <span className="text-xs text-zinc-500">{hint}</span>}
    </label>
  );
}

export function PageTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <header className="mb-4 flex flex-wrap items-center gap-2">
      <h1 className="mr-auto text-xl font-bold">{children}</h1>
      {aside}
    </header>
  );
}
