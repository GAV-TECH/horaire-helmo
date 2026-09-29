/**
 * Prépare la configuration des notifications (à lancer une fois) : npm run setup:push
 *
 * 1. Génère les clés VAPID et le secret de la tâche planifiée, et les AJOUTE à .env.local
 *    (sans rien écraser : si elles existent déjà, elles sont réutilisées).
 * 2. Écrit supabase/.env.functions : les secrets à donner à l'Edge Function.
 * 3. Écrit supabase/cron.local.sql : le SQL de planification, prêt à coller dans Supabase.
 *
 * Aucun secret n'est affiché à l'écran. Les deux fichiers générés sont ignorés par Git.
 */
import { randomBytes, webcrypto } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const ENV_FILE = ".env.local";
if (!existsSync(ENV_FILE)) {
  console.error("✗ .env.local introuvable : lance ce script depuis le dossier du projet.");
  process.exit(1);
}

const base64Url = (bytes) => Buffer.from(bytes).toString("base64url");
const text = readFileSync(ENV_FILE, "utf8");
const env = Object.fromEntries(
  text
    .split(/\r?\n/)
    .filter((line) => /^[A-Z0-9_]+=/.test(line))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1).trim()]),
);

const additions = [];
if (!env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
  const pair = await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = base64Url(new Uint8Array(await webcrypto.subtle.exportKey("raw", pair.publicKey)));
  env.VAPID_PRIVATE_KEY = (await webcrypto.subtle.exportKey("jwk", pair.privateKey)).d;
  additions.push(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${env.NEXT_PUBLIC_VAPID_PUBLIC_KEY}`, `VAPID_PRIVATE_KEY=${env.VAPID_PRIVATE_KEY}`);
}
if (!env.VAPID_SUBJECT) {
  // Contact transmis aux services de push (Google, Apple…) en cas de problème : mets ton e-mail si tu veux.
  env.VAPID_SUBJECT = "mailto:admin@example.com";
  additions.push(`VAPID_SUBJECT=${env.VAPID_SUBJECT}`);
}
if (!env.CRON_SECRET) {
  env.CRON_SECRET = randomBytes(32).toString("base64url");
  additions.push(`CRON_SECRET=${env.CRON_SECRET}`);
}

if (additions.length > 0) {
  const block = ["", "# --- Notifications (ajouté par npm run setup:push) ---", ...additions, ""].join("\n");
  writeFileSync(ENV_FILE, text.replace(/\s*$/, "\n") + block);
  console.log(`✓ ${additions.length} valeur(s) ajoutée(s) à .env.local`);
} else {
  console.log("✓ .env.local contient déjà les clés : elles sont réutilisées");
}

writeFileSync(
  "supabase/.env.functions",
  [
    `VAPID_PUBLIC_KEY=${env.NEXT_PUBLIC_VAPID_PUBLIC_KEY}`,
    `VAPID_PRIVATE_KEY=${env.VAPID_PRIVATE_KEY}`,
    `VAPID_SUBJECT=${env.VAPID_SUBJECT}`,
    `CRON_SECRET=${env.CRON_SECRET}`,
    "",
  ].join("\n"),
);
console.log("✓ supabase/.env.functions écrit (secrets de l'Edge Function)");

const projectRef = new URL(env.NEXT_PUBLIC_SUPABASE_URL ?? "https://INCONNU.supabase.co").hostname.split(".")[0];
const cronSql = readFileSync("supabase/cron.sql", "utf8")
  .replaceAll("<PROJECT_REF>", projectRef)
  .replaceAll("<CRON_SECRET>", env.CRON_SECRET);
writeFileSync("supabase/cron.local.sql", cronSql);
console.log(`✓ supabase/cron.local.sql écrit (projet ${projectRef})`);
console.log("\nÉtapes suivantes : voir README, section « Notifications ».");
