import { describe, expect, it } from "vitest";
import { buildNotification, formatRelative, formatWhen, type DueReminder } from "./message";

const NOW = new Date("2025-10-06T06:00:00Z"); // lundi 6 octobre, 08:00 à Bruxelles

const reminder = (overrides: Partial<DueReminder>): DueReminder => ({
  id: "r1",
  user_id: "u1",
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
