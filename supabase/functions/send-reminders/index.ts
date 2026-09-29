/**
 * Edge Function Supabase "send-reminders" (Deno).
 * Appelée chaque minute par pg_cron (voir supabase/cron.sql) :
 * 1. réserve les rappels arrivés à échéance (claim_due_reminders) ;
 * 2. envoie une notification Web Push à chaque appareil de l'utilisateur ;
 * 3. supprime les abonnements qui n'existent plus (réponse 404/410).
 *
 * Déploiement : voir README (npx supabase functions deploy send-reminders …).
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildNotification, type DueReminder } from "./message.ts";
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

  const { data, error } = await db.rpc("claim_due_reminders", { max_rows: 200 });
  if (error) {
    console.error("claim_due_reminders :", error.message);
    return Response.json({ error: "claim" }, { status: 500 });
  }
  const due = (data ?? []) as DueReminder[];
  if (due.length === 0) return Response.json({ claimed: 0, sent: 0 });

  const userIds = [...new Set(due.map((r) => r.user_id))];
  const { data: subs, error: subsError } = await db
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth")
    .in("user_id", userIds);
  if (subsError) {
    console.error("push_subscriptions :", subsError.message);
    return Response.json({ error: "subscriptions" }, { status: 500 });
  }

  const now = new Date();
  let sent = 0;
  let failed = 0;
  const gone = new Set<string>();

  for (const reminder of due) {
    const notification = buildNotification(reminder, now);
    if (!notification) continue; // cible faite / annulée, ou rappel trop ancien
    const payload = JSON.stringify(notification);
    for (const sub of subs ?? []) {
      if (sub.user_id !== reminder.user_id || gone.has(sub.id)) continue;
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
  return Response.json({ claimed: due.length, sent, failed, removed: gone.size });
});
