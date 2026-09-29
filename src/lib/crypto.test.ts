import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "./crypto";

const key = randomBytes(32).toString("base64");
const secret = "https://mon-espace.exemple.test/Fichier?token=FAUX";

describe("chiffrement du lien .ics", () => {
  it("déchiffre ce qu'il a chiffré", () => {
    expect(decryptSecret(encryptSecret(secret, key), key)).toBe(secret);
  });

  it("ne laisse pas le lien en clair et varie à chaque chiffrement", () => {
    const a = encryptSecret(secret, key);
    expect(a).not.toContain("token");
    expect(encryptSecret(secret, key)).not.toBe(a);
  });

  it("échoue avec une autre clé ou un texte modifié", () => {
    const stored = encryptSecret(secret, key);
    expect(() => decryptSecret(stored, randomBytes(32).toString("base64"))).toThrow();
    const parts = stored.split(":");
    parts[3] = Buffer.from("modifié").toString("base64");
    expect(() => decryptSecret(parts.join(":"), key)).toThrow();
  });

  it("refuse une clé de mauvaise taille", () => {
    expect(() => encryptSecret(secret, randomBytes(16).toString("base64"))).toThrow(/32 octets/);
  });
});
