"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { deleteReminder } from "@/lib/actions/reminders";
import type { Reminder } from "@/lib/data/types";
import { describeReminder, reminderStatus } from "@/lib/reminders";
import { formatFr } from "@/lib/time";
import { ErrorText, buttonClass } from "@/components/ui";
import { useAllReminders } from "./RemindersContext";

const TARGET = {
  session: { icon: "📅", href: "/" },
  deadline: { icon: "⚑", href: "/deadlines" },
  todo: { icon: "☐", href: "/taches" },
} as const;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Liste des rappels : visible dans l'app même si les notifications sont refusées. */
export function RemindersOverview() {
  const { reminders, now } = useAllReminders();
  const withStatus = reminders.map((r) => ({ r, status: reminderStatus(r, now) }));
  const upcoming = withStatus.filter((x) => x.status === "pending").map((x) => x.r);
  const late = withStatus.filter((x) => x.status === "late").map((x) => x.r);
  const past = withStatus
    .filter((x) => (x.status === "sent" || x.status === "skipped") && x.r.sentAt && Date.parse(x.r.sentAt) > now - WEEK_MS)
    .map((x) => x.r)
    .reverse();

  return (
    <div className="flex flex-col gap-5">
      {late.length > 0 && (
        <Group title="En attente d'envoi" hint="Ces rappels auraient déjà dû partir : la tâche planifiée (pg_cron) ne semble pas tourner. Voir README.">
          {late.map((r) => (
            <ReminderRow key={r.id} reminder={r} />
          ))}
        </Group>
      )}
      <Group title="À venir" empty={upcoming.length === 0 ? "Aucun rappel prévu. Ajoute-en depuis une séance, une deadline ou une tâche (🔔)." : undefined}>
        {upcoming.map((r) => (
          <ReminderRow key={r.id} reminder={r} />
        ))}
      </Group>
      {past.length > 0 && (
        <Group title="Envoyés ces 7 derniers jours">
          {past.map((r) => (
            <ReminderRow key={r.id} reminder={r} past />
          ))}
        </Group>
      )}
    </div>
  );
}

function Group({ title, hint, empty, children }: { title: string; hint?: string; empty?: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-1 text-sm font-semibold">{title}</h2>
      {hint && <p className="mb-2 text-xs text-amber-700 dark:text-amber-400">{hint}</p>}
      {empty ? <p className="text-sm text-zinc-500">{empty}</p> : <ul className="flex flex-col gap-1.5">{children}</ul>}
    </section>
  );
}

function ReminderRow({ reminder: r, past = false }: { reminder: Reminder; past?: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const target = TARGET[r.targetType];

  return (
    <li className={`flex items-start gap-2 rounded-md border border-zinc-200 px-3 py-2 dark:border-zinc-800 ${past ? "opacity-60" : ""}`}>
      <span aria-hidden>{target.icon}</span>
      <div className="min-w-0 flex-1">
        <Link href={target.href} className="text-sm font-medium hover:underline">
          {r.targetTitle ?? "(élément supprimé)"}
        </Link>
        <p className="text-xs text-zinc-500">
          🔔 {r.fireAt ? formatFr(r.fireAt, "EEE d MMM 'à' HH:mm") : "—"} · {describeReminder(r)}
          {r.targetDetail && ` · ${r.targetDetail}`}
          {past && r.targetDone && " · non envoyé (fait ou annulé)"}
        </p>
        <ErrorText>{error}</ErrorText>
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await deleteReminder(r.id);
            setError(res.ok ? null : res.error);
          })
        }
        className={buttonClass.ghost}
        aria-label="Supprimer ce rappel"
      >
        ✕
      </button>
    </li>
  );
}
