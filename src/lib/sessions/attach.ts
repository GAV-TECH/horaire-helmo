import { indexSessions, matchSession, type SessionRef } from "./match";

type Matchable = { key: string; courseKey: string; start: string };

/**
 * Range des éléments (notes, listes "séance") sous la clé de leur séance.
 * Ceux qui ne correspondent à aucune séance sont renvoyés à part : ce sont les orphelins.
 */
export function attachToSessions<T>(
  items: T[],
  refOf: (item: T) => SessionRef | null,
  sessions: Matchable[],
): { bySession: Map<string, T[]>; orphans: T[] } {
  const index = indexSessions(sessions);
  const bySession = new Map<string, T[]>();
  const orphans: T[] = [];
  for (const item of items) {
    const ref = refOf(item);
    if (!ref) continue;
    const match = matchSession(ref, index);
    if (!match) {
      orphans.push(item);
      continue;
    }
    bySession.set(match.session.key, [...(bySession.get(match.session.key) ?? []), item]);
  }
  return { bySession, orphans };
}
