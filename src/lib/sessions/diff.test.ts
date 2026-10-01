import { describe, expect, it } from "vitest";
import type { Session, StoredSession } from "@/lib/ics/types";
import { diffSessions, legacyDuplicates } from "./diff";

const NOW = new Date("2025-10-01T10:00:00.000Z");

function session(overrides: Partial<Session> = {}): Session {
  return {
    key: "poo-1",
    uid: "poo-1",
    recurrenceId: null,
    title: "Programmation",
    courseKey: "programmation",
    location: "L2.05",
    teacher: null,
    start: "2025-10-06T06:30:00.000Z",
    end: "2025-10-06T08:30:00.000Z",
    allDay: false,
    description: null,
    status: "active",
    ...overrides,
  };
}

function stored(overrides: Partial<StoredSession> = {}): StoredSession {
  return { ...session(), id: "id-1", changes: {}, changesSeen: true, ...overrides };
}

describe("legacyDuplicates", () => {
  it("repère la 2e copie enregistrée sous la clé UID#début, et seulement elle", () => {
    const original = stored({ id: "orig" });
    const copy = stored({ id: "copie", key: `poo-1#${original.start}` });
    const other = stored({ id: "autre", key: "poo-1#2025-10-13T06:30:00.000Z", start: "2025-10-13T06:30:00.000Z" }); // pas d'original à cette heure
    expect(legacyDuplicates([original, copy, other])).toEqual([{ duplicateId: "copie", originalId: "orig" }]);
  });
});

