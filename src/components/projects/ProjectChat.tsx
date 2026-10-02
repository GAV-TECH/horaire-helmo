"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { deleteProjectMessage, sendProjectMessage } from "@/lib/actions/messages";
import type { ProjectMessage } from "@/lib/data/types";
import { dayKey, formatFr } from "@/lib/time";
import { useGroups } from "@/components/groups/GroupsContext";
import { buttonClass, inputClass } from "@/components/styles";

/**
 * Discussion d'un projet, façon messagerie : mes messages à droite, ceux des autres à gauche.
 * Les nouveaux messages arrivent par le temps réel (RealtimeRefresher recharge la page).
 */
export function ProjectChat({ projectId, messages }: { projectId: string; messages: ProjectMessage[] }) {
  const { me } = useGroups();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const box = useRef<HTMLDivElement>(null);

  // Toujours montrer le dernier message (à l'ouverture et à chaque nouveau message).
  // scrollTop sur la boîte, pas scrollIntoView : la page entière ne doit pas sauter vers la discussion.
  useEffect(() => {
    if (box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [messages.length]);

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    startTransition(async () => {
      const r = await sendProjectMessage(projectId, body);
      setError(r.ok ? null : r.error);
      if (r.ok) setDraft("");
    });
  };

  return (
    <section aria-label="Discussion du projet" className="mt-6 flex flex-col rounded-xl border border-zinc-200 dark:border-zinc-800">
      <h2 className="border-b border-zinc-200 px-3 py-2 text-sm font-semibold dark:border-zinc-800">💬 Discussion</h2>
      <div ref={box} className="no-scrollbar flex max-h-96 min-h-24 flex-col gap-1.5 overflow-y-auto overscroll-contain p-3" aria-live="polite">
        {messages.length === 0 && <p className="py-4 text-center text-sm text-zinc-500">Aucun message. Écris le premier.</p>}
        {messages.map((m, i) => {
          const mine = m.authorId === me;
          const previous = messages[i - 1];
          const newDay = !previous || dayKey(previous.createdAt) !== dayKey(m.createdAt);
          return (
            <div key={m.id} className="flex flex-col">
              {newDay && <p className="py-1 text-center text-xs capitalize text-zinc-500">{formatFr(m.createdAt, "EEEE d MMMM")}</p>}
              <div className={`group flex max-w-[85%] flex-col ${mine ? "items-end self-end" : "items-start self-start"}`}>
                {!mine && (newDay || previous.authorId !== m.authorId) && <span className="px-1 text-xs text-zinc-500">{m.authorName}</span>}
                <p className={`whitespace-pre-wrap break-words rounded-2xl px-3 py-1.5 text-sm ${mine ? "bg-blue-600 text-white" : "bg-zinc-100 dark:bg-zinc-800"}`}>
                  {m.body}
                </p>
                <span className="flex gap-2 px-1 text-[11px] text-zinc-500">
                  {formatFr(m.createdAt, "HH:mm")}
                  {mine && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => startTransition(async () => void (await deleteProjectMessage(m.id)))}
                      className="hover:underline"
                    >
                      Supprimer
                    </button>
                  )}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <form onSubmit={send} className="flex gap-2 border-t border-zinc-200 p-2 dark:border-zinc-800">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={2000}
          placeholder="Écrire un message…"
          aria-label="Message"
          autoComplete="off"
          className={inputClass}
        />
        <button type="submit" disabled={pending || !draft.trim()} className={buttonClass.primary}>
          Envoyer
        </button>
      </form>
      {error && <p className="px-3 pb-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </section>
  );
}
