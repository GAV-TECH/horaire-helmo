/**
 * Une séance de cours telle qu'extraite du flux iCalendar.
 * Ce type est sérialisé en JSON vers le navigateur : les dates sont donc des chaînes ISO (UTC).
 */
export type Session = {
  /** Identifiant stable de l'occurrence : UID, suffixé du RECURRENCE-ID pour les événements récurrents. */
  key: string;
  uid: string;
  /** RECURRENCE-ID en ISO si l'occurrence fait partie d'une série, sinon null. */
  recurrenceId: string | null;
  /** Nom du cours tel qu'affiché (SUMMARY). */
  title: string;
  /** Nom du cours normalisé (minuscules, sans accents) : sert aux couleurs et aux correspondances. */
  courseKey: string;
  location: string | null;
  teacher: string | null;
  /** Début et fin en ISO UTC. */
  start: string;
  end: string;
  allDay: boolean;
  /** Description brute du flux, non interprétée. */
  description: string | null;
  status: "active" | "cancelled";
};

/** Changements détectés entre deux synchros ; les valeurs "from" sont celles d'origine. */
export type SessionChanges = {
  moved?: { fromStart: string; fromEnd: string };
  room?: { from: string | null };
  cancelled?: true;
  /** Séance apparue à la dernière minute (dans les 14 prochains jours). */
  added?: true;
};

/** Séance telle que stockée en base, avec son historique de changements. */
export type StoredSession = Session & {
  id: string;
  changes: SessionChanges;
  /** false tant que l'utilisateur n'a pas vu le dernier changement (badge affiché). */
  changesSeen: boolean;
};
