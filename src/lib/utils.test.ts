import { describe, expect, it } from "vitest";
import { courseColor, courseKey } from "./courses";
import { redactSecrets } from "./ics/redact";
import { dayKey, formatFr } from "./time";

describe("courseKey", () => {
  it("ignore la casse, les accents et les espaces multiples", () => {
    expect(courseKey("  Bases de  Données ")).toBe("bases de donnees");
    expect(courseKey("RÉSEAUX")).toBe(courseKey("réseaux"));
  });
});

describe("courseColor", () => {
  it("donne toujours la même couleur au même cours", () => {
    expect(courseColor("reseaux")).toBe(courseColor("reseaux"));
    expect(courseColor("reseaux")).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("redactSecrets", () => {
  it("masque le token de l'URL", () => {
    const text = "fetch failed https://mon-espace.exemple.test/Fichier?token=ABC123 (timeout)";
    const redacted = redactSecrets(text);
    expect(redacted).not.toContain("ABC123");
    expect(redacted).toContain("https://mon-espace.exemple.test/Fichier?[masqué]");
  });

  it("masque un token isolé", () => {
    expect(redactSecrets("token=XYZ&x=1")).toBe("token=[masqué]&x=1");
  });
});

describe("dates en heure de Bruxelles", () => {
  it("découpe les jours selon Bruxelles, pas selon le fuseau de la machine", () => {
    // 23 h 30 UTC le 6 octobre = 1 h 30 le 7 octobre à Bruxelles
    expect(dayKey("2025-10-06T23:30:00Z")).toBe("2025-10-07");
    expect(formatFr("2025-10-06T23:30:00Z", "EEEE d MMMM HH:mm")).toBe("mardi 7 octobre 01:30");
  });
});
