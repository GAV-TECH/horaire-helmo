import { formatFr } from "@/lib/time";

/** "lun. 6 oct. · 14:00" : format compact d'une échéance. */
export function formatDue(iso: string) {
  return formatFr(iso, "EEE d MMM · HH:mm");
}

/** "lundi 6 octobre, 08:30" : format d'une séance dans une phrase. */
export function formatSessionDate(iso: string) {
  return formatFr(iso, "EEEE d MMMM, HH:mm");
}
