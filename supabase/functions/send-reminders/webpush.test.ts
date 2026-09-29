import { describe, expect, it } from "vitest";
import { base64UrlDecode, base64UrlEncode, encryptPayload, generateVapidKeys, vapidAuthorization } from "./webpush";

/** Importe une paire ECDH à partir des clés publique (brute) et privée (d) en base64url. */
async function ecdhPair(publicKey: string, privateKey: string): Promise<CryptoKeyPair> {
  const raw = base64UrlDecode(publicKey);
  const jwk = { kty: "EC", crv: "P-256", x: base64UrlEncode(raw.slice(1, 33)), y: base64UrlEncode(raw.slice(33, 65)), ext: true };
  return {
    publicKey: await crypto.subtle.importKey("jwk", jwk, { name: "ECDH", namedCurve: "P-256" }, true, []),
    privateKey: await crypto.subtle.importKey("jwk", { ...jwk, d: privateKey }, { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]),
  };
}

describe("encryptPayload (RFC 8291)", () => {
  it("reproduit exactement le vecteur de test de l'annexe A de la RFC", async () => {
    // Valeurs publiées dans la RFC 8291, annexe A.
    const serverKeys = await ecdhPair(
      "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
      "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
    );
    const body = await encryptPayload(
      "When I grow up, I want to be a watermelon",
      {
        p256dh: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
        auth: "BTBZMqHH6r4Tts7J_aSIgg",
      },
      { salt: base64UrlDecode("DGv6ra1nlYgDCS1FRnbzlw"), serverKeys },
    );
    expect(base64UrlEncode(body)).toBe(
      "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
    );
  });

  it("produit un message que le navigateur destinataire sait déchiffrer", async () => {
    // Le "navigateur" : sa paire de clés et son secret d'authentification.
    const browser = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
    const browserPublic = new Uint8Array(await crypto.subtle.exportKey("raw", browser.publicKey));
    const auth = crypto.getRandomValues(new Uint8Array(16));
    const message = JSON.stringify({ title: "Réseaux", body: "dans 1 h · L2.05" });

    const body = await encryptPayload(message, { p256dh: base64UrlEncode(browserPublic), auth: base64UrlEncode(auth) });

    // Déchiffrement côté navigateur (même dérivation, mais avec SA clé privée).
    const salt = body.slice(0, 16);
    expect(new DataView(body.buffer).getUint32(16)).toBe(4096);
    const serverPublic = body.slice(21, 21 + body[20]);
    const serverKey = await crypto.subtle.importKey("raw", serverPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
    const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: serverKey }, browser.privateKey, 256));
    const hmac = async (key: Uint8Array<ArrayBuffer>, data: Uint8Array<ArrayBuffer>) =>
      new Uint8Array(await crypto.subtle.sign("HMAC", await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]), data));
    const enc = (s: string) => new TextEncoder().encode(s);
    const join = (...p: Uint8Array[]) => {
      const out = new Uint8Array(p.reduce((n, x) => n + x.length, 0));
      p.reduce((o, x) => (out.set(x, o), o + x.length), 0);
      return out;
    };
    const ikm = await hmac(await hmac(auth, shared), join(enc("WebPush: info\0"), browserPublic, serverPublic, new Uint8Array([1])));
    const prk = await hmac(salt, ikm);
    const cek = (await hmac(prk, join(enc("Content-Encoding: aes128gcm\0"), new Uint8Array([1])))).slice(0, 16);
    const nonce = (await hmac(prk, join(enc("Content-Encoding: nonce\0"), new Uint8Array([1])))).slice(0, 12);
    const aes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]);
    const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, aes, body.slice(21 + body[20])));

    expect(plain[plain.length - 1]).toBe(2); // délimiteur de dernier bloc
    expect(new TextDecoder().decode(plain.slice(0, -1))).toBe(message);
  });
});

describe("vapidAuthorization (RFC 8292)", () => {
  it("signe un jeton vérifiable avec la clé publique, pour l'origine du service de push", async () => {
    const keys = await generateVapidKeys();
    const now = Date.UTC(2025, 9, 6, 8, 0);
    const header = await vapidAuthorization("https://fcm.googleapis.com/fcm/send/abc", { ...keys, subject: "mailto:test@exemple.test" }, now);

    const [, token, k] = header.match(/^vapid t=([^,]+), k=(.+)$/)!;
    expect(k).toBe(keys.publicKey);
    const [h, c, s] = token.split(".");
    expect(JSON.parse(new TextDecoder().decode(base64UrlDecode(c)))).toEqual({
      aud: "https://fcm.googleapis.com",
      exp: now / 1000 + 12 * 3600,
      sub: "mailto:test@exemple.test",
    });
    const publicKey = await crypto.subtle.importKey("raw", base64UrlDecode(keys.publicKey), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const valid = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, publicKey, base64UrlDecode(s), new TextEncoder().encode(`${h}.${c}`));
    expect(valid).toBe(true);
  });
});
