"use client";

import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import type { ActionResult } from "@/lib/actions/context";

/* Classes Tailwind partagées : un seul endroit pour garder un style cohérent. */
export const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500";
export const buttonClass = {
  primary:
    "inline-flex items-center justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50",
  secondary:
    "inline-flex items-center justify-center rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800",
  danger:
    "inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-950",
  ghost: "rounded px-1.5 py-0.5 text-xs text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-200",
};
export const cardClass = "rounded-lg border border-zinc-200 p-4 dark:border-zinc-800";

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
