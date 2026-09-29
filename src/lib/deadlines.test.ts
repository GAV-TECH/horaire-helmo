import { describe, expect, it } from "vitest";
import type { Deadline } from "./data/types";
import type { StoredSession } from "./ics/types";
import { buildEcheances, countdown, daysUntil, nextSessionOf, sectionOf } from "./deadlines";

const NOW = Date.parse("2025-10-08T10:00:00Z"); // mercredi 8 octobre, 12:00 à Bruxelles

const session = (id: string, title: string, start: string, over: Partial<StoredSession> = {}): StoredSession => ({
  id, key: id, uid: id, recurrenceId: null, title, courseKey: title.toLowerCase(), location: null, teacher: null,
  start, end: new Date(Date.parse(start) + 2 * 3600_000).toISOString(), allDay: false, description: null, status: "active",
  changes: {}, changesSeen: true, ...over,
});
const deadline = (id: string, dueAt: string): Deadline => ({
  id, ownerId: "me", groupId: null, title: id, dueAt, courseName: null, courseKey: null, priority: 2, details: null, doneAt: null, doneBy: [],
});

describe("compte à rebours", () => {
  it("compte en jours de calendrier à Bruxelles", () => {
    expect(daysUntil("2025-10-08T21:59:00Z", NOW)).toBe(0); // ce soir 23:59
    expect(daysUntil("2025-10-08T22:30:00Z", NOW)).toBe(1); // 00:30 demain à Bruxelles
    expect(daysUntil("2025-10-28T09:00:00Z", NOW)).toBe(20); // après le passage à l'heure d'hiver
  });

  it("affiche un libellé et une urgence", () => {
    expect(countdown("2025-10-08T08:00:00Z", NOW)).toEqual({ label: "En retard", urgency: "late" });
    expect(countdown("2025-10-08T21:59:00Z", NOW)).toEqual({ label: "Aujourd'hui", urgency: "urgent" });
    expect(countdown("2025-10-09T08:00:00Z", NOW)).toEqual({ label: "Demain", urgency: "urgent" });
    expect(countdown("2025-10-13T08:00:00Z", NOW)).toEqual({ label: "J-5", urgency: "soon" });
    expect(countdown("2025-10-20T08:00:00Z", NOW)).toEqual({ label: "J-12", urgency: "later" });
  });
});

describe("sections", () => {
  it("cette semaine jusqu'à dimanche, puis la semaine suivante, puis plus tard", () => {
    expect(sectionOf("2025-10-12T20:00:00Z", NOW)).toBe("semaine"); // dimanche 12
    expect(sectionOf("2025-10-13T08:00:00Z", NOW)).toBe("semaine-prochaine"); // lundi 13
    expect(sectionOf("2025-10-19T20:00:00Z", NOW)).toBe("semaine-prochaine"); // dimanche 19
    expect(sectionOf("2025-10-20T08:00:00Z", NOW)).toBe("plus-tard");
    expect(sectionOf("2025-10-07T08:00:00Z", NOW)).toBe("retard");
  });
});

describe("échéances", () => {
  const sessions = [
    session("a", "Thermodynamique : théorie / X / 629 (CO)", "2025-10-06T08:00:00Z"), // passée
    session("b", "Thermodynamique : exercices / X / 129 (CO)", "2025-10-10T08:00:00Z"),
    session("c", "Thermodynamique - évaluation / X / 413 (CO)", "2025-10-15T08:00:00Z"),
    session("d", "Microcontrôleurs : évaluation / Y / B118 (CO)", "2025-10-09T08:00:00Z", { status: "cancelled" }),
  ];

  it("trouve la prochaine séance d'un cours (variante d'écriture comprise)", () => {
    expect(nextSessionOf("Thermodynamique", sessions, NOW)?.id).toBe("b");
    expect(nextSessionOf("Chimie", sessions, NOW)).toBeNull();
  });

  it("mélange évaluations de l'horaire (non annulées) et deadlines, par date", () => {
    const list = buildEcheances([deadline("rapport", "2025-10-12T21:59:00Z")], sessions, NOW);
    expect(list.map((e) => e.id)).toEqual(["rapport", "eval-c"]);
    expect(list[1].type).toBe("evaluation");
  });
});
