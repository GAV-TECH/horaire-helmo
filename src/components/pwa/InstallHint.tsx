"use client";

import { useEffect, useState } from "react";
import { buttonClass, cardClass } from "@/components/ui";
import { isIos, isStandalone } from "./push-client";

/** Évènement non standard de Chrome/Edge/Android, absent des types TypeScript. */
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** Aide à l'installation de l'app sur l'écran d'accueil. */
export function InstallHint() {
  const [mode, setMode] = useState<"hidden" | "installed" | "ios" | "prompt" | "menu">("hidden");
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault(); // on garde l'évènement pour proposer notre propre bouton
      setPromptEvent(e as InstallPromptEvent);
      setMode("prompt");
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    // Détection après l'affichage (navigator n'existe pas côté serveur).
    const timer = setTimeout(() => setMode((m) => (m !== "hidden" ? m : isStandalone() ? "installed" : isIos() ? "ios" : "menu")), 0);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      clearTimeout(timer);
    };
  }, []);

  if (mode === "hidden") return null;
  return (
    <section className={cardClass}>
      <h2 className="mb-1 font-semibold">Installer l&apos;application</h2>
      {mode === "installed" && <p className="text-sm text-green-700 dark:text-green-400">✓ L&apos;app est installée sur cet appareil.</p>}
      {mode === "ios" && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Dans Safari, touche <strong>Partager</strong> puis <strong>« Sur l&apos;écran d&apos;accueil »</strong>.
        </p>
      )}
      {mode === "menu" && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Dans le menu du navigateur (⋮), choisis <strong>« Installer l&apos;application »</strong> ou{" "}
          <strong>« Ajouter à l&apos;écran d&apos;accueil »</strong>. Nécessite une adresse en HTTPS (ou localhost).
        </p>
      )}
      {mode === "prompt" && promptEvent && (
        <button
          type="button"
          className={buttonClass.primary}
          onClick={async () => {
            await promptEvent.prompt();
            const { outcome } = await promptEvent.userChoice;
            setMode(outcome === "accepted" ? "installed" : "menu");
          }}
        >
          Installer sur cet appareil
        </button>
      )}
    </section>
  );
}
