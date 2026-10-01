import { courseGroupKey, parseCourseTitle } from "@/lib/courses";
import type { Session, SessionChanges, StoredSession } from "@/lib/ics/types";

/** Une ligne à écrire en base : avec `id` = mise à jour d'une séance connue, sans = nouvelle séance. */
export type SessionWrite = Session & { id?: string; changes: SessionChanges; changesSeen: boolean };

const DAY_MS = 24 * 60 * 60 * 1000;
/** Une séance qui apparaît dans ce délai est signalée comme "ajoutée" ; au-delà, c'est la publication normale des semaines suivantes. */
const ADDED_WINDOW_MS = 14 * DAY_MS;

/**
 * Anciens doublons en base : avant correction, la 2e copie d'une séance envoyée deux fois par HELMO
 * était enregistrée sous la clé "UID#début". On la reconnaît (même UID, même début, même intitulé
 * qu'une séance de clé "UID") pour la supprimer ; ses notes éventuelles sont recollées à l'originale.
 */
export function legacyDuplicates(previous: StoredSession[]): { duplicateId: string; originalId: string }[] {
  const originals = new Map(previous.map((p) => [`${p.key}|${p.start}|${p.title}`, p.id]));
  return previous.flatMap((p) => {
    const originalId = p.key === `${p.uid}#${p.start}` ? originals.get(`${p.uid}|${p.start}|${p.title}`) : undefined;
    return originalId ? [{ duplicateId: p.id, originalId }] : [];
  });
}

/** Clé de secours : même cours, même heure de début. Sert quand l'UID d'une séance change. */
export function fallbackKey(courseKey: string, start: string): string {
  return `${courseKey}|${new Date(start).toISOString()}`;
}

/**
 * Compare l'horaire déjà en base avec celui qu'on vient de télécharger et renvoie
 * uniquement les lignes à écrire. Fonction pure : aucun accès réseau ni base, donc testable.
 *
 * Règles :
 * - séance retrouvée (par UID, sinon par cours + début) → mise à jour ; on note si elle a
 *   été déplacée, changée de local ou annulée ;
 * - séance disparue + séance apparue du même cours et du même type à moins de 30 jours → déplacée ;
 * - séance nouvelle → insérée (signalée "ajoutée" si elle a lieu dans les 14 jours) ;
 * - séance future disparue du flux → marquée "retirée" (jamais supprimée : ses tâches restent) ;
 *   "annulée" est réservé aux séances que HELMO marque lui-même STATUS:CANCELLED ;
 * - les séances passées ne sont jamais signalées.
 */
export function diffSessions(previous: StoredSession[], incoming: Session[], now: Date): SessionWrite[] {
  const nowIso = now.toISOString();
  const addedLimit = new Date(now.getTime() + ADDED_WINDOW_MS).toISOString();
  const firstSync = previous.length === 0;

  const incomingKeys = new Set(incoming.map((s) => s.key));
  const byKey = new Map(previous.map((p) => [p.key, p]));
  // Le secours ne concerne que les séances dont l'UID a disparu du nouveau flux.
  const byFallback = new Map<string, StoredSession>();
  for (const p of previous) {
    if (!incomingKeys.has(p.key)) byFallback.set(fallbackKey(p.courseKey, p.start), p);
  }

  const matched = new Set<string>();
  const writes: SessionWrite[] = [];

  /** Met à jour une séance connue avec sa nouvelle version, en notant ce qui a changé. */
  const update = (prev: StoredSession, session: Session) => {
    matched.add(prev.id);
    const changes = computeChanges(prev, session, nowIso);
    const hasChanges = Object.keys(changes).length > 0;
    const unseen = hasNewChange(prev.changes, changes) || (session.end > nowIso && visiblyDifferent(prev, session));
    const changesSeen = !hasChanges || (prev.changesSeen && !unseen);
    const row: SessionWrite = { ...session, id: prev.id, changes, changesSeen };
    if (!sameRow(prev, row)) writes.push(row);
  };

  // 1. Séances retrouvées par UID, sinon par cours + heure de début.
  const unmatched: Session[] = [];
  for (const session of incoming) {
    let prev = byKey.get(session.key);
    if (!prev) {
      const candidate = byFallback.get(fallbackKey(session.courseKey, session.start));
      if (candidate && !matched.has(candidate.id)) prev = candidate;
    }
    if (prev) update(prev, session);
    else unmatched.push(session);
  }

  // 2. Déplacements : HELMO supprime parfois une séance et en recrée une autre (nouvel UID) à une
  //    autre date. Même cours, même type, à moins de 30 jours → c'est la même séance, déplacée.
  const gone = previous.filter((p) => !matched.has(p.id) && p.status !== "cancelled" && p.end > nowIso);
  for (const session of [...unmatched].sort((a, b) => (a.start < b.start ? -1 : 1))) {
    const candidate = session.end > nowIso ? closestMoveCandidate(session, gone.filter((p) => !matched.has(p.id))) : null;
    if (candidate) {
      update(candidate, session);
      continue;
    }
    const added = !firstSync && session.end > nowIso && session.start < addedLimit;
    writes.push({ ...session, changes: added ? { added: true } : {}, changesSeen: !added });
  }

  // 3. Séances futures disparues du flux : "retirées" (jamais supprimées : leurs tâches restent).
  //    Un flux vide est sans doute une erreur passagère : on ne retire rien dans ce cas.
  if (incoming.length > 0) {
    // Anciennes données : avant la distinction annulée / retirée, une séance disparue était notée
    // "annulée". Une séance vraiment annulée par HELMO reste dans le flux : absente = retirée.
    for (const prev of previous) {
      if (matched.has(prev.id) || !prev.changes.cancelled || prev.status !== "cancelled" || prev.end <= nowIso) continue;
      const changes: SessionChanges = { ...prev.changes, removed: true };
      delete changes.cancelled;
      writes.push({ ...toSession(prev), id: prev.id, changes, changesSeen: prev.changesSeen });
    }
    for (const prev of gone) {
      if (matched.has(prev.id)) continue;
      writes.push({
        ...toSession(prev),
        id: prev.id,
        status: "cancelled",
        changes: { ...prev.changes, removed: true },
        changesSeen: false,
      });
    }
  }

  return writes;
}

