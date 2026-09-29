"use client";

/** Affiché si une page plante (base injoignable, configuration manquante…). */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="py-16 text-center">
      <p className="font-semibold">Oups, quelque chose s&apos;est mal passé.</p>
      {/* En développement, le message aide à diagnostiquer ; en production Next.js le masque. */}
      <p className="mt-2 text-sm text-zinc-500">{error.message}</p>
      <button type="button" onClick={reset} className="mt-4 rounded-md border px-3 py-1.5 text-sm">
        Réessayer
      </button>
    </div>
  );
}
