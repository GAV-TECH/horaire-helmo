import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { IcsParseError, parseIcs } from "./parse";
import type { Session } from "./types";

const fixture = readFileSync(new URL("../../../fixtures/exemple.ics", import.meta.url), "utf8");
// Fenêtre fixe : les tests ne doivent pas dépendre de la date du jour.
const range = { rangeStart: new Date("2025-09-01T00:00:00Z"), rangeEnd: new Date("2026-07-01T00:00:00Z") };
const sessions = parseIcs(fixture, range);
const byUid = (uid: string) => sessions.filter((s) => s.uid === uid);
const one = (uid: string): Session => {
  const found = byUid(uid);
  expect(found).toHaveLength(1);
  return found[0];
};

describe("parseIcs", () => {
  it("extrait toutes les séances valides et ignore celles sans UID", () => {
    // 5 séances simples + 3 occurrences de la série + 1 journée entière
    expect(sessions).toHaveLength(9);
    expect(sessions.some((s) => s.title.includes("sans UID"))).toBe(false);
  });

  it("trie les séances par date de début", () => {
    const starts = sessions.map((s) => s.start);
    expect(starts).toEqual([...starts].sort());
  });

  it("garde les champs d'une séance", () => {
    const poo = one("poo-2025-10-06@exemple.test");
    expect(poo).toMatchObject({
      key: "poo-2025-10-06@exemple.test",
      title: "Programmation orientée objet",
      courseKey: "programmation orientee objet",
      location: "L2.05",
      teacher: "Mme Martin",
      description: "Enseignant : Mme Martin\nGroupe : 1B",
      allDay: false,
      status: "active",
      recurrenceId: null,
    });
  });

  describe("fuseaux horaires", () => {
    it("convertit l'heure d'été de Bruxelles (UTC+2)", () => {
      const poo = one("poo-2025-10-06@exemple.test");
      expect(poo.start).toBe("2025-10-06T06:30:00.000Z");
      expect(poo.end).toBe("2025-10-06T08:30:00.000Z");
    });

    it("convertit l'heure d'hiver de Bruxelles (UTC+1), après le changement d'heure", () => {
      expect(one("bd-2025-10-27@exemple.test").start).toBe("2025-10-27T12:30:00.000Z");
    });

    it("garde telles quelles les heures UTC", () => {
      expect(one("math-2025-10-08@exemple.test").start).toBe("2025-10-08T08:00:00.000Z");
    });

    it("traite un TZID inconnu sans VTIMEZONE comme l'heure de Bruxelles", () => {
      expect(one("anglais-2025-10-09@exemple.test").start).toBe("2025-10-09T08:00:00.000Z");
    });

    it("place une journée entière à minuit heure de Bruxelles", () => {
      const conge = one("conge-automne@exemple.test");
      expect(conge.allDay).toBe(true);
      expect(conge.start).toBe("2025-11-02T23:00:00.000Z");
      expect(conge.end).toBe("2025-11-03T23:00:00.000Z");
    });
  });

  it("décode les caractères échappés (virgule)", () => {
    expect(one("bd-2025-10-27@exemple.test").title).toBe("Bases de données, labo");
  });

  it("lit l'enseignant depuis ORGANIZER ou la description", () => {
    expect(one("bd-2025-10-27@exemple.test").teacher).toBe("M. Dupont");
    expect(byUid("serie-reseaux@exemple.test")[0].teacher).toBe("M. Leroy");
    expect(one("math-2025-10-08@exemple.test").teacher).toBeNull();
  });

  it("marque les séances annulées", () => {
    expect(one("reseaux-2025-10-10@exemple.test").status).toBe("cancelled");
  });

  describe("événements récurrents", () => {
    const serie = byUid("serie-reseaux@exemple.test");

    it("développe la RRULE en respectant EXDATE", () => {
      expect(serie.map((s) => s.start)).toEqual([
        "2025-10-13T12:00:00.000Z",
        "2025-10-20T13:00:00.000Z", // occurrence déplacée d'une heure
        "2025-11-03T13:00:00.000Z", // 27/10 exclue ; heure d'hiver ensuite
      ]);
    });

    it("applique l'exception (RECURRENCE-ID) : nouvel horaire et nouveau local", () => {
      expect(serie[1].location).toBe("Auditoire A");
      expect(serie[0].location).toBe("L1.10");
    });

    it("donne une clé unique et stable à chaque occurrence", () => {
      expect(serie[1].recurrenceId).toBe("2025-10-20T12:00:00.000Z");
      expect(serie[1].key).toBe("serie-reseaux@exemple.test#2025-10-20T12:00:00.000Z");
      expect(new Set(sessions.map((s) => s.key)).size).toBe(sessions.length);
    });

    it("ne développe que la fenêtre demandée", () => {
      const short = parseIcs(fixture, { rangeStart: range.rangeStart, rangeEnd: new Date("2025-10-25T00:00:00Z") });
      expect(short.filter((s) => s.uid === "serie-reseaux@exemple.test")).toHaveLength(2);
    });
  });

  it("rend uniques les UID dupliqués", () => {
    const duplicated = fixture.replace("UID:math-2025-10-08@exemple.test", "UID:poo-2025-10-06@exemple.test");
    const parsed = parseIcs(duplicated, range);
    expect(new Set(parsed.map((s) => s.key)).size).toBe(parsed.length);
  });

  it("rejette un contenu qui n'est pas un calendrier", () => {
    expect(() => parseIcs("<html>Page de connexion</html>", range)).toThrow(IcsParseError);
    expect(() => parseIcs("BEGIN:VCARD\nVERSION:3.0\nEND:VCARD", range)).toThrow(IcsParseError);
  });
});