const MOVE_WINDOW_MS = 30 * DAY_MS;

/** Identité d'une séance pour détecter un déplacement : cours (malgré les variantes) + type de séance. */
function sessionIdentity(title: string): string {
  return `${courseGroupKey(title)}|${parseCourseTitle(title).kind ?? ""}`;
}

/** Parmi les séances disparues, celle du même cours et du même type la plus proche dans le temps (≤ 30 jours). */
function closestMoveCandidate(session: Session, gone: StoredSession[]): StoredSession | null {
  const identity = sessionIdentity(session.title);
  let best: StoredSession | null = null;
  let bestGap = Infinity;
  for (const p of gone) {
    if (sessionIdentity(p.title) !== identity) continue;
    const gap = Math.abs(Date.parse(p.start) - Date.parse(session.start));
    if (gap <= MOVE_WINDOW_MS && gap < bestGap) {
      best = p;
      bestGap = gap;
    }
  }
  return best;
}

function computeChanges(prev: StoredSession, next: Session, nowIso: string): SessionChanges {
  if (prev.end <= nowIso && next.end <= nowIso) return prev.changes; // le passé ne nous intéresse plus

  const changes: SessionChanges = { ...prev.changes };

  // On compare toujours à l'horaire D'ORIGINE : si une séance déplacée revient à sa place, le badge disparaît.
  const fromStart = prev.changes.moved?.fromStart ?? prev.start;
  const fromEnd = prev.changes.moved?.fromEnd ?? prev.end;
  if (next.start !== fromStart || next.end !== fromEnd) changes.moved = { fromStart, fromEnd };
  else delete changes.moved;

  const fromRoom = prev.changes.room ? prev.changes.room.from : prev.location;
  if (next.location !== fromRoom) changes.room = { from: fromRoom };
  else delete changes.room;

  if (next.status === "cancelled") changes.cancelled = true;
  else delete changes.cancelled;
  delete changes.removed; // elle est de nouveau dans le flux

  return changes;
}

/** Vrai si `next` contient un changement que l'utilisateur n'a pas encore pu voir. */
function hasNewChange(prev: SessionChanges, next: SessionChanges): boolean {
  return (Object.keys(next) as (keyof SessionChanges)[]).some(
    (k) => JSON.stringify(prev[k]) !== JSON.stringify(next[k]),
  );
}

/** Ex. local A → B alors qu'il était déjà signalé "changé depuis L2.05" : c'est une nouvelle info pour l'étudiant. */
function visiblyDifferent(prev: Session, next: Session): boolean {
  return prev.start !== next.start || prev.end !== next.end || prev.location !== next.location || prev.status !== next.status;
}

function toSession(s: StoredSession): Session {
  return Object.fromEntries(COMPARED.map((k) => [k, s[k]])) as Session;
}

const COMPARED: (keyof Session)[] = [
  "key", "uid", "recurrenceId", "title", "courseKey", "location", "teacher",
  "start", "end", "allDay", "description", "status",
];

function sameRow(prev: StoredSession, row: SessionWrite): boolean {
  return (
    COMPARED.every((k) => prev[k] === row[k]) &&
    prev.changesSeen === row.changesSeen &&
    JSON.stringify(prev.changes) === JSON.stringify(row.changes)
  );
}
