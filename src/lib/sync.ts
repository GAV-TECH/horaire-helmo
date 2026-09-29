import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret } from "@/lib/crypto";
import { dbError, loadSessions } from "@/lib/data/queries";
import { serverEnv } from "@/lib/env";
import { IcsFetchError, fetchIcs } from "@/lib/ics/fetch";
import { IcsParseError, parseIcs } from "@/lib/ics/parse";
import { redactSecrets } from "@/lib/ics/redact";
import type { StoredSession } from "@/lib/ics/types";
import { diffSessions, legacyDuplicates, type SessionWrite } from "@/lib/sessions/diff";
import { indexSessions, matchSession } from "@/lib/sessions/match";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SyncResult } from "@/lib/sync-types";
import { isAllowedIcsUrl } from "@/lib/validation";

export const SYNC_TTL_MS = 5 * 60 * 1000;
/** Délai minimal entre deux actualisations forcées, pour ne pas surcharger le serveur de l'école. */
const MIN_FORCED_REFRESH_MS = 30 * 1000;

export type { SyncResult };

/** Une synchro en cours par utilisateur : les appels simultanés partagent la même promesse. */
const inFlight = new Map<string, Promise<SyncResult>>();

/**
 * Synchronise l'horaire d'un utilisateur si le cache (5 min) est périmé, ou si `force`.
 * Tourne avec le client admin : c'est le seul endroit qui lit le lien .ics et écrit les séances.
 */
export function syncSchedule(userId: string, { force = false } = {}): Promise<SyncResult> {
  const running = inFlight.get(userId);
  if (running) return running;
  const promise = run(userId, force).finally(() => inFlight.delete(userId));
  inFlight.set(userId, promise);
  return promise;
}

async function run(userId: string, force: boolean): Promise<SyncResult> {
  const admin = createAdminClient();
  const { data: source, error } = await admin
    .from("ics_sources")
    .select("url_encrypted, last_synced_at, last_error")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw dbError(error, "sync");
  if (!source) return { status: "no-source", syncedAt: null, error: null };

  const age = source.last_synced_at ? Date.now() - Date.parse(source.last_synced_at) : Infinity;
  if (age < (force ? MIN_FORCED_REFRESH_MS : SYNC_TTL_MS)) {
    return { status: "fresh", syncedAt: source.last_synced_at, error: source.last_error };
  }

  const now = new Date();
  try {
    const env = serverEnv();
    const url = decryptSecret(source.url_encrypted, env.ICS_ENCRYPTION_KEY);
    if (!isAllowedIcsUrl(url, env.ICS_ALLOWED_HOSTS)) {
      throw new IcsFetchError("Le lien enregistré n'est pas un lien HELMO autorisé. Remplace-le dans les paramètres.");
    }
    const incoming = parseIcs(await fetchIcs(url));
    const previous = await removeLegacyDuplicates(admin, userId, await loadSessions(admin, userId));
    const writes = diffSessions(previous, incoming, now);
    await writeSessions(admin, userId, writes);
    await relinkReferences(admin, userId, merge(previous, writes));

    await admin.from("ics_sources").update({ last_synced_at: now.toISOString(), last_error: null }).eq("user_id", userId);
    return { status: "synced", syncedAt: now.toISOString(), error: null };
  } catch (e) {
    const known = e instanceof IcsFetchError || e instanceof IcsParseError;
    if (!known) console.error("[sync] erreur :", redactSecrets(String(e)));
    const message = known ? e.message : "Erreur inattendue pendant la synchronisation.";
    // On enregistre aussi l'heure de l'échec : sans ça, chaque chargement de page réessaierait.
    await admin.from("ics_sources").update({ last_synced_at: now.toISOString(), last_error: message }).eq("user_id", userId);
    return { status: "error", syncedAt: source.last_synced_at, error: message };
  }
}