describe("diffSessions", () => {
  it("première synchro : tout est inséré sans aucun badge", () => {
    const writes = diffSessions([], [session(), session({ key: "b", uid: "b" })], NOW);
    expect(writes).toHaveLength(2);
    expect(writes.every((w) => !w.id && w.changesSeen && Object.keys(w.changes).length === 0)).toBe(true);
  });

  it("n'écrit rien si rien n'a changé", () => {
    expect(diffSessions([stored()], [session()], NOW)).toEqual([]);
  });

  it("détecte une séance déplacée et garde l'horaire d'origine", () => {
    const [write] = diffSessions([stored()], [session({ start: "2025-10-06T08:30:00.000Z", end: "2025-10-06T10:30:00.000Z" })], NOW);
    expect(write.id).toBe("id-1");
    expect(write.changes.moved).toEqual({ fromStart: "2025-10-06T06:30:00.000Z", fromEnd: "2025-10-06T08:30:00.000Z" });
    expect(write.changesSeen).toBe(false);
  });

  it("retire le badge si la séance revient à son horaire d'origine", () => {
    const moved = stored({
      start: "2025-10-06T08:30:00.000Z",
      end: "2025-10-06T10:30:00.000Z",
      changes: { moved: { fromStart: "2025-10-06T06:30:00.000Z", fromEnd: "2025-10-06T08:30:00.000Z" } },
      changesSeen: false,
    });
    const [write] = diffSessions([moved], [session()], NOW);
    expect(write.changes).toEqual({});
    expect(write.changesSeen).toBe(true);
  });

  it("détecte un changement de local", () => {
    const [write] = diffSessions([stored()], [session({ location: "Auditoire A" })], NOW);
    expect(write.changes).toEqual({ room: { from: "L2.05" } });
  });

  it("garde 'vu' si l'utilisateur a déjà vu ce changement", () => {
    const seen = stored({ location: "Auditoire A", changes: { room: { from: "L2.05" } }, changesSeen: true });
    expect(diffSessions([seen], [session({ location: "Auditoire A" })], NOW)).toEqual([]);
  });

  it("repasse en 'non vu' si un nouveau changement arrive", () => {
    const seen = stored({ location: "Auditoire A", changes: { room: { from: "L2.05" } }, changesSeen: true });
    const [write] = diffSessions([seen], [session({ location: "Auditoire B" })], NOW);
    expect(write.changes.room).toEqual({ from: "L2.05" });
    expect(write.changesSeen).toBe(false);
  });

  it("détecte une annulation explicite (STATUS:CANCELLED)", () => {
    const [write] = diffSessions([stored()], [session({ status: "cancelled" })], NOW);
    expect(write.changes.cancelled).toBe(true);
  });

  it("marque « retirée » (pas « annulée ») une séance future qui disparaît du flux, sans la supprimer", () => {
    const other = session({ key: "autre", uid: "autre", courseKey: "anglais", title: "Anglais" });
    const writes = diffSessions([stored()], [other], NOW);
    const removed = writes.find((w) => w.id === "id-1");
    expect(removed).toMatchObject({ status: "cancelled", changes: { removed: true }, changesSeen: false });
    expect(removed?.changes.cancelled).toBeUndefined();
  });

  describe("déplacement avec nouvel UID (HELMO supprime et recrée la séance)", () => {
    const evaluation = (over: Partial<StoredSession> = {}) =>
      stored({
        key: "eval-1", uid: "eval-1", title: "Thermodynamique : évaluation / X / 413 (CO)", courseKey: "thermo-eval",
        start: "2025-10-19T06:15:00.000Z", end: "2025-10-19T08:15:00.000Z", location: "413", ...over,
      });

    it("reconnaît le déplacement : même cours, même type, à moins de 30 jours", () => {
      const moved = session({
        key: "eval-2", uid: "eval-2", title: "Thermodynamique - évaluation / X / 419 (CO)", courseKey: "autre-cle",
        start: "2025-10-26T07:15:00.000Z", end: "2025-10-26T09:15:00.000Z", location: "419",
      });
      const writes = diffSessions([evaluation()], [moved], NOW);
      expect(writes).toHaveLength(1);
      expect(writes[0]).toMatchObject({
        id: "id-1",
        key: "eval-2",
        changes: { moved: { fromStart: "2025-10-19T06:15:00.000Z", fromEnd: "2025-10-19T08:15:00.000Z" }, room: { from: "413" } },
        changesSeen: false,
      });
    });

    it("ne confond pas deux types de séance ni des dates trop éloignées", () => {
      const theory = session({ key: "t", uid: "t", title: "Thermodynamique : théorie / X / 629 (CO)", start: "2025-10-20T06:15:00.000Z", end: "2025-10-20T08:15:00.000Z" });
      const far = session({ key: "f", uid: "f", title: "Thermodynamique : évaluation / X / 413 (CO)", start: "2025-12-15T06:15:00.000Z", end: "2025-12-15T08:15:00.000Z" });
      const writes = diffSessions([evaluation()], [theory, far], NOW);
      expect(writes.find((w) => w.id === "id-1")?.changes).toEqual({ removed: true });
      expect(writes.filter((w) => !w.id)).toHaveLength(2);
    });
  });

  it("reclasse en « retirée » une ancienne séance notée « annulée » qui n'est plus dans le flux", () => {
    const legacy = stored({ status: "cancelled", changes: { cancelled: true }, changesSeen: true });
    const other = session({ key: "autre", uid: "autre", courseKey: "anglais", title: "Anglais" });
    const write = diffSessions([legacy], [other], NOW).find((w) => w.id === "id-1");
    expect(write).toMatchObject({ status: "cancelled", changes: { removed: true }, changesSeen: true });
    expect(write?.changes.cancelled).toBeUndefined();
  });

  it("une séance retirée qui réapparaît perd son badge « retirée »", () => {
    const back = stored({ status: "cancelled", changes: { removed: true }, changesSeen: false });
    const [write] = diffSessions([back], [session()], NOW);
    expect(write).toMatchObject({ status: "active", changes: {} });
  });

  it("ne touche pas une séance passée qui disparaît du flux", () => {
    const past = stored({ start: "2025-09-01T06:30:00.000Z", end: "2025-09-01T08:30:00.000Z" });
    const other = session({ key: "autre", uid: "autre", courseKey: "anglais" });
    expect(diffSessions([past], [other], NOW).find((w) => w.id === "id-1")).toBeUndefined();
  });

  it("n'annule rien si le flux reçu est vide (probable erreur passagère)", () => {
    expect(diffSessions([stored()], [], NOW)).toEqual([]);
  });

  it("retrouve une séance dont l'UID a changé grâce au cours + heure de début", () => {
    const [write] = diffSessions([stored()], [session({ key: "nouvel-uid", uid: "nouvel-uid" })], NOW);
    expect(write).toMatchObject({ id: "id-1", key: "nouvel-uid", changes: {} });
  });

  it("signale une séance ajoutée dans les 14 jours, mais pas les semaines publiées plus tard", () => {
    const soon = session({ key: "soon", uid: "soon", start: "2025-10-03T08:00:00.000Z", end: "2025-10-03T10:00:00.000Z" });
    const later = session({ key: "later", uid: "later", start: "2025-12-01T08:00:00.000Z", end: "2025-12-01T10:00:00.000Z" });
    const writes = diffSessions([stored()], [session(), soon, later], NOW);
    expect(writes.find((w) => w.key === "soon")?.changes).toEqual({ added: true });
    expect(writes.find((w) => w.key === "later")?.changes).toEqual({});
  });

  it("ne signale pas les modifications d'une séance passée", () => {
    const past = stored({ start: "2025-09-01T06:30:00.000Z", end: "2025-09-01T08:30:00.000Z", location: "X" });
    const [write] = diffSessions([past], [{ ...session(), start: past.start, end: past.end, location: "Y" }], NOW);
    expect(write.location).toBe("Y");
    expect(write.changes).toEqual({});
  });
});
