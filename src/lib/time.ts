import { TZDate, tz } from "@date-fns/tz";
import { format as dfFormat } from "date-fns";
import { fr } from "date-fns/locale";

/** Fuseau unique de l'application : toutes les dates sont affichées et découpées en jours selon Bruxelles. */
export const TIMEZONE = "Europe/Brussels";

/** Contexte date-fns : les fonctions qui le reçoivent calculent "en heure de Bruxelles", quel que soit le fuseau du serveur ou du navigateur. */
export const inBrussels = tz(TIMEZONE);

/** Convertit une date (ou une chaîne ISO) en TZDate de Bruxelles : getHours(), getDay()… renvoient alors l'heure locale belge. */
export function toBrussels(date: Date | string | number): TZDate {
  return new TZDate(typeof date === "string" ? Date.parse(date) : +date, TIMEZONE);
}

/** Formate une date en français, heure de Bruxelles (ex. "lundi 6 octobre"). */
export function formatFr(date: Date | string | number, pattern: string): string {
  return dfFormat(toBrussels(date), pattern, { locale: fr, in: inBrussels });
}

/** Clé de jour "AAAA-MM-JJ" en heure de Bruxelles, pratique pour regrouper les séances par jour. */
export function dayKey(date: Date | string | number): string {
  return formatFr(date, "yyyy-MM-dd");
}
