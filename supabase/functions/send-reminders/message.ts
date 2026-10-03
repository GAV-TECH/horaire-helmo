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

/** sticky : la notification reste affichée jusqu'à ce qu'on la ferme (là où le système le permet). */
export type NotificationPayload = { title: string; body: string; url: string; tag: string; sticky?: boolean };

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
  // Ajoutés par la migration 0016 (absents tant qu'elle n'est pas exécutée).
  tomorrow_titles?: string[] | null;
  unread_messages?: number | null;
  new_tasks?: number | null;
  pending_offers?: number | null;
};

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;

/** "Thermodynamique - évaluation / KELNER / 413 (CO)" → "Thermodynamique". */
function courseOf(title: string) {
  return title.split(/\s+\/\s+/)[0].replace(/\s*(?::|\s-\s)\s*[ée]valuation\s*$/i, "").trim();
}

/** Combien de titres de tâches on écrit dans la notification (le reste est résumé en « … et N autres »). */
const DIGEST_TITLES = 5;

/**
 * Débrief quotidien, dans l'ordre d'utilité : ce qui attend DEMAIN (cours, liste des tâches,
 * échéances), puis le bilan d'AUJOURD'HUI (fait / en attente), ce qui est arrivé de NOUVEAU
 * (messages non lus, tâches reçues) et la prochaine évaluation.
 */
export function buildDigest(d: DigestRow, now: Date): NotificationPayload {
  const lines: string[] = [];
  lines.push(
    d.tomorrow_sessions > 0 && d.tomorrow_first
      ? `Demain : ${d.tomorrow_sessions} cours dès ${formatTime(new Date(d.tomorrow_first))}` // "cours" est invariable
      : "Demain : pas de cours",
  );

  const titles = (d.tomorrow_titles ?? []).slice(0, DIGEST_TITLES);
  if (d.tomorrow_tasks === 0) lines.push("Rien à faire pour demain");
  else if (titles.length === 0) lines.push(`À faire pour demain : ${plural(d.tomorrow_tasks, "tâche")}`);
  else {
    lines.push(`À faire pour demain (${d.tomorrow_tasks}) :`);
    for (const title of titles) lines.push(`• ${title.length > 60 ? `${title.slice(0, 59)}…` : title}`);
    const more = d.tomorrow_tasks - titles.length;
    if (more > 0) lines.push(`… et ${more} autre${more > 1 ? "s" : ""}`);
  }
  if (d.tomorrow_deadlines > 0) lines.push(`${plural(d.tomorrow_deadlines, "échéance")} demain`);

  const today = [
    d.done_today > 0 ? `✓ ${d.done_today} faite${d.done_today > 1 ? "s" : ""}` : "aucune tâche cochée",
    d.left_today > 0 ? `${d.left_today} en attente` : null,
  ].filter(Boolean);
  lines.push(`Aujourd'hui : ${today.join(" · ")}`);

  const unread = d.unread_messages ?? 0;
  const received = (d.new_tasks ?? 0) + (d.pending_offers ?? 0);
  const news = [
    unread > 0 ? `${unread} message${unread > 1 ? "s" : ""} non lu${unread > 1 ? "s" : ""}` : null,
    received > 0 ? `${received} tâche${received > 1 ? "s" : ""} reçue${received > 1 ? "s" : ""}` : null,
  ].filter(Boolean);
  if (news.length) lines.push(`Nouveau : ${news.join(" · ")}`);

  if (d.next_eval_title && d.next_eval_at) {
    lines.push(`Évaluation de ${courseOf(d.next_eval_title)} ${formatRelative(new Date(d.next_eval_at), now)}`);
  }
  return { title: "📋 Débrief du jour", body: lines.join("\n"), url: "/taches", tag: "debrief", sticky: true };
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

/** Une ligne de claim_link_notifications : un document ajouté à un projet, pour un destinataire. */
export type LinkRow = { link_id: string; recipient_id: string; list_id: string; project_title: string; author_name: string; title: string };

/** Notification d'un document ajouté. Tag par document : deux ajouts ne se remplacent pas. */
export function buildLinkNotification(l: LinkRow): NotificationPayload {
  return {
    title: `📎 ${l.project_title}`,
    body: `${l.author_name} a ajouté un document : ${l.title}`,
    url: `/projets/${l.list_id}`,
    tag: `document-${l.link_id}`,
  };
}

/** Une ligne de claim_task_notifications : une tâche ajoutée à une liste partagée, pour un destinataire. */
export type TaskRow = {
  item_id: string;
  recipient_id: string;
  list_id: string;
  list_title: string;
  list_scope: string;
  author_name: string;
  title: string;
};

/** Notification d'une tâche ajoutée à une liste partagée. Un projet s'ouvre sur sa page, le reste sur Tâches. */
export function buildTaskNotification(t: TaskRow): NotificationPayload {
  return {
    title: `☐ ${t.list_title}`,
    body: `${t.author_name} a ajouté une tâche : ${t.title}`,
    url: t.list_scope === "project" ? `/projets/${t.list_id}` : "/taches",
    tag: `tache-${t.item_id}`,
  };
}

/** Une ligne de claim_share_notifications : copie d'une tâche reçue ("offer") ou demande de partage ("share"). */
export type ShareRow = { kind: "offer" | "share"; id: string; recipient_id: string; sender_name: string; label: string };

/** Notification d'un partage reçu. Dans les deux cas, la réponse se donne dans le bandeau en haut de l'app. */
export function buildShareNotification(s: ShareRow): NotificationPayload {
  return s.kind === "offer"
    ? { title: "📝 Tâche reçue", body: `${s.sender_name} t'envoie une tâche : ${s.label}`, url: "/taches", tag: `copie-${s.id}` }
    : { title: "👥 Demande de partage", body: `${s.sender_name} veut partager ${s.label} avec toi`, url: "/taches", tag: `partage-${s.id}` };
}
