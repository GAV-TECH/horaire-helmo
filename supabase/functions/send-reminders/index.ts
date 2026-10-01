/**
 * Edge Function Supabase "send-reminders" (Deno).
 * Appelée chaque minute par pg_cron (voir supabase/cron.sql) :
 * 1. réserve les rappels arrivés à échéance (claim_due_reminders) : une ligne par destinataire
 *    (l'auteur, ou chaque membre du groupe pour un rappel partagé, sauf ceux qui l'ont coupé) ;
 * 2. envoie une notification Web Push à chaque appareil de l'utilisateur ;
 * 3. supprime les abonnements qui n'existent plus (réponse 404/410).
 *
 * Déploiement : voir README (npx supabase functions deploy send-reminders …).
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildDigest, buildNotification, type DigestRow, type DueReminder } from "./message.ts";
import { sendWebPush, type VapidKeys } from "./webpush.ts";

/** Comparaison en temps constant : ne révèle pas, par la durée de réponse, combien de caractères sont justes. */
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function env(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Secret manquant : ${name}`);
  return value;
}

Deno.serve(async (req) => {
  if (!safeEqual(req.headers.get("x-cron-secret") ?? "", env("CRON_SECRET"))) {
    return new Response("Accès refusé", { status: 403 });
  }

  // SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournis automatiquement aux Edge Functions.
  const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const vapid: VapidKeys = {
    publicKey: env("VAPID_PUBLIC_KEY"),
    privateKey: env("VAPID_PRIVATE_KEY"),
    subject: env("VAPID_SUBJECT"),
  };

  const now = new Date();
  /** Notifications à envoyer : rappels arrivés à échéance + débriefs du soir. */
  const outbox: { userId: string; payload: string }[] = [];

  const { data, error } = await db.rpc("claim_due_reminders", { max_rows: 200 });
  if (error) {
    console.error("claim_due_reminders :", error.message);
    return Response.json({ error: "claim" }, { status: 500 });
  }
  const due = (data ?? []) as DueReminder[];
  for (const reminder of due) {
    const notification = buildNotification(reminder, now);
    if (notification) outbox.push({ userId: reminder.recipient_id, payload: JSON.stringify(notification) }); // sinon : fait / annulé / trop ancien
  }

  // Débrief quotidien (migration 0006). Si la fonction SQL n'existe pas encore, on l'ignore.
  const { data: digestData, error: digestError } = await db.rpc("claim_daily_digests");
  if (digestError) console.error("claim_daily_digests :", digestError.message);
  const digests = (digestData ?? []) as DigestRow[];
  for (const digest of digests) outbox.push({ userId: digest.user_id, payload: JSON.stringify(buildDigest(digest, now)) });

  if (outbox.length === 0) return Response.json({ claimed: 0, digests: 0, sent: 0 });

  const userIds = [...new Set(outbox.map((n) => n.userId))];
  const { data: subs, error: subsError } = await db
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth")
    .in("user_id", userIds);
  if (subsError) {
    console.error("push_subscriptions :", subsError.message);
    return Response.json({ error: "subscriptions" }, { status: 500 });
  }

  let sent = 0;
  let failed = 0;
  const gone = new Set<string>();

  for (const { userId, payload } of outbox) {
    for (const sub of subs ?? []) {
      if (sub.user_id !== userId || gone.has(sub.id)) continue;
      try {
        const result = await sendWebPush(sub, payload, vapid, { urgency: "high" });
        if (result.ok) sent++;
        else if (result.gone) gone.add(sub.id);
        else {
          failed++;
          console.error("push refusé", result.status, new URL(sub.endpoint).host);
        }
      } catch (e) {
        failed++;
        console.error("push en erreur", new URL(sub.endpoint).host, String(e));
      }
    }
  }

  if (gone.size > 0) await db.from("push_subscriptions").delete().in("id", [...gone]);
  return Response.json({ claimed: due.length, digests: digests.length, sent, failed, removed: gone.size });
});
