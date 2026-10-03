"use client";

import { useState, useTransition } from "react";
import type { ActionResult } from "@/lib/actions/context";
import { acceptTaskOffer, removeTaskOffer, respondTaskShare } from "@/lib/actions/shares";
import { formatDue } from "@/components/items/format";
import { useGroups } from "@/components/groups/GroupsContext";
import { buttonClass } from "@/components/styles";

/** Bandeau visible sur toutes les pages : demandes de partage et copies de tâches reçues, à accepter ou refuser. */
export function ShareRequests() {
  const { me, shares, offers } = useGroups();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const incoming = shares.filter((s) => s.recipientId === me && s.status === "pending");
  const received = offers.filter((o) => o.recipientId === me);
  if (incoming.length === 0 && received.length === 0) return null;

  const run = (fn: () => Promise<ActionResult>) =>
    startTransition(async () => {
      const r = await fn();
      setError(r.ok ? null : r.error);
    });
  const respond = (id: string, accept: boolean) => run(() => respondTaskShare(id, accept));

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
      {received.map((o) => (
        <div
          key={o.id}
          role="status"
          className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-900 dark:border-violet-900 dark:bg-violet-950/60 dark:text-violet-100"
        >
          <span className="min-w-0 flex-1">
            📝 <strong>{o.senderName}</strong> t&apos;envoie une tâche : « {o.title} »
            {o.context && ` (${o.context})`}
            {o.dueAt && ` — pour ${formatDue(o.dueAt)}`}
          </span>
          <button type="button" disabled={pending} onClick={() => run(() => acceptTaskOffer(o.id))} className={buttonClass.primary}>
            Ajouter à mes tâches
          </button>
          <button type="button" disabled={pending} onClick={() => run(() => removeTaskOffer(o.id))} className={buttonClass.ghost}>
            Refuser
          </button>
        </div>
      ))}
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
