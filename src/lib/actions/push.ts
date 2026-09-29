"use server";

import { z } from "zod";
import { serverEnv } from "@/lib/env";
import { sendWebPush } from "../../../supabase/functions/send-reminders/webpush";
import { actionContext, dbFail, fail, ok, type ActionResult } from "./context";

/** Forme de PushSubscription.toJSON() renvoyée par le navigateur. */
const subscriptionSchema = z.object({
  endpoint: z.url({ protocol: /^https$/ }).max(1000),
  keys: z.object({ p256dh: z.string().min(20).max(200), auth: z.string().min(8).max(100) }),
});

/** Enregistre l'abonnement de cet appareil (ou le rattache à l'utilisateur courant). */
export async function savePushSubscription(subscription: unknown, userAgent: string): Promise<ActionResult> {
  const { user, supabase } = await actionContext();
  const parsed = subscriptionSchema.safeParse(subscription);
  if (!parsed.success) return fail("Abonnement invalide.");
  const { endpoint, keys } = parsed.data;

  // Un même navigateur peut avoir servi à un autre compte : on retire l'ancienne ligne
  // (invisible via le RLS, donc via une suppression par endpoint limitée à nos lignes) puis on insère.
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  const { error } = await supabase.from("push_subscriptions").insert({
    user_id: user.id,
    endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
    user_agent: userAgent.slice(0, 300),
  });
  if (error) {
    // 23505 = violation d'unicité : l'endpoint est encore lié à un autre compte.
    if (error.code === "23505") return fail("Cet appareil est déjà abonné avec un autre compte. Désactive-le depuis cet autre compte.");
    return dbFail(error, "savePushSubscription");
  }
  return ok("Notifications activées sur cet appareil.");
}

export async function removePushSubscription(endpoint: string): Promise<ActionResult> {
  const { supabase } = await actionContext();
  if (typeof endpoint !== "string" || endpoint.length > 1000) return fail("Abonnement invalide.");
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  if (error) return dbFail(error, "removePushSubscription");
  return ok("Notifications désactivées sur cet appareil.");
}

/** Envoie tout de suite une notification de test à tous les appareils de l'utilisateur. */
export async function sendTestPush(): Promise<ActionResult> {
  const { user, supabase } = await actionContext();
  const env = serverEnv();
  if (!env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) {
    return fail("Les clés VAPID ne sont pas configurées (voir README).");
  }
  const vapid = { publicKey: env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: env.VAPID_SUBJECT };

  const { data: subs, error } = await supabase.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", user.id);
  if (error) return dbFail(error, "sendTestPush");
  if (!subs?.length) return fail("Aucun appareil abonné : active d'abord les notifications.");

  const payload = JSON.stringify({ title: "Horaire HELMO", body: "Les notifications fonctionnent 🎉", url: "/rappels", tag: "test" });
  let sent = 0;
  for (const sub of subs) {
    try {
      const result = await sendWebPush(sub, payload, vapid, { ttlSeconds: 300 });
      if (result.ok) sent++;
      else if (result.gone) await supabase.from("push_subscriptions").delete().eq("id", sub.id);
      else console.error("[push:test] refusé", result.status, new URL(sub.endpoint).host);
    } catch (e) {
      console.error("[push:test] erreur", new URL(sub.endpoint).host, String(e));
    }
  }
  return sent > 0 ? ok(`Notification envoyée à ${sent} appareil(s).`) : fail("L'envoi a échoué. Réactive les notifications sur cet appareil.");
}
