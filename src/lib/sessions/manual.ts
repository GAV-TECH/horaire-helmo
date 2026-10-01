/**
 * Plage horaire ajoutée à la main (sport, job, rendez-vous…) : une ligne de `sessions` comme
 * les autres — tâches, rappels et vues fonctionnent sans rien changer — reconnue à sa clé.
 * Un UID HELMO ne commence jamais par ce préfixe.
 */
export const MANUAL_PREFIX = "perso:";

export const isManualSession = (s: { key: string }) => s.key.startsWith(MANUAL_PREFIX);
