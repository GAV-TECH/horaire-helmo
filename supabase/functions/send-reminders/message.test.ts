import { describe, expect, it } from "vitest";
import { buildDigest, buildNotification, formatRelative, formatWhen, type DigestRow, type DueReminder, buildMessageNotification, buildLinkNotification, buildTaskNotification, buildShareNotification } from "./message";

const NOW = new Date("2025-10-06T06:00:00Z"); // lundi 6 octobre, 08:00 à Bruxelles

const reminder = (overrides: Partial<DueReminder>): DueReminder => ({
  id: "r1",
  recipient_id: "u1",
  target_type: "session",
  target_title: "Réseaux",
  target_detail: "L2.05",
  target_at: "2025-10-06T07:00:00Z", // 09:00 à Bruxelles
  target_done: false,
  fire_at: "2025-10-06T06:00:00Z",
  ...overrides,
});

describe("formatage", () => {
  it("écrit les dates en heure de Bruxelles", () => {
    expect(formatWhen(new Date("2025-10-06T07:00:00Z"), NOW)).toBe("aujourd'hui à 09:00");
    expect(formatWhen(new Date("2025-10-07T12:30:00Z"), NOW)).toBe("demain à 14:30");
    expect(formatWhen(new Date("2025-12-01T08:00:00Z"), NOW)).toBe("lun. 1 déc. à 09:00"); // heure d'hiver
  });

  it("donne un délai lisible", () => {
    expect(formatRelative(new Date("2025-10-06T06:15:00Z"), NOW)).toBe("dans 15 min");
    expect(formatRelative(new Date("2025-10-06T08:00:00Z"), NOW)).toBe("dans 2 h");
    expect(formatRelative(new Date("2025-10-09T06:00:00Z"), NOW)).toBe("dans 3 jours");
    expect(formatRelative(new Date("2025-10-06T05:00:00Z"), NOW)).toBe("maintenant");
  });
});

describe("buildDigest", () => {
  const evening = new Date("2025-10-06T18:00:00Z"); // lundi 6 octobre, 20:00 à Bruxelles
  const row = (over: Partial<DigestRow> = {}): DigestRow => ({
    user_id: "u", done_today: 5, left_today: 2, tomorrow_tasks: 3, tomorrow_deadlines: 1, tomorrow_sessions: 4,
    tomorrow_first: "2025-10-07T06:15:00Z", next_eval_title: "Thermodynamique - évaluation / X / 413 (CO)", next_eval_at: "2025-10-09T07:00:00Z",
    ...over,
  });

  it("prépare demain (liste des tâches), résume aujourd'hui et signale le nouveau", () => {
    const d = row({ tomorrow_titles: ["Lire le chapitre 4", "Rendre le rapport", "Plan du pont"], unread_messages: 5, new_tasks: 1, pending_offers: 1 });
    expect(buildDigest(d, evening)).toEqual({
      title: "📋 Débrief du jour",
      body: [
        "Demain : 4 cours dès 08:15",
        "À faire pour demain (3) :",
        "• Lire le chapitre 4",
        "• Rendre le rapport",
        "• Plan du pont",
        "1 échéance demain",
        "Aujourd'hui : ✓ 5 faites · 2 en attente",
        "Nouveau : 5 messages non lus · 2 tâches reçues",
        "Évaluation de Thermodynamique dans 3 jours",
      ].join("\n"),
      url: "/rappels",
      tag: "debrief",
      sticky: true,
    });
  });

  it("nomme les projets où il y a du nouveau", () => {
    const projects = [
      { user_id: "u", list_id: "p1", title: "Pont", messages: 3, links: 1 },
      { user_id: "u", list_id: "p2", title: "Labo", messages: 0, links: 2 },
    ];
    expect(buildDigest(row({ unread_messages: 3 }), evening, projects).body).toContain("Nouveau : 3 messages non lus\n• Pont : 3 messages · 1 document\n• Labo : 2 documents\nÉvaluation");
  });

  it("n'écrit que 5 titres et résume le reste", () => {
    const titles = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const body = buildDigest(row({ tomorrow_tasks: 9, tomorrow_titles: titles }), evening).body;
    expect(body).toContain("À faire pour demain (9) :\n• a\n• b\n• c\n• d\n• e\n… et 4 autres");
    expect(body).not.toContain("• f");
  });

  it("reste lisible les jours calmes, et sans la migration 0016 (pas de titres)", () => {
    const calm = row({ done_today: 0, left_today: 0, tomorrow_tasks: 0, tomorrow_deadlines: 0, tomorrow_sessions: 0, tomorrow_first: null, next_eval_title: null, next_eval_at: null });
    expect(buildDigest(calm, evening).body).toBe("Demain : pas de cours\nRien à faire pour demain\nAujourd'hui : aucune tâche cochée");
    expect(buildDigest(row({ done_today: 1, tomorrow_sessions: 1 }), evening).body).toContain("Demain : 1 cours dès 08:15\nÀ faire pour demain : 3 tâches\n1 échéance demain\nAujourd'hui : ✓ 1 faite · 2 en attente");
  });
});

