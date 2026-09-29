"use client";

import Link from "next/link";
import { useState } from "react";
import { signIn, signUp } from "@/lib/actions/auth";
import { ActionMessage, Field, buttonClass, cardClass, inputClass, useFormAction } from "@/components/ui";

export function AuthForms({ next, linkError }: { next: string; linkError: string | null }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const login = useFormAction(signIn);
  const signup = useFormAction(signUp, { reset: true });

  return (
    <div className={cardClass}>
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

      {linkError && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{linkError}</p>}

      {mode === "login" ? (
        <form onSubmit={login.onSubmit} className="flex flex-col gap-3">
          <input type="hidden" name="next" value={next} />
          <Field label="E-mail">
            <input name="email" type="email" autoComplete="email" required className={inputClass} />
          </Field>
          <Field label="Mot de passe">
            <input name="password" type="password" autoComplete="current-password" required className={inputClass} />
          </Field>
          <ActionMessage result={login.result} />
          <button type="submit" disabled={login.pending} className={buttonClass.primary}>
            {login.pending ? "Connexion…" : "Se connecter"}
          </button>
          <Link href="/mot-de-passe-oublie" className="text-center text-sm text-zinc-500 hover:underline">
            Mot de passe oublié ?
          </Link>
        </form>
      ) : (
        <form onSubmit={signup.onSubmit} className="flex flex-col gap-3">
          <Field label="Nom affiché" hint="Visible par les membres de tes groupes (phase 4).">
            <input name="displayName" autoComplete="nickname" required maxLength={60} className={inputClass} />
          </Field>
          <Field label="E-mail">
            <input name="email" type="email" autoComplete="email" required className={inputClass} />
          </Field>
          <Field label="Mot de passe" hint="8 caractères minimum.">
            <input name="password" type="password" autoComplete="new-password" required minLength={8} className={inputClass} />
          </Field>
          <ActionMessage result={signup.result} />
          <button type="submit" disabled={signup.pending} className={buttonClass.primary}>
            {signup.pending ? "Création…" : "Créer mon compte"}
          </button>
        </form>
      )}
    </div>
  );
}
