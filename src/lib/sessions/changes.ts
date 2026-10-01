import type { StoredSession } from "@/lib/ics/types";
import { dayKey, formatFr } from "@/lib/time";

export type ChangeKind = "added" | "moved" | "room" | "cancelled" | "removed";

export type ChangeInfo = { kind: ChangeKind; icon: string; label: string; detail: string | null };

/** Légende commune (bandeau, blocs de l'horaire, panneau de séance). */
export const CHANGE_LEGEND: { kind: ChangeKind; icon: string; label: string }[] = [
  { kind: "added", icon: "🆕", label: "Nouvelle séance" },
  { kind: "moved", icon: "🕒", label: "Déplacée" },
  { kind: "room", icon: "📍", label: "Local changé" },
  { kind: "cancelled", icon: "✕", label: "Annulée par HELMO" },
  { kind: "removed", icon: "⊘", label: "Retirée de l'horaire" },
];

const legend = (kind: ChangeKind) => CHANGE_LEGEND.find((l) => l.kind === kind)!;

/**
 * Ce qui a changé sur une séance, avec le détail lisible :
 * "était mar. 29 sept. 08:15", "519 → 619"… Ordre : du plus important au moins important.
 */
export function describeChanges(session: StoredSession): ChangeInfo[] {
  const c = session.changes;
  const out: ChangeInfo[] = [];
  const push = (kind: ChangeKind, detail: string | null) => out.push({ ...legend(kind), detail });

  if (c.cancelled) push("cancelled", null);
  if (c.removed) push("removed", "a disparu de l'horaire HELMO");
  if (c.moved) {
    const sameDay = dayKey(c.moved.fromStart) === dayKey(session.start);
    push(
      "moved",
      sameDay
        ? `était ${formatFr(c.moved.fromStart, "HH:mm")}–${formatFr(c.moved.fromEnd, "HH:mm")}`
        : `était ${formatFr(c.moved.fromStart, "EEE d MMM 'à' HH:mm")}`,
    );
  }
  if (c.room) push("room", `${c.room.from ?? "non précisé"} → ${session.location ?? "non précisé"}`);
  if (c.added) push("added", null);
  return out;
}
