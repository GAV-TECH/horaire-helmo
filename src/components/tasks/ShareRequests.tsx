"use client";

import { useState, useTransition } from "react";
import { respondTaskShare } from "@/lib/actions/shares";
import { useGroups } from "@/components/groups/GroupsContext";
import { buttonClass } from "@/components/styles";

/** Bandeau visible sur toutes les pages : demandes de partage reçues, à accepter ou refuser. */
export function ShareRequests() {
  const { me, shares } = useGroups();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const incoming = shares.filter((s) => s.recipientId === me && s.status === "pending");
  if (incoming.length === 0) return null;

  const respond = (id: string, accept: boolean) =>
    startTransition(async () => {
      const r = await respondTaskShare(id, accept);
      setError(r.ok ? null : r.error);
    });

  return (
    <div className="mx-auto w-full max-w-6xl px-3 pt-3 sm:px-6">
      {incoming.map((s) => (
        <div
          key={s.id}
          role="status"
          className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-900 dark:border-violet-900 dark:bg-violet-950/60 dark:text-violet-100"
        >
          <span className="min-w-0 flex-1">
            👥 <strong>{s.ownerName}</strong> veut partager {s.label} avec toi. Tu pourras les voir et les modifier ; chacun coche ses tâches
            pour soi.
          </span>
          <button type="button" disabled={pending} onClick={() => respond(s.id, true)} className={buttonClass.primary}>
            Accepter
          </button>
          <button type="button" disabled={pending} onClick={() => respond(s.id, false)} className={buttonClass.ghost}>
            Refuser
          </button>
        </div>
      ))}
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
