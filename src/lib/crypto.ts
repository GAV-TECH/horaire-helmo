import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Chiffrement symétrique AES-256-GCM du lien .ics avant stockage en base.
 * GCM chiffre ET authentifie : un texte modifié en base fait échouer le déchiffrement.
 * Format stocké : "v1:<iv>:<tag>:<données>" (base64). Le "v1" permettra de changer d'algorithme plus tard.
 */
const VERSION = "v1";

function loadKey(keyBase64: string): Buffer {
  const key = Buffer.from(keyBase64, "base64");
  if (key.length !== 32) throw new Error("La clé de chiffrement doit faire 32 octets (base64).");
  return key;
}

export function encryptSecret(plain: string, keyBase64: string): string {
  const iv = randomBytes(12); // vecteur d'initialisation : unique à chaque chiffrement
  const cipher = createCipheriv("aes-256-gcm", loadKey(keyBase64), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(":");
}

export function decryptSecret(stored: string, keyBase64: string): string {
  const [version, iv, tag, data] = stored.split(":");
  if (version !== VERSION || !iv || !tag || !data) throw new Error("Format chiffré inconnu.");
  const decipher = createDecipheriv("aes-256-gcm", loadKey(keyBase64), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}