describe("buildNotification", () => {
  it("rappel de séance : cours, heure, délai et local", () => {
    expect(buildNotification(reminder({}), NOW)).toEqual({
      title: "Réseaux",
      body: "aujourd'hui à 09:00 (dans 1 h) · L2.05",
      url: "/",
      tag: "rappel-r1",
    });
  });

  it("rappel de deadline et de tâche", () => {
    const deadline = buildNotification(reminder({ target_type: "deadline", target_title: "Rapport", target_detail: "Réseaux" }), NOW);
    expect(deadline).toMatchObject({ title: "⚑ Rapport", body: "Échéance aujourd'hui à 09:00 (dans 1 h) · Réseaux", url: "/deadlines" });
    const todo = buildNotification(reminder({ target_type: "todo", target_title: "Lire", target_detail: "Révisions", target_at: null }), NOW);
    expect(todo).toMatchObject({ title: "☐ Lire", body: "Tâche à faire · Révisions", url: "/taches" });
  });

  it("n'envoie rien pour une cible faite ou annulée, ni pour un rappel trop ancien", () => {
    expect(buildNotification(reminder({ target_done: true }), NOW)).toBeNull();
    expect(buildNotification(reminder({ target_title: null }), NOW)).toBeNull();
    expect(buildNotification(reminder({ fire_at: "2025-10-05T12:00:00Z" }), NOW)).toBeNull();
  });
});

describe("buildMessageNotification", () => {
  const m = { message_id: "m1", recipient_id: "u2", list_id: "p1", project_title: "Pont", author_name: "Bob", body: "réunion\n demain ?" };
  it("projet en titre, auteur + texte, lien vers le projet, un tag par projet", () => {
    expect(buildMessageNotification(m)).toEqual({ title: "💬 Pont", body: "Bob : réunion demain ?", url: "/projets/p1", tag: "discussion-p1" });
  });
  it("coupe les longs messages", () => {
    const body = buildMessageNotification({ ...m, body: "x".repeat(500) }).body;
    expect(body.length).toBe("Bob : ".length + 140);
    expect(body.endsWith("…")).toBe(true);
  });
});

describe("buildLinkNotification", () => {
  it("projet en titre, qui a ajouté quoi, lien vers le projet", () => {
    const l = { link_id: "k1", recipient_id: "u2", list_id: "p1", project_title: "Pont", author_name: "Bob", title: "Rapport final" };
    expect(buildLinkNotification(l)).toEqual({ title: "📎 Pont", body: "Bob a ajouté un document : Rapport final", url: "/projets/p1", tag: "document-k1" });
  });
});

describe("buildTaskNotification", () => {
  const t = { item_id: "i1", recipient_id: "u2", list_id: "l1", list_title: "Courses", list_scope: "global", author_name: "Bob", title: "pain" };
  it("liste en titre, qui a ajouté quoi ; s'ouvre sur Tâches, ou sur le projet", () => {
    expect(buildTaskNotification(t)).toEqual({ title: "☐ Courses", body: "Bob a ajouté une tâche : pain", url: "/taches", tag: "tache-i1" });
    expect(buildTaskNotification({ ...t, list_scope: "project" }).url).toBe("/projets/l1");
  });
});

describe("buildShareNotification", () => {
  it("copie d'une tâche reçue", () => {
    expect(buildShareNotification({ kind: "offer", id: "o1", recipient_id: "u2", sender_name: "Alice", label: "lire chap. 4" })).toEqual({
      title: "📝 Tâche reçue",
      body: "Alice t'envoie une tâche : lire chap. 4",
      url: "/taches",
      tag: "copie-o1",
    });
  });
  it("demande de partage", () => {
    expect(buildShareNotification({ kind: "share", id: "s1", recipient_id: "u2", sender_name: "Alice", label: "toutes ses tâches" })).toEqual({
      title: "👥 Demande de partage",
      body: "Alice veut partager toutes ses tâches avec toi",
      url: "/taches",
      tag: "partage-s1",
    });
  });
});
