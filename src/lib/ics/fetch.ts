import "server-only"; // fait échouer la compilation si ce module est importé côté navigateur
import { z } from "zod";
import { redactSecrets } from "./redact";

/** Erreur dont le message peut être montré tel quel à l'utilisateur (il ne contient jamais l'URL). */
export class IcsFetchError extends Error {}

const MAX_BYTES = 5 * 1024 * 1024; // un horaire annuel fait quelques centaines de Ko
const TIMEOUT_MS = 15_000;

export const icsUrlSchema = z
  .url({ protocol: /^https$/, error: "Le lien doit être une URL https valide." })
  .max(2000);

/**
 * Télécharge le flux .ics. Tourne uniquement côté serveur : le navigateur ne peut pas
 * appeler mon-espace.helmo.be directement (CORS), et le lien contient un token secret.
 */
export async function fetchIcs(url: string): Promise<string> {
  const parsed = icsUrlSchema.safeParse(url);
  if (!parsed.success) throw new IcsFetchError("Le lien de l'horaire est invalide.");

  let response: Response;
  try {
    response = await fetch(parsed.data, {
      headers: { Accept: "text/calendar, text/plain;q=0.9, */*;q=0.1" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store", // le cache est géré par nous (voir schedule-cache.ts)
      redirect: "follow",
    });
  } catch (error) {
    // Le message d'erreur réseau peut contenir l'URL : on le masque avant de le logger.
    console.error("[ics] échec réseau :", redactSecrets(String(error)));
    throw new IcsFetchError("Impossible de joindre le serveur de l'horaire. Réessaie dans un instant.");
  }

  if (response.status === 401 || response.status === 403 || response.status === 404) {
    throw new IcsFetchError("Le lien de l'horaire a été refusé : le token a peut-être été régénéré.");
  }
  if (!response.ok) {
    console.error("[ics] réponse HTTP", response.status);
    throw new IcsFetchError(`Le serveur de l'horaire a répondu avec une erreur (${response.status}).`);
  }

  const declaredSize = Number(response.headers.get("content-length") ?? 0);
  if (declaredSize > MAX_BYTES) throw new IcsFetchError("Le fichier d'horaire est anormalement volumineux.");

  const text = await response.text();
  if (text.length > MAX_BYTES) throw new IcsFetchError("Le fichier d'horaire est anormalement volumineux.");
  if (!text.includes("BEGIN:VCALENDAR")) {
    throw new IcsFetchError("La réponse reçue n'est pas un calendrier (.ics). Vérifie le lien.");
  }
  return text;
}
