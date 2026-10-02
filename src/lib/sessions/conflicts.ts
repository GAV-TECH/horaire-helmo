type Slot = { start: string; end: string; allDay: boolean; status: "active" | "cancelled" };

/**
 * Conflits d'horaire : paires de séances à venir qui se chevauchent (cours HELMO entre eux,
 * ou avec une plage ajoutée à la main). Ignorées : séances annulées / retirées, terminées,
 * et "toute la journée". Deux séances qui se suivent (fin = début) ne sont pas en conflit.
 */
export function findConflicts<T extends Slot>(sessions: T[], nowIso: string): [T, T][] {
  // Dates ISO UTC : la comparaison de chaînes suit l'ordre chronologique.
  const sorted = sessions
    .filter((s) => s.status === "active" && !s.allDay && s.end > nowIso)
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  const pairs: [T, T][] = [];
  for (let i = 0; i < sorted.length; i++) {
    // Trié par début : dès qu'une séance commence après la fin de i, les suivantes aussi.
    for (let j = i + 1; j < sorted.length && sorted[j].start < sorted[i].end; j++) pairs.push([sorted[i], sorted[j]]);
  }
  return pairs;
}
