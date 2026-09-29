import { fromDayKey, groupByDay } from "@/lib/calendar";
import type { Session } from "@/lib/ics/types";
import { dayKey, formatFr } from "@/lib/time";
import { SessionBlock } from "./SessionBlock";

type Props = {
  days: string[];
  sessions: Session[];
  now: number;
  onSelect: (session: Session) => void;
  onSelectDay?: (day: string) => void;
  /** Affiche aussi les jours sans séance (utile pour la semaine, pas pour "à venir"). */
  showEmptyDays?: boolean;
  emptyMessage?: string;
};

/** Liste de séances regroupées par jour : vue semaine sur mobile et vue "à venir". */
export function DayList({ days, sessions, now, onSelect, onSelectDay, showEmptyDays, emptyMessage }: Props) {
  const byDay = groupByDay(sessions);
  const today = dayKey(now);
  const visible = days.filter((d) => showEmptyDays || byDay.has(d));

  if (visible.length === 0) {
    return <p className="py-10 text-center text-zinc-500">{emptyMessage ?? "Aucune séance."}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {visible.map((day) => (
        <section key={day} aria-labelledby={`day-${day}`}>
          <h2 id={`day-${day}`} className="mb-1.5 flex items-baseline gap-2 text-sm">
            <button
              type="button"
              disabled={!onSelectDay}
              onClick={() => onSelectDay?.(day)}
              className={`font-semibold capitalize ${day === today ? "text-blue-600 dark:text-blue-400" : ""} ${onSelectDay ? "hover:underline" : ""}`}
            >
              {formatFr(fromDayKey(day), "EEEE d MMMM")}
            </button>
            {day === today && <span className="text-xs text-blue-600 dark:text-blue-400">aujourd&apos;hui</span>}
          </h2>
          <div className="flex flex-col gap-1.5">
            {(byDay.get(day) ?? []).map((s) => (
              <SessionBlock key={s.key} session={s} onSelect={onSelect} variant="card" />
            ))}
            {!byDay.has(day) && <p className="text-sm text-zinc-400">Pas de cours</p>}
          </div>
        </section>
      ))}
    </div>
  );
}
