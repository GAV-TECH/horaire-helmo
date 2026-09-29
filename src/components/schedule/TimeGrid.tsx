"use client";

import { fromDayKey, groupByDate, groupByDay, minutesOfDay } from "@/lib/calendar";
import type { Deadline } from "@/lib/data/types";
import type { StoredSession } from "@/lib/ics/types";
import { layoutOverlaps } from "@/lib/layout";
import { dayKey, formatFr } from "@/lib/time";
import { DeadlineChip } from "./DeadlineChip";
import { SessionBlock } from "./SessionBlock";

type Props = {
  days: string[];
  sessions: StoredSession[];
  deadlines: Deadline[];
  noteCounts: Map<string, number>;
  now: number;
  onSelect: (session: StoredSession) => void;
  onSelectDay?: (day: string) => void;
};

const HOUR_HEIGHT = 56; // px par heure

/** Grille horaire classique (heures en ordonnée, jours en colonnes), utilisée par les vues jour et semaine. */
export function TimeGrid({ days, sessions, deadlines, noteCounts, now, onSelect, onSelectDay }: Props) {
  const byDay = groupByDay(sessions);
  const deadlinesByDay = groupByDate(deadlines, (d) => d.dueAt);
  const timed = (day: string) => (byDay.get(day) ?? []).filter((s) => !s.allDay);
  const allDay = (day: string) => (byDay.get(day) ?? []).filter((s) => s.allDay);

  // Plage horaire : 8 h – 18 h par défaut, élargie si une séance déborde.
  let firstHour = 8;
  let lastHour = 18;
  for (const day of days) {
    for (const s of timed(day)) {
      const startsToday = dayKey(s.start) === day;
      const endsToday = dayKey(s.end) === day;
      firstHour = Math.min(firstHour, startsToday ? Math.floor(minutesOfDay(s.start) / 60) : 0);
      lastHour = Math.max(lastHour, endsToday ? Math.ceil(minutesOfDay(s.end) / 60) : 24);
    }
  }
  const hours = Array.from({ length: lastHour - firstHour }, (_, i) => firstHour + i);
  const today = dayKey(now);
  const hasTopRow = days.some((d) => allDay(d).length > 0 || deadlinesByDay.has(d));
  const columns = { gridTemplateColumns: `3rem repeat(${days.length}, minmax(0, 1fr))` };

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800">
      {/* En-têtes des jours (collants pendant le défilement) */}
      <div className="sticky top-0 z-20 grid border-b border-zinc-200 bg-white/95 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95 md:top-12" style={columns}>
        <div />
        {days.map((day) => (
          <button
            key={day}
            type="button"
            disabled={!onSelectDay}
            onClick={() => onSelectDay?.(day)}
            className={`py-2 text-center text-sm capitalize ${day === today ? "font-bold text-blue-600 dark:text-blue-400" : ""} ${onSelectDay ? "hover:bg-zinc-100 dark:hover:bg-zinc-900" : ""}`}
          >
            {formatFr(fromDayKey(day), days.length > 1 ? "EEE d" : "EEEE d MMMM")}
          </button>
        ))}
      </div>

      {/* Rangée du haut : journées entières et deadlines */}
      {hasTopRow && (
        <div className="grid border-b border-zinc-200 dark:border-zinc-800" style={columns}>
          <div className="p-1 text-[10px] text-zinc-500">jour</div>
          {days.map((day) => (
            <div key={day} className="flex min-w-0 flex-col gap-1 p-1">
              {allDay(day).map((s) => (
                <SessionBlock key={s.key} session={s} onSelect={onSelect} variant="grid" noteCount={noteCounts.get(s.key)} />
              ))}
              {(deadlinesByDay.get(day) ?? []).map((d) => (
                <DeadlineChip key={d.id} deadline={d} />
              ))}
            </div>
          ))}
        </div>
      )}

      <div className="relative grid" style={columns}>
        {/* Colonne des heures */}
        <div>
          {hours.map((h) => (
            <div key={h} className="relative text-right text-[11px] text-zinc-500" style={{ height: HOUR_HEIGHT }}>
              <span className="absolute -top-2 right-1">{String(h).padStart(2, "0")}:00</span>
            </div>
          ))}
        </div>

        {days.map((day) => (
          <div key={day} className="relative border-l border-zinc-200 dark:border-zinc-800">
            {hours.map((h) => (
              <div key={h} className="border-t border-zinc-100 dark:border-zinc-900" style={{ height: HOUR_HEIGHT }} />
            ))}

            {layoutOverlaps(timed(day)).map(({ item, lane, lanes }) => {
              // Une séance qui déborde sur un autre jour est coupée à minuit.
              const start = dayKey(item.start) === day ? minutesOfDay(item.start) : 0;
              const end = dayKey(item.end) === day ? minutesOfDay(item.end) : 24 * 60;
              const top = ((start - firstHour * 60) / 60) * HOUR_HEIGHT;
              const height = Math.max(((end - start) / 60) * HOUR_HEIGHT, 22);
              return (
                <SessionBlock
                  key={item.key}
                  session={item}
                  onSelect={onSelect}
                  variant="grid"
                  noteCount={noteCounts.get(item.key)}
                  style={{
                    position: "absolute",
                    top,
                    height,
                    left: `calc(${(lane / lanes) * 100}% + 2px)`,
                    width: `calc(${100 / lanes}% - 4px)`,
                  }}
                />
              );
            })}

            {day === today && <NowLine now={now} firstHour={firstHour} lastHour={lastHour} />}
          </div>
        ))}
      </div>
    </div>
  );
}

function NowLine({ now, firstHour, lastHour }: { now: number; firstHour: number; lastHour: number }) {
  const minutes = minutesOfDay(new Date(now).toISOString());
  if (minutes < firstHour * 60 || minutes > lastHour * 60) return null;
  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-10 h-0.5 bg-red-500"
      style={{ top: ((minutes - firstHour * 60) / 60) * HOUR_HEIGHT }}
      aria-hidden
    >
      <div className="absolute -left-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500" />
    </div>
  );
}
