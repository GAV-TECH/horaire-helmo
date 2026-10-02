import { describe, expect, it } from "vitest";
import { buildDigest, buildNotification, formatRelative, formatWhen, type DigestRow, type DueReminder, buildMessageNotification } from "./message";

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

  it("résume la journée et prépare demain", () => {
    expect(buildDigest(row(), evening)).toEqual({
      title: "Débrief de ta journée",
      body: [
        "✓ 5 tâches faites aujourd'hui",
        "2 encore à faire",
        "Demain : 4 cours dès 08:15",
        "Pour demain : 3 tâches et 1 échéance",
        "Évaluation de Thermodynamique dans 3 jours",
      ].join("\n"),
      url: "/taches",
      tag: "debrief",
    });
  });

  it("reste lisible les jours calmes", () => {
    const body = buildDigest(row({ done_today: 0, left_today: 0, tomorrow_tasks: 0, tomorrow_deadlines: 0, tomorrow_sessions: 0, tomorrow_first: null, next_eval_title: null, next_eval_at: null }), evening).body;
    expect(body).toBe("Aucune tâche cochée aujourd'hui\nDemain : pas de cours");
    expect(buildDigest(row({ done_today: 1, tomorrow_sessions: 1 }), evening).body).toContain("✓ 1 tâche faite aujourd'hui\n2 encore à faire\nDemain : 1 cours dès 08:15");
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
