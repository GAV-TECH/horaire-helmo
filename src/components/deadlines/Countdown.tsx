import { countdown } from "@/lib/deadlines";
import type { Priority } from "@/lib/data/types";

/** Pastille "J-3" / "Demain" / "En retard" : volontairement sobre (pas de code couleur d'urgence). */
export function Countdown({ dueAt, now, done = false }: { dueAt: string; now: number; done?: boolean }) {
  const label = done ? "✓ Fait" : countdown(dueAt, now).label;
  return (
    <span className="whitespace-nowrap rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
      {label}
    </span>
  );
}

export const IMPORTANCE: Record<Priority, { label: string; marks: string }> = {
  1: { label: "Importante", marks: "!!!" },
  2: { label: "Normale", marks: "!!" },
  3: { label: "Faible", marks: "!" },
};

/** Marque d'importance compacte : "!!!", "!!", "!" (en gris, sans code couleur). */
export function Importance({ priority }: { priority: Priority }) {
  const i = IMPORTANCE[priority];
  return (
    <span className="font-black tracking-tighter text-zinc-500 dark:text-zinc-400" title={`Importance : ${i.label}`} aria-label={`Importance : ${i.label}`}>
      {i.marks}
    </span>
  );
}
