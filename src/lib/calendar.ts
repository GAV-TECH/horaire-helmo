import { TZDate } from "@date-fns/tz";
import { addDays, startOfWeek } from "date-fns";
import type { Session } from "@/lib/ics/types";
import { TIMEZONE, dayKey, toBrussels } from "@/lib/time";

/** Transforme une clé "AAAA-MM-JJ" en date de Bruxelles (à midi, pour ne jamais tomber sur un changement d'heure). */
export function fromDayKey(key: string): TZDate {
  const [y, m, d] = key.split("-").map(Number);
  return new TZDate(y, m - 1, d, 12, TIMEZONE);
}

export function shiftDay(key: string, days: number): string {
  return dayKey(addDays(fromDayKey(key), days));
}

/** Les 7 jours (lundi → dimanche) de la semaine contenant `key`. */
export function weekDays(key: string): string[] {
  const monday = startOfWeek(fromDayKey(key), { weekStartsOn: 1 });
  return Array.from({ length: 7 }, (_, i) => dayKey(addDays(monday, i)));
}

/** Regroupe les séances par jour de Bruxelles. Une séance sur plusieurs jours apparaît chaque jour concerné. */
export function groupByDay<S extends Pick<Session, "start" | "end">>(sessions: S[]): Map<string, S[]> {
  const map = new Map<string, S[]>();
  for (const session of sessions) {
    const first = dayKey(session.start);
    // -1 ms : une séance qui finit pile à minuit n'appartient pas au jour suivant.
    const endKey = dayKey(new Date(Date.parse(session.end) - 1));
    const last = endKey > first ? endKey : first;
    for (let key = first; key <= last; key = shiftDay(key, 1)) {
      const list = map.get(key) ?? [];
      list.push(session);
      map.set(key, list);
    }
  }
  return map;
}

/** Regroupe des éléments ponctuels (deadlines, tâches) par jour de Bruxelles selon une de leurs dates. */
export function groupByDate<T>(items: T[], dateOf: (item: T) => string | null): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const date = dateOf(item);
    if (!date) continue;
    const key = dayKey(date);
    map.set(key, [...(map.get(key) ?? []), item]);
  }
  return map;
}

/** Minutes écoulées depuis minuit, heure de Bruxelles. */
export function minutesOfDay(iso: string): number {
  const date = toBrussels(iso);
  return date.getHours() * 60 + date.getMinutes();
}
