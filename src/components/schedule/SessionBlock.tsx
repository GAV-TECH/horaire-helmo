import { courseColor } from "@/lib/courses";
import type { Session, StoredSession } from "@/lib/ics/types";
import { formatFr } from "@/lib/time";

type Props = {
  session: StoredSession;
  onSelect: (session: StoredSession) => void;
  /** "grid" : bloc compact dans la grille horaire ; "card" : ligne de liste plus détaillée. */
  variant: "grid" | "card";
  noteCount?: number;
  style?: React.CSSProperties;
};

export function timeRange(session: Session) {
  if (session.allDay) return "Toute la journée";
  return `${formatFr(session.start, "HH:mm")} – ${formatFr(session.end, "HH:mm")}`;
}

/** Libellé du badge de changement, tant que l'étudiant ne l'a pas marqué comme vu. */
export function changeBadge(session: StoredSession): string | null {
  if (session.changesSeen) return null;
  const c = session.changes;
  if (c.cancelled) return "Annulée";
  if (c.moved) return "Déplacée";
  if (c.room) return "Local changé";
  if (c.added) return "Nouvelle";
  return null;
}

/** Une séance cliquable. La couleur vient du nom du cours ; une séance annulée est barrée. */
export function SessionBlock({ session, onSelect, variant, noteCount = 0, style }: Props) {
  const color = courseColor(session.courseKey);
  const cancelled = session.status === "cancelled";
  const badge = changeBadge(session);
  const base =
    "relative text-left rounded-md border-l-4 overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 transition-opacity hover:opacity-90";

  return (
    <button
      type="button"
      onClick={() => onSelect(session)}
      style={{ borderLeftColor: color, backgroundColor: `${color}1f`, ...style }}
      className={`${base} ${variant === "grid" ? "px-1.5 py-1 text-xs" : "w-full px-3 py-2 text-sm"} ${cancelled ? "opacity-60" : ""} ${badge ? "ring-2 ring-amber-500" : ""}`}
      aria-label={`${session.title}, ${timeRange(session)}${session.location ? `, ${session.location}` : ""}${cancelled ? ", annulée" : ""}${badge ? `, ${badge}` : ""}${noteCount ? `, ${noteCount} note(s)` : ""}`}
    >
      {(badge || noteCount > 0) && (
        <span className="float-right ml-1 flex gap-1">
          {noteCount > 0 && <span title={`${noteCount} note(s)`}>✎</span>}
          {badge && (
            <span className="rounded bg-amber-500 px-1 text-[10px] font-semibold uppercase text-white">{badge}</span>
          )}
        </span>
      )}
      <div className={`font-semibold leading-tight ${cancelled ? "line-through" : ""}`}>{session.title}</div>
      <div className="leading-tight text-zinc-600 dark:text-zinc-300">
        {variant === "card" && <span>{timeRange(session)}</span>}
        {variant === "card" && session.location && <span> · </span>}
        {session.location && <span>{session.location}</span>}
      </div>
      {cancelled && !badge && (
        <span className="mt-0.5 inline-block rounded bg-red-600 px-1 text-[10px] font-semibold uppercase text-white">Annulée</span>
      )}
    </button>
  );
}
