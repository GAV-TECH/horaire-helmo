import "server-only";
import { fetchIcs } from "@/lib/ics/fetch";
import { parseIcs } from "@/lib/ics/parse";
import type { Session } from "@/lib/ics/types";

/**
 * Phase 1 : cache en mémoire du serveur, une seule entrée (un seul horaire, celui d'ICS_URL).
 * En phase 2, les séances seront stockées en base par utilisateur ; ce cache disparaîtra.
 */
export const CACHE_TTL_MS = 5 * 60 * 1000;
/** Délai minimal entre deux actualisations forcées, pour ne pas surcharger le serveur de l'école. */
const MIN_FORCED_REFRESH_MS = 30 * 1000;

type Snapshot = { sessions: Session[]; syncedAt: number };

let snapshot: Snapshot | null = null;
/** Si une synchro est déjà en cours, les autres requêtes attendent la même promesse au lieu d'en relancer une. */
let inFlight: Promise<Snapshot> | null = null;

export async function getSchedule(url: string, { force = false } = {}): Promise<Snapshot & { fromCache: boolean }> {
  const age = snapshot ? Date.now() - snapshot.syncedAt : Infinity;
  const fresh = age < (force ? MIN_FORCED_REFRESH_MS : CACHE_TTL_MS);
  if (snapshot && fresh) return { ...snapshot, fromCache: true };

  inFlight ??= (async () => {
    try {
      const text = await fetchIcs(url);
      snapshot = { sessions: parseIcs(text), syncedAt: Date.now() };
      return snapshot;
    } finally {
      inFlight = null;
    }
  })();
  return { ...(await inFlight), fromCache: false };
}
