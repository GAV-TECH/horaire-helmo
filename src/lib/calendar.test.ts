import { describe, expect, it } from "vitest";
import { groupByDay, minutesOfDay, shiftDay, weekDays } from "./calendar";
import type { Session } from "./ics/types";

const session = (start: string, end: string): Session => ({
  key: start,
  uid: start,
  recurrenceId: null,
  title: "Cours",
  courseKey: "cours",
  location: null,
  teacher: null,
  start,
  end,
  allDay: false,
  description: null,
  status: "active",
});

describe("calendrier", () => {
  it("calcule la semaine du lundi au dimanche", () => {
    expect(weekDays("2025-10-08")).toEqual([
      "2025-10-06", "2025-10-07", "2025-10-08", "2025-10-09", "2025-10-10", "2025-10-11", "2025-10-12",
    ]);
  });

  it("traverse le changement d'heure sans sauter de jour", () => {
    expect(shiftDay("2025-10-25", 1)).toBe("2025-10-26");
    expect(shiftDay("2025-10-26", 1)).toBe("2025-10-27");
    expect(weekDays("2025-10-26")[0]).toBe("2025-10-20");
  });

  it("range une séance dans son jour de Bruxelles et une journée entière dans un seul jour", () => {
    const late = session("2025-10-06T22:30:00Z", "2025-10-06T23:30:00Z"); // 00:30 le 7 à Bruxelles
    const allDay = { ...session("2025-11-02T23:00:00Z", "2025-11-03T23:00:00Z"), allDay: true };
    const days = groupByDay([late, allDay]);
    expect([...days.keys()]).toEqual(["2025-10-07", "2025-11-03"]);
  });

  it("garde une séance de durée nulle", () => {
    expect([...groupByDay([session("2025-10-06T08:00:00Z", "2025-10-06T08:00:00Z")]).keys()]).toEqual(["2025-10-06"]);
  });

  it("donne les minutes depuis minuit à Bruxelles", () => {
    expect(minutesOfDay("2025-10-06T06:30:00Z")).toBe(8 * 60 + 30);
  });
});
