import { describe, expect, it } from "vitest";
import type { StoredSession } from "@/lib/ics/types";
import { describeChanges } from "./changes";

const session = (over: Partial<StoredSession>): StoredSession => ({
  id: "1", key: "k", uid: "k", recurrenceId: null, title: "Réseaux", courseKey: "reseaux", location: "619", teacher: null,
  start: "2025-10-06T08:00:00.000Z", end: "2025-10-06T10:00:00.000Z", allDay: false, description: null, status: "active",
  changes: {}, changesSeen: false, ...over,
});

describe("describeChanges", () => {
  it("détaille un déplacement le même jour et un changement de local", () => {
    const changes = describeChanges(
      session({ changes: { moved: { fromStart: "2025-10-06T06:15:00.000Z", fromEnd: "2025-10-06T08:15:00.000Z" }, room: { from: "519" } } }),
    );
    expect(changes.map((c) => [c.label, c.detail])).toEqual([
      ["Déplacée", "était 08:15–10:15"],
      ["Local changé", "519 → 619"],
    ]);
  });

  it("donne l'ancienne date quand la séance change de jour", () => {
    const [moved] = describeChanges(session({ changes: { moved: { fromStart: "2025-09-29T06:15:00.000Z", fromEnd: "2025-09-29T08:15:00.000Z" } } }));
    expect(moved.detail).toBe("était lun. 29 sept. à 08:15");
  });

  it("distingue « annulée » et « retirée », et signale les nouvelles séances", () => {
    expect(describeChanges(session({ changes: { cancelled: true } }))[0].label).toBe("Annulée par HELMO");
    expect(describeChanges(session({ changes: { removed: true } }))[0].label).toBe("Retirée de l'horaire");
    expect(describeChanges(session({ changes: { added: true } }))[0]).toMatchObject({ icon: "🆕", label: "Nouvelle séance" });
    expect(describeChanges(session({}))).toEqual([]);
  });
});
