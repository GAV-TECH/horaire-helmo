"use client";

import { useEffect } from "react";
import { savePushSubscription } from "@/lib/actions/push";
import { pushSupported } from "./push-client";

/**
 * Au chargement de l'app (utilisateur connecté) :
 * 1. enregistre le service worker (nécessaire pour l'installation et les notifications) ;
 * 2. si cet appareil est déjà abonné, renvoie l'abonnement au serveur une fois par session :
 *    le navigateur peut le renouveler à tout moment, et l'appareil a pu changer de compte.
 */
export function PwaBootstrap() {
  useEffect(() => {
    if (!pushSupported()) return;
    (async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
        if (Notification.permission !== "granted" || sessionStorage.getItem("push-synced")) return;
        const subscription = await registration.pushManager.getSubscription();
        if (!subscription) return;
        const result = await savePushSubscription(subscription.toJSON(), navigator.userAgent);
        if (result.ok) sessionStorage.setItem("push-synced", "1");
      } catch {
        // Sans service worker, l'app fonctionne quand même (juste sans notifications).
      }
    })();
  }, []);
  return null;
}
