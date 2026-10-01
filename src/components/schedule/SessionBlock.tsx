import { courseColor, parseCourseTitle } from "@/lib/courses";
import type { Session, StoredSession } from "@/lib/ics/types";
import { describeChanges, type ChangeInfo } from "@/lib/sessions/changes";
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

/** Changements à signaler (tant que l'étudiant ne les a pas marqués comme vus). */
export function unseenChanges(session: StoredSession): ChangeInfo[] {
  return session.changesSeen ? [] : describeChanges(session);
}

/** Une séance cliquable. La couleur vient du cours ; chaque changement a son badge (voir la légende). */
export function SessionBlock({ session, onSelect, variant, style }: Props) {
  const color = courseColor(session.courseKey);
  const cancelled = session.status === "cancelled";
  const changes = unseenChanges(session);
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
      className={`${base} ${variant === "grid" ? "px-1.5 py-1 text-xs" : "w-full px-3 py-2 text-sm"} ${cancelled ? "opacity-60" : ""} ${changes.length ? "ring-2 ring-amber-500" : parsed.isEvaluation && !cancelled ? "ring-2 ring-red-500" : ""}`}
      aria-label={`${parsed.course}, ${timeRange(session)}${room ? `, ${room}` : ""}${changes.map((c) => `, ${c.label}${c.detail ? ` (${c.detail})` : ""}`).join("")}`}
    >
      {changes.length > 0 && (
        <span className="mb-0.5 flex flex-wrap gap-1">
          {changes.map((c) => (
            <span key={c.kind} className="rounded bg-amber-500 px-1 text-[10px] font-semibold text-white" title={c.detail ? `${c.label} : ${c.detail}` : c.label}>
              {c.icon} {variant === "grid" && changes.length > 1 ? "" : c.label}
            </span>
          ))}
        </span>
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
      {/* En vue liste, le détail de chaque changement : "était 08:15–10:15", "519 → 619"… */}
      {variant === "card" &&
        changes
          .filter((c) => c.detail)
          .map((c) => (
            <div key={c.kind} className="text-xs text-amber-700 dark:text-amber-400">
              {c.icon} {c.detail}
            </div>
          ))}
      {cancelled && changes.length === 0 && (
        <span className="mt-0.5 inline-block rounded bg-red-600 px-1 text-[10px] font-semibold uppercase text-white">
          {session.changes.removed ? "Retirée" : "Annulée"}
        </span>
      )}
    </button>
  );
}
