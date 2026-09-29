import { fallbackKey } from "./diff";

/** Référence vers une séance, stockée par les notes et les listes "séance". */
export type SessionRef = { sessionKey: string; courseKey: string; sessionStart: string };

type Matchable = { key: string; courseKey: string; start: string };

export type SessionIndex<S extends Matchable> = { byKey: Map<string, S>; byFallback: Map<string, S> };

export function indexSessions<S extends Matchable>(sessions: S[]): SessionIndex<S> {
  return {
    byKey: new Map(sessions.map((s) => [s.key, s])),
    byFallback: new Map(sessions.map((s) => [fallbackKey(s.courseKey, s.start), s])),
  };
}

/**
 * Retrouve la séance d'une note (ou d'une liste) :
 * 1. par UID (session_key) ;
 * 2. sinon par cours + heure de début → `relinked: true` (il faudra mettre à jour la référence) ;
 * 3. sinon null → la note est "orpheline", mais elle n'est pas perdue.
 */
export function matchSession<S extends Matchable>(
  ref: SessionRef,
  index: SessionIndex<S>,
): { session: S; relinked: boolean } | null {
  const direct = index.byKey.get(ref.sessionKey);
  if (direct) return { session: direct, relinked: false };
  const fallback = index.byFallback.get(fallbackKey(ref.courseKey, ref.sessionStart));
  if (fallback) return { session: fallback, relinked: true };
  return null;
}
