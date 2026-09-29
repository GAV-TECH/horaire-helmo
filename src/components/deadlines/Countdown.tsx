import { countdown, type Urgency } from "@/lib/deadlines";
import type { Priority } from "@/lib/data/types";

const URGENCY_STYLE: Record<Urgency, string> = {
  late: "bg-red-600 text-white",
  urgent: "bg-orange-500 text-white",
  soon: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  later: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
};

/** Pastille "J-3" / "Demain" / "En retard", colorée selon l'urgence. */
export function Countdown({ dueAt, now, done = false }: { dueAt: string; now: number; done?: boolean }) {
  if (done) {
    return <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700 dark:bg-green-950 dark:text-green-300">✓ Fait</span>;
  }
  const { label, urgency } = countdown(dueAt, now);
  return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${URGENCY_STYLE[urgency]}`}>{label}</span>;
}

export const IMPORTANCE: Record<Priority, { label: string; marks: string; style: string }> = {
  1: { label: "Importante", marks: "!!!", style: "text-red-600 dark:text-red-400" },
  2: { label: "Normale", marks: "!!", style: "text-amber-600 dark:text-amber-400" },
  3: { label: "Faible", marks: "!", style: "text-zinc-400" },
};

/** Marque d'importance compacte : "!!!" rouge, "!!" orange, "!" gris. */
export function Importance({ priority }: { priority: Priority }) {
  const i = IMPORTANCE[priority];
  return (
    <span className={`font-black tracking-tighter ${i.style}`} title={`Importance : ${i.label}`} aria-label={`Importance : ${i.label}`}>
      {i.marks}
    </span>
  );
}
