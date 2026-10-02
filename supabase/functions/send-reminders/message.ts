/**
 * Texte des notifications de rappel. Fonction pure (sans réseau), partagée entre
 * l'Edge Function et les tests. Les dates sont écrites en français, heure de Bruxelles,
 * sans dépendre du format Intl de l'environnement (Deno et Node diffèrent parfois).
 */

export type DueReminder = {
  id: string;
  /** Destinataire : l'auteur, ou chaque membre du groupe pour un rappel partagé. */
  recipient_id: string;
  target_type: "session" | "deadline" | "todo";
  target_title: string | null;
  target_detail: string | null;
  target_at: string | null;
  target_done: boolean;
  fire_at: string;
};

export type NotificationPayload = { title: string; body: string; url: string; tag: string };

const TIMEZONE = "Europe/Brussels";
/** Un rappel en retard de plus de 12 h (panne, serveur arrêté) n'est plus envoyé : il serait trompeur. */
export const STALE_AFTER_MS = 12 * 60 * 60 * 1000;

const DAYS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

/** Composantes d'une date à Bruxelles. */
function brussels(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const [y, m, d] = [get("year"), get("month"), get("day")];
  return { y, m, d, hour: get("hour"), minute: get("minute"), weekday: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}

const pad = (n: number) => String(n).padStart(2, "0");

export function formatTime(date: Date) {
  const b = brussels(date);
  return `${pad(b.hour)}:${pad(b.minute)}`;
}

/** "lun. 6 oct. à 14:00", ou "aujourd'hui à 14:00" / "demain à 14:00". */
export function formatWhen(date: Date, now: Date) {
  const b = brussels(date);
  const dayNumber = (x: { y: number; m: number; d: number }) => Date.UTC(x.y, x.m - 1, x.d) / 86_400_000;
  const diffDays = dayNumber(b) - dayNumber(brussels(now));
  const day = diffDays === 0 ? "aujourd'hui" : diffDays === 1 ? "demain" : `${DAYS[b.weekday]} ${b.d} ${MONTHS[b.m - 1]}`;
  return `${day} à ${pad(b.hour)}:${pad(b.minute)}`;
}

/** "dans 15 min", "dans 2 h", "dans 3 jours". */
export function formatRelative(target: Date, now: Date) {
  const minutes = Math.round((target.getTime() - now.getTime()) / 60_000);
  if (minutes <= 0) return "maintenant";
  if (minutes < 60) return `dans ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `dans ${hours} h`;
  const days = Math.round(hours / 24);
  return `dans ${days} jour${days > 1 ? "s" : ""}`;
}

/** Bilan du jour renvoyé par claim_daily_digests() (une ligne par étudiant). */
export type DigestRow = {
  user_id: string;
  done_today: number;
  left_today: number;
  tomorrow_tasks: number;
  tomorrow_deadlines: number;
  tomorrow_sessions: number;
  tomorrow_first: string | null;
  next_eval_title: string | null;
  next_eval_at: string | null;
};

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;

/** "Thermodynamique - évaluation / KELNER / 413 (CO)" → "Thermodynamique". */
function courseOf(title: string) {
  return title.split(/\s+\/\s+/)[0].replace(/\s*(?::|\s-\s)\s*[ée]valuation\s*$/i, "").trim();
}

/** Débrief du soir : ce qui a été fait, ce qui reste, et ce qui attend demain. */
export function buildDigest(d: DigestRow, now: Date): NotificationPayload {
  const lines: string[] = [];
  lines.push(d.done_today > 0 ? `✓ ${plural(d.done_today, "tâche")} faite${d.done_today > 1 ? "s" : ""} aujourd'hui` : "Aucune tâche cochée aujourd'hui");
  if (d.left_today > 0) lines.push(`${d.left_today} encore à faire`);
  lines.push(
    d.tomorrow_sessions > 0 && d.tomorrow_first
      ? `Demain : ${d.tomorrow_sessions} cours dès ${formatTime(new Date(d.tomorrow_first))}` // "cours" est invariable
      : "Demain : pas de cours",
  );
  const forTomorrow = [
    d.tomorrow_tasks > 0 ? plural(d.tomorrow_tasks, "tâche") : null,
    d.tomorrow_deadlines > 0 ? plural(d.tomorrow_deadlines, "échéance") : null,
  ].filter(Boolean);
  if (forTomorrow.length) lines.push(`Pour demain : ${forTomorrow.join(" et ")}`);
  if (d.next_eval_title && d.next_eval_at) {
    lines.push(`Évaluation de ${courseOf(d.next_eval_title)} ${formatRelative(new Date(d.next_eval_at), now)}`);
  }
  return { title: "Débrief de ta journée", body: lines.join("\n"), url: "/taches", tag: "debrief" };
}

/** Construit la notification, ou null s'il ne faut rien envoyer (cible faite/annulée, rappel trop ancien). */
export function buildNotification(r: DueReminder, now: Date): NotificationPayload | null {
  if (r.target_done || r.target_title === null) return null;
  if (now.getTime() - new Date(r.fire_at).getTime() > STALE_AFTER_MS) return null;

  const at = r.target_at ? new Date(r.target_at) : null;
  const tag = `rappel-${r.id}`; // même tag = une notification remplace la précédente au lieu de s'empiler

  if (r.target_type === "session") {
    const when = at ? `${formatWhen(at, now)} (${formatRelative(at, now)})` : "";
    return { title: r.target_title, body: [when, r.target_detail].filter(Boolean).join(" · "), url: "/", tag };
  }
  if (r.target_type === "deadline") {
    const when = at ? `Échéance ${formatWhen(at, now)} (${formatRelative(at, now)})` : "Deadline";
    return { title: `⚑ ${r.target_title}`, body: [when, r.target_detail].filter(Boolean).join(" · "), url: "/deadlines", tag };
  }
  const when = at ? `Échéance ${formatWhen(at, now)}` : "Tâche à faire";
  return { title: `☐ ${r.target_title}`, body: [when, r.target_detail].filter(Boolean).join(" · "), url: "/taches", tag };
}

/** Une ligne de claim_message_notifications : un message de discussion, pour un destinataire. */
export type MessageRow = {
  message_id: string;
  recipient_id: string;
  list_id: string;
  project_title: string;
  author_name: string;
  body: string;
};

/**
 * Notification d'un message de discussion de projet. Le tag est par projet : sur le téléphone,
 * un nouveau message remplace le précédent du même projet au lieu d'empiler les notifications.
 */
export function buildMessageNotification(m: MessageRow): NotificationPayload {
  const text = m.body.replace(/\s+/g, " ").trim();
  return {
    title: `💬 ${m.project_title}`,
    body: `${m.author_name} : ${text.length > 140 ? `${text.slice(0, 139)}…` : text}`,
    url: `/projets/${m.list_id}`,
    tag: `discussion-${m.list_id}`,
  };
}
