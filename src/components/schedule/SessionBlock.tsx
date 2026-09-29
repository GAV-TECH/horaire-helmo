import { courseColor } from "@/lib/courses";
import type { Session } from "@/lib/ics/types";
import { formatFr } from "@/lib/time";

type Props = {
  session: Session;
  onSelect: (session: Session) => void;
  /** "grid" : bloc compact dans la grille horaire ; "card" : ligne de liste plus détaillée. */
  variant: "grid" | "card";
  style?: React.CSSProperties;
};

export function timeRange(session: Session) {
  if (session.allDay) return "Toute la journée";
  return `${formatFr(session.start, "HH:mm")} – ${formatFr(session.end, "HH:mm")}`;
}

/** Une séance cliquable. La couleur vient du nom du cours ; une séance annulée est barrée. */
export function SessionBlock({ session, onSelect, variant, style }: Props) {
  const color = courseColor(session.courseKey);
  const cancelled = session.status === "cancelled";
  const base =
    "text-left rounded-md border-l-4 overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 transition-opacity hover:opacity-90";

  return (
    <button
      type="button"
      onClick={() => onSelect(session)}
      style={{ borderLeftColor: color, backgroundColor: `${color}1f`, ...style }}
      className={`${base} ${variant === "grid" ? "px-1.5 py-1 text-xs" : "w-full px-3 py-2 text-sm"} ${cancelled ? "opacity-60" : ""}`}
      aria-label={`${session.title}, ${timeRange(session)}${session.location ? `, ${session.location}` : ""}${cancelled ? ", annulée" : ""}`}
    >
      <div className={`font-semibold leading-tight ${cancelled ? "line-through" : ""}`}>{session.title}</div>
      <div className="text-zinc-600 dark:text-zinc-300 leading-tight">
        {variant === "card" && <span>{timeRange(session)}</span>}
        {variant === "card" && session.location && <span> · </span>}
        {session.location && <span>{session.location}</span>}
      </div>
      {cancelled && (
        <span className="mt-0.5 inline-block rounded bg-red-600 px-1 text-[10px] font-semibold uppercase text-white">
          Annulée
        </span>
      )}
    </button>
  );
}
