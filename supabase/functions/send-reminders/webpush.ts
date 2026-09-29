/**
 * Envoi de notifications Web Push, sans dépendance : uniquement l'API standard Web Crypto.
 * Le même fichier tourne dans l'Edge Function Supabase (Deno) et dans Next.js (Node).
 *
 * Deux protocoles :
 * - RFC 8291 : le contenu est chiffré pour le navigateur destinataire (le service de push
 *   de Google / Mozilla / Apple qui le transporte ne peut pas le lire) ;
 * - RFC 8292 (VAPID) : un jeton signé prouve au service de push que c'est bien notre serveur.
 */

export type PushSubscriptionKeys = { endpoint: string; p256dh: string; auth: string };
export type VapidKeys = { publicKey: string; privateKey: string; subject: string };
export type PushResult = { ok: boolean; status: number; gone: boolean };

const encoder = new TextEncoder();

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlDecode(text: string): Uint8Array<ArrayBuffer> {
  const base64 = text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (text.length % 4)) % 4);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

async function hmacSha256(key: Uint8Array<ArrayBuffer>, data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data));
}

/** HKDF (RFC 5869) en une étape "expand" : suffisant car on ne demande jamais plus de 32 octets. */
async function hkdf(salt: Uint8Array<ArrayBuffer>, ikm: Uint8Array<ArrayBuffer>, info: Uint8Array<ArrayBuffer>, length: number) {
  const prk = await hmacSha256(salt, ikm);
  return (await hmacSha256(prk, concat(info, new Uint8Array([1])))).slice(0, length);
}

/**
 * Chiffre le message pour un abonnement (RFC 8291, encodage "aes128gcm").
 * `salt` et `serverKeys` ne sont passés que par les tests ; sinon ils sont aléatoires.
 */
export async function encryptPayload(
  payload: string,
  subscription: Pick<PushSubscriptionKeys, "p256dh" | "auth">,
  testing?: { salt: Uint8Array<ArrayBuffer>; serverKeys: CryptoKeyPair },
): Promise<Uint8Array<ArrayBuffer>> {
  const clientPublic = base64UrlDecode(subscription.p256dh); // clé publique du navigateur (65 octets)
  const authSecret = base64UrlDecode(subscription.auth); // secret partagé (16 octets)

  // 1. Paire de clés éphémère côté serveur + secret Diffie-Hellman partagé avec le navigateur.
  const serverKeys =
    testing?.serverKeys ?? (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]));
  const serverPublic = new Uint8Array(await crypto.subtle.exportKey("raw", serverKeys.publicKey));
  const clientKey = await crypto.subtle.importKey("raw", clientPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: clientKey }, serverKeys.privateKey, 256),
  );

  // 2. Dérivation des clés (HKDF), exactement comme décrit dans la RFC 8291.
  const keyInfo = concat(encoder.encode("WebPush: info\0"), clientPublic, serverPublic);
  const ikm = await hkdf(authSecret, sharedSecret, keyInfo, 32);
  const salt = testing?.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, encoder.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, encoder.encode("Content-Encoding: nonce\0"), 12);

  // 3. Chiffrement AES-128-GCM. Le 0x02 final marque le dernier (et unique) bloc.
  const aesKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const plaintext = concat(encoder.encode(payload), new Uint8Array([2]));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, plaintext));

  // 4. En-tête : sel (16) | taille de bloc (4, big-endian) | longueur de la clé (1) | clé publique serveur (65).
  const header = new Uint8Array(16 + 4 + 1 + serverPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = serverPublic.length;
  header.set(serverPublic, 21);
  return concat(header, ciphertext);
}

/** Jeton VAPID (JWT signé ES256) valable 12 h pour l'origine du service de push. */
export async function vapidAuthorization(endpoint: string, vapid: VapidKeys, now = Date.now()): Promise<string> {
  const publicBytes = base64UrlDecode(vapid.publicKey); // 0x04 | x (32) | y (32)
  const jwk: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    x: base64UrlEncode(publicBytes.slice(1, 33)),
    y: base64UrlEncode(publicBytes.slice(33, 65)),
    d: vapid.privateKey,
    ext: true,
  };
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);

  const header = base64UrlEncode(encoder.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = base64UrlEncode(
    encoder.encode(
      JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: vapid.subject }),
    ),
  );
  const unsigned = `${header}.${claims}`;
  // Web Crypto renvoie directement la signature au format r|s (64 octets) attendu par les JWT.
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, encoder.encode(unsigned)));
  return `vapid t=${unsigned}.${base64UrlEncode(signature)}, k=${vapid.publicKey}`;
}

/**
 * Envoie une notification. `gone: true` (404/410) = l'abonnement n'existe plus
 * (navigateur désinstallé, permission retirée…) : il faut le supprimer de la base.
 */
export async function sendWebPush(
  subscription: PushSubscriptionKeys,
  payload: string,
  vapid: VapidKeys,
  options: { ttlSeconds?: number; urgency?: "normal" | "high" } = {},
): Promise<PushResult> {
  const body = await encryptPayload(payload, subscription);
  const response = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aes128gcm",
      TTL: String(options.ttlSeconds ?? 24 * 3600),
      Urgency: options.urgency ?? "normal",
      Authorization: await vapidAuthorization(subscription.endpoint, vapid),
    },
    body,
  });
  await response.body?.cancel(); // on ne lit pas la réponse : libère la connexion
  return { ok: response.ok, status: response.status, gone: response.status === 404 || response.status === 410 };
}

/** Génère une paire de clés VAPID (à faire une seule fois, voir scripts/generate-vapid.mjs). */
export async function generateVapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const publicRaw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  return { publicKey: base64UrlEncode(publicRaw), privateKey: jwk.d! };
}
