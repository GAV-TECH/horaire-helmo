import { describe, expect, it } from "vitest";
import type { Reminder } from "./data/types";
import { computeFireAt, describeReminder, reminderSchema, reminderStatus } from "./reminders";

const id = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

describe("reminderSchema", () => {
  it("transforme un préréglage en décalage", () => {
    expect(reminderSchema.parse({ targetType: "session", targetId: id, preset: "1h" })).toEqual({
      targetType: "session",
      targetId: id,
      offset_minutes: 60,
      remind_at: null,
    });
  });

  it("transforme une date personnalisée (heure de Bruxelles) en UTC", () => {
    const r = reminderSchema.parse({ targetType: "todo", targetId: id, preset: "custom", date: "2025-10-06", time: "08:00" });
    expect(r).toMatchObject({ offset_minutes: null, remind_at: "2025-10-06T06:00:00.000Z" });
  });

  it("exige une date et une heure pour un rappel personnalisé", () => {
    expect(reminderSchema.safeParse({ targetType: "todo", targetId: id, preset: "custom", date: "2025-10-06" }).success).toBe(false);
    expect(reminderSchema.safeParse({ targetType: "autre", targetId: id, preset: "1h" }).success).toBe(false);
  });
});

describe("computeFireAt", () => {
  it("soustrait le décalage de l'heure de la cible", () => {
    expect(computeFireAt(60, null, "2025-10-06T08:00:00.000Z")).toBe("2025-10-06T07:00:00.000Z");
  });
  it("utilise la date précise si elle existe", () => {
    expect(computeFireAt(null, "2025-10-05T18:00:00.000Z", null)).toBe("2025-10-05T18:00:00.000Z");
  });
  it("renvoie null pour un rappel relatif sans heure de cible", () => {
    expect(computeFireAt(60, null, null)).toBeNull();
  });
});

describe("affichage", () => {
  it("décrit le rappel", () => {
    expect(describeReminder({ offsetMinutes: 1440, remindAt: null })).toBe("1 jour avant");
    expect(describeReminder({ offsetMinutes: 120, remindAt: null })).toBe("2 h avant");
    expect(describeReminder({ offsetMinutes: null, remindAt: "2025-10-06T06:00:00.000Z" })).toBe("lun. 6 oct. à 08:00");
  });

  it("donne le statut", () => {
    const base: Reminder = {
      id, targetType: "session", targetId: id, offsetMinutes: 60, remindAt: null, fireAt: "2025-10-06T07:00:00.000Z",
      sentAt: null, targetTitle: "Réseaux", targetDetail: null, targetAt: "2025-10-06T08:00:00.000Z", targetDone: false,
    };
    const now = Date.parse("2025-10-06T06:00:00.000Z");
    expect(reminderStatus(base, now)).toBe("pending");
    expect(reminderStatus({ ...base, sentAt: "2025-10-06T07:00:00.000Z" }, now)).toBe("sent");
    expect(reminderStatus({ ...base, targetDone: true }, now)).toBe("skipped");
    expect(reminderStatus(base, Date.parse("2025-10-06T08:00:00.000Z"))).toBe("late");
  });
});
