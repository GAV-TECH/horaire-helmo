import ICAL from "ical.js";
import { TZDate } from "@date-fns/tz";
import { courseKey } from "@/lib/courses";
import { TIMEZONE } from "@/lib/time";
import type { Session } from "./types";

export class IcsParseError extends Error {}

export type ParseOptions = {
  /** Fenêtre dans laquelle on développe les événements récurrents (RRULE). */
  rangeStart?: Date;
  rangeEnd?: Date;
};

/** Limite de sécurité : une RRULE sans fin ne doit pas produire une boucle infinie. */
const MAX_OCCURRENCES_PER_SERIES = 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Transforme le texte d'un fichier .ics en liste de séances triées par date de début.
 * Fonction pure (aucun accès réseau) : c'est elle que testent les tests unitaires.
 */
export function parseIcs(text: string, options: ParseOptions = {}): Session[] {
  const now = Date.now();
  const rangeStart = options.rangeStart ?? new Date(now - 90 * DAY_MS);
  const rangeEnd = options.rangeEnd ?? new Date(now + 400 * DAY_MS);

  let calendar: ICAL.Component;
  try {
    calendar = new ICAL.Component(ICAL.parse(text));
  } catch {
    throw new IcsParseError("Le fichier reçu n'est pas un calendrier iCalendar valide.");
  }
  if (calendar.name !== "vcalendar") {
    throw new IcsParseError("Le fichier reçu ne contient pas de VCALENDAR.");
  }

  // Un événement récurrent = une série (le "master", avec RRULE) + des exceptions
  // (mêmes UID, avec RECURRENCE-ID) qui remplacent certaines occurrences.
  const masters: ICAL.Event[] = [];
  const exceptions: ICAL.Event[] = [];
  for (const vevent of calendar.getAllSubcomponents("vevent")) {
    const event = new ICAL.Event(vevent);
    if (!event.uid) continue; // un VEVENT sans UID est invalide : on l'ignore
    (event.isRecurrenceException() ? exceptions : masters).push(event);
  }

  const sessions: Session[] = [];
  const recurringUids = new Set<string>();

  for (const master of masters) {
    if (!master.isRecurring()) {
      sessions.push(toSession(master, master.startDate, master.endDate, null));
      continue;
    }
    recurringUids.add(master.uid);
    for (const exception of exceptions) {
      if (exception.uid === master.uid) master.relateException(exception);
    }
    const iterator = master.iterator();
    let count = 0;
    for (let next = iterator.next(); next && count < MAX_OCCURRENCES_PER_SERIES; next = iterator.next()) {
      count++;
      const details = master.getOccurrenceDetails(next);
      const start = toDate(details.startDate, tzidOf(details.item));
      if (start > rangeEnd) break;
      const end = toDate(details.endDate, tzidOf(details.item, "dtend"));
      if (end < rangeStart) continue;
      sessions.push(toSession(details.item, details.startDate, details.endDate, details.recurrenceId));
    }
  }

  // Exceptions dont la série n'est pas dans le fichier : on les garde comme séances isolées.
  for (const exception of exceptions) {
    if (!recurringUids.has(exception.uid)) {
      sessions.push(toSession(exception, exception.startDate, exception.endDate, exception.recurrenceId));
    }
  }

  dedupeKeys(sessions);
  return sessions.sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
}

function toSession(
  event: ICAL.Event,
  startTime: ICAL.Time,
  endTime: ICAL.Time,
  recurrenceId: ICAL.Time | null,
): Session {
  const start = toDate(startTime, tzidOf(event));
  let end = toDate(endTime, tzidOf(event, "dtend") ?? tzidOf(event));
  if (end < start) end = start;

  const recurrenceIso = recurrenceId ? toDate(recurrenceId, tzidOf(event, "recurrence-id")).toISOString() : null;
  const title = clean(event.summary) ?? "(Sans titre)";
  const description = clean(event.description);
  const status = String(event.component.getFirstPropertyValue("status") ?? "").toUpperCase();

  return {
    key: recurrenceIso ? `${event.uid}#${recurrenceIso}` : event.uid,
    uid: event.uid,
    recurrenceId: recurrenceIso,
    title,
    courseKey: courseKey(title),
    location: clean(event.location),
    teacher: extractTeacher(event, description),
    start: start.toISOString(),
    end: end.toISOString(),
    allDay: startTime.isDate,
    description,
    status: status === "CANCELLED" ? "cancelled" : "active",
  };
}

/** TZID déclaré sur une propriété de date (DTSTART par défaut), s'il y en a un. */
function tzidOf(event: ICAL.Event, property = "dtstart"): string | undefined {
  const value = event.component.getFirstProperty(property)?.getParameter("tzid");
  return typeof value === "string" ? value : undefined;
}

/**
 * Convertit une date iCal en instant JavaScript.
 *
 * Piège classique : si le fichier utilise un TZID sans fournir sa définition VTIMEZONE,
 * ical.js traite l'heure comme "flottante" et la convertirait comme si c'était de l'UTC,
 * soit un décalage de 1 à 2 h. On reconstruit alors l'heure nous-mêmes dans le bon fuseau
 * (le TZID s'il est un nom IANA connu, sinon Europe/Brussels).
 */
function toDate(time: ICAL.Time, tzid?: string): Date {
  if (time.isDate) {
    // Journée entière : minuit, heure de Bruxelles.
    return new Date(+new TZDate(time.year, time.month - 1, time.day, TIMEZONE));
  }
  const zone = time.zone;
  if (zone && (zone.tzid === "UTC" || zone.component)) {
    return new Date(time.toUnixTime() * 1000);
  }
  // new Date(+x) : on repasse en Date "classique" pour que toISOString() renvoie toujours de l'UTC ("…Z").
  return new Date(+new TZDate(time.year, time.month - 1, time.day, time.hour, time.minute, time.second, ianaZone(tzid)));
}

function ianaZone(tzid?: string): string {
  if (!tzid) return TIMEZONE;
  try {
    new Intl.DateTimeFormat("en", { timeZone: tzid });
    return tzid;
  } catch {
    return TIMEZONE; // ex. "Romance Standard Time" (nom Windows) : c'est l'heure belge
  }
}

const TEACHER_LINE =
  /^\s*(?:enseignant(?:e)?s?|professeur(?:e)?s?|profs?|chargée? de cours|titulaires?|teachers?)\s*[:\-–]\s*(.+?)\s*$/im;

/** L'enseignant n'a pas de champ standard en iCal : on regarde ORGANIZER (CN) puis la description. */
function extractTeacher(event: ICAL.Event, description: string | null): string | null {
  const cn = event.component.getFirstProperty("organizer")?.getParameter("cn");
  if (typeof cn === "string" && cn.trim()) return cn.trim();
  const match = description?.match(TEACHER_LINE);
  return match ? match[1] : null;
}

function clean(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Certains flux réutilisent un même UID pour plusieurs événements : on rend chaque clé unique. */
function dedupeKeys(sessions: Session[]) {
  const seen = new Map<string, number>();
  for (const session of sessions) {
    const n = seen.get(session.key) ?? 0;
    seen.set(session.key, n + 1);
    if (n > 0) session.key = `${session.key}#${session.start}`;
  }
}