/**
 * Supprime les copies en double enregistrées avant la correction du parsing (HELMO envoie chaque
 * séance deux fois). Les rappels posés sur une copie sont d'abord rattachés à l'originale ; les notes
 * le sont ensuite par relinkReferences (même cours, même heure). Renvoie les séances restantes.
 */
async function removeLegacyDuplicates(admin: SupabaseClient, userId: string, previous: StoredSession[]) {
  const duplicates = legacyDuplicates(previous);
  if (duplicates.length === 0) return previous;
  for (const { duplicateId, originalId } of duplicates) {
    const { error } = await admin.from("reminders").update({ session_id: originalId }).eq("session_id", duplicateId).eq("user_id", userId);
    if (error) throw dbError(error, "sync.duplicates.reminders");
  }
  const ids = duplicates.map((d) => d.duplicateId);
  for (let i = 0; i < ids.length; i += 200) {
    const { error } = await admin.from("sessions").delete().in("id", ids.slice(i, i + 200)).eq("user_id", userId);
    if (error) throw dbError(error, "sync.duplicates");
  }
  const removed = new Set(ids);
  return previous.filter((p) => !removed.has(p.id));
}

function toRow(userId: string, s: SessionWrite) {
  return {
    ...(s.id ? { id: s.id } : {}),
    user_id: userId,
    key: s.key,
    uid: s.uid,
    recurrence_id: s.recurrenceId,
    title: s.title,
    course_key: s.courseKey,
    location: s.location,
    teacher: s.teacher,
    start_at: s.start,
    end_at: s.end,
    all_day: s.allDay,
    description: s.description,
    status: s.status,
    changes: s.changes,
    changes_seen: s.changesSeen,
    updated_at: new Date().toISOString(),
  };
}

async function writeSessions(admin: SupabaseClient, userId: string, writes: SessionWrite[]) {
  const updates = writes.filter((w) => w.id).map((w) => toRow(userId, w));
  const inserts = writes.filter((w) => !w.id).map((w) => toRow(userId, w));
  for (let i = 0; i < updates.length; i += 500) {
    const { error } = await admin.from("sessions").upsert(updates.slice(i, i + 500)); // conflit sur l'id → mise à jour
    if (error) throw dbError(error, "sync");
  }
  for (let i = 0; i < inserts.length; i += 500) {
    const { error } = await admin.from("sessions").insert(inserts.slice(i, i + 500));
    if (error) throw dbError(error, "sync");
  }
}

/** État des séances après écriture (anciennes mises à jour + nouvelles), pour recoller les notes. */
function merge(previous: StoredSession[], writes: SessionWrite[]) {
  const byId = new Map<string, { key: string; courseKey: string; start: string }>(previous.map((p) => [p.id, p]));
  const added: { key: string; courseKey: string; start: string }[] = [];
  for (const w of writes) {
    if (w.id) byId.set(w.id, w);
    else added.push(w);
  }
  return [...byId.values(), ...added];
}

/**
 * Si une séance a changé d'UID, ses notes et listes pointent vers l'ancien :
 * on les "recolle" au nouvel UID grâce au cours + heure de début.
 */
async function relinkReferences(
  admin: SupabaseClient,
  userId: string,
  sessions: { key: string; courseKey: string; start: string }[],
) {
  const index = indexSessions(sessions);
  for (const table of ["notes", "todo_lists"] as const) {
    const { data, error } = await admin
      .from(table)
      .select("id, session_key, course_key, session_start")
      .eq("user_id", userId)
      .not("session_key", "is", null);
    if (error) throw dbError(error, "sync");
    for (const ref of data ?? []) {
      const match = matchSession(
        { sessionKey: ref.session_key, courseKey: ref.course_key, sessionStart: ref.session_start },
        index,
      );
      if (match?.relinked) {
        await admin.from(table).update({ session_key: match.session.key }).eq("id", ref.id).eq("user_id", userId);
      }
    }
  }
}
