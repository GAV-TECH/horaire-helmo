"use client";

import { useEffect, useRef } from "react";
import { courseColor } from "@/lib/courses";
import type { Session } from "@/lib/ics/types";
import { formatFr } from "@/lib/time";
import { timeRange } from "./SessionBlock";

type Props = { session: Session; onClose: () => void };

/** Panneau de détail : feuille en bas de l'écran sur mobile, panneau latéral sur grand écran. */
export function SessionDetail({ session, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus(); // accessibilité : le focus clavier entre dans le panneau
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const color = courseColor(session.courseKey);

  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-labelledby="session-title">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} aria-hidden />
      <aside className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-2xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl dark:bg-zinc-900 md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-[26rem] md:rounded-none">
        <div className="mb-4 flex items-start gap-3">
          <span className="mt-1 h-4 w-4 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />
          <h2 id="session-title" className="flex-1 text-lg font-semibold leading-snug">
            {session.title}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>

        {session.status === "cancelled" && (
          <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
            Cette séance est annulée.
          </p>
        )}

        <dl className="grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-2 text-sm">
          <dt className="text-zinc-500">Date</dt>
          <dd className="capitalize">{formatFr(session.start, "EEEE d MMMM yyyy")}</dd>
          <dt className="text-zinc-500">Horaire</dt>
          <dd>{timeRange(session)}</dd>
          {session.location && (
            <>
              <dt className="text-zinc-500">Local</dt>
              <dd>{session.location}</dd>
            </>
          )}
          {session.teacher && (
            <>
              <dt className="text-zinc-500">Enseignant</dt>
              <dd>{session.teacher}</dd>
            </>
          )}
        </dl>

        {session.description && (
          <section className="mt-5">
            <h3 className="mb-1 text-sm font-semibold">Description</h3>
            <p className="whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">{session.description}</p>
          </section>
        )}

        <section className="mt-6 rounded-lg border border-dashed border-zinc-300 p-3 text-sm text-zinc-500 dark:border-zinc-700">
          Annotations, tâches et rappels arrivent dans les phases 2 et 3.
        </section>
      </aside>
    </div>
  );
}
