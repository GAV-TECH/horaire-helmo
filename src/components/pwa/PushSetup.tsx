"use client";

import { useEffect, useState, useTransition } from "react";
import { removePushSubscription, savePushSubscription, sendTestPush } from "@/lib/actions/push";
import type { ActionResult } from "@/lib/actions/context";
import { ActionMessage, buttonClass, cardClass } from "@/components/ui";
import { VAPID_PUBLIC_KEY, base64UrlToBytes, currentSubscription, isIos, isStandalone, pushSupported } from "./push-client";

type State = "loading" | "unsupported" | "ios-install" | "no-key" | "denied" | "off" | "on";

/** Activation / désactivation des notifications sur CET appareil, et envoi d'un test. */
export function PushSetup() {
  const [state, setState] = useState<State>("loading");
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  // Détection des capacités du navigateur : uniquement possible côté client, après l'affichage.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let next: State;
      if (!pushSupported()) next = isIos() && !isStandalone() ? "ios-install" : "unsupported";
      else if (!VAPID_PUBLIC_KEY) next = "no-key";
      else if (Notification.permission === "denied") next = "denied";
      else next = (await currentSubscription()) ? "on" : "off";
      if (!cancelled) setState(next);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const enable = () =>
    startTransition(async () => {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(VAPID_PUBLIC_KEY) }));
      const r = await savePushSubscription(subscription.toJSON(), navigator.userAgent);
      setResult(r);
      if (r.ok) setState("on");
    });

  const disable = () =>
    startTransition(async () => {
      const subscription = await currentSubscription();
      if (subscription) {
        setResult(await removePushSubscription(subscription.endpoint));
        await subscription.unsubscribe();
      }
      setState("off");
    });

  const test = () => startTransition(async () => setResult(await sendTestPush()));

  return (
    <section className={cardClass}>
      <h2 className="mb-1 font-semibold">Notifications sur cet appareil</h2>
      {state === "loading" && <p className="text-sm text-zinc-500">Vérification…</p>}
      {state === "unsupported" && (
        <p className="text-sm text-zinc-500">
          Ce navigateur ne gère pas les notifications push (ou la page n&apos;est pas en HTTPS). Les rappels restent visibles ci-dessous.
        </p>
      )}
      {state === "ios-install" && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Sur iPhone, les notifications ne fonctionnent qu&apos;une fois l&apos;app installée : touche le bouton <strong>Partager</strong>{" "}
          puis <strong>« Sur l&apos;écran d&apos;accueil »</strong>, et ouvre l&apos;app depuis son icône.
        </p>
      )}
      {state === "no-key" && <p className="text-sm text-zinc-500">Les clés VAPID ne sont pas configurées (voir README).</p>}
      {state === "denied" && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Les notifications sont bloquées pour ce site. Autorise-les dans les réglages du navigateur (icône à gauche de l&apos;adresse), puis
          recharge la page.
        </p>
      )}
      {(state === "off" || state === "on") && (
        <div className="flex flex-wrap items-center gap-2">
          <span className={`mr-auto text-sm ${state === "on" ? "text-green-700 dark:text-green-400" : "text-zinc-500"}`}>
            {state === "on" ? "✓ Activées" : "Désactivées"}
          </span>
          {state === "off" ? (
            <button type="button" onClick={enable} disabled={pending} className={buttonClass.primary}>
              Activer les notifications
            </button>
          ) : (
            <>
              <button type="button" onClick={test} disabled={pending} className={buttonClass.secondary}>
                Envoyer un test
              </button>
              <button type="button" onClick={disable} disabled={pending} className={buttonClass.danger}>
                Désactiver
              </button>
            </>
          )}
        </div>
      )}
      <div className="mt-2">
        <ActionMessage result={result} />
      </div>
    </section>
  );
}
