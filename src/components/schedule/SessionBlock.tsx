import { courseColor, parseCourseTitle } from "@/lib/courses";
import type { Session, StoredSession } from "@/lib/ics/types";
import { formatFr } from "@/lib/time";

type Props = {
  session: StoredSession;
  onSelect: (session: StoredSession) => void;
  /** "grid" : bloc compact dans la grille horaire ; "card" : ligne de liste plus détaillée. */
  variant: "grid" | "card";
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
export function SessionBlock({ session, onSelect, variant, style }: Props) {
  const color = courseColor(session.courseKey);
  const cancelled = session.status === "cancelled";
  const badge = changeBadge(session);
  // "Construction en Béton : théorie / BULDGEN / 519 (CO)" → cours + type ; le local vient de LOCATION ou du titre.
  const parsed = parseCourseTitle(session.title);
  const room = session.location ?? parsed.room;
  const base =
    "relative text-left rounded-md border-l-4 overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 transition-opacity hover:opacity-90";

  return (
    <button
      type="button"
      onClick={() => onSelect(session)}
      style={{ borderLeftColor: color, backgroundColor: `${color}1f`, ...style }}
      className={`${base} ${variant === "grid" ? "px-1.5 py-1 text-xs" : "w-full px-3 py-2 text-sm"} ${cancelled ? "opacity-60" : ""} ${badge ? "ring-2 ring-amber-500" : parsed.isEvaluation && !cancelled ? "ring-2 ring-red-500" : ""}`}
      aria-label={`${session.title}, ${timeRange(session)}${session.location ? `, ${session.location}` : ""}${cancelled ? ", annulée" : ""}${badge ? `, ${badge}` : ""}`}
    >
      {badge && (
        <span className="float-right ml-1 rounded bg-amber-500 px-1 text-[10px] font-semibold uppercase text-white">{badge}</span>
      )}
      {parsed.isEvaluation && !cancelled && (
        <span className="mb-0.5 inline-block rounded bg-red-600 px-1 text-[10px] font-bold uppercase tracking-wide text-white">Évaluation</span>
      )}
      <div className={`font-semibold leading-tight ${cancelled ? "line-through" : ""}`}>{parsed.course}</div>
      <div className="leading-tight text-zinc-600 dark:text-zinc-300">
        {variant === "card" && <span>{timeRange(session)}</span>}
        {parsed.kind && !parsed.isEvaluation && <span>{variant === "card" ? " · " : ""}{parsed.kind}</span>}
        {room && <span>{(variant === "card" || (parsed.kind && !parsed.isEvaluation)) ? " · " : ""}{room}</span>}
      </div>
      {cancelled && !badge && (
        <span className="mt-0.5 inline-block rounded bg-red-600 px-1 text-[10px] font-semibold uppercase text-white">Annulée</span>
      )}
    </button>
  );
}
