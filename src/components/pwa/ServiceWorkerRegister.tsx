"use client";

import { useEffect } from "react";

/**
 * Enregistre le service worker sur TOUTES les pages, y compris la connexion :
 * le navigateur ne propose l'installation qu'une fois le service worker actif.
 * (La synchronisation des notifications, elle, reste réservée aux utilisateurs connectés : PwaBootstrap.)
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
      // Sans service worker, l'app fonctionne quand même (sans installation ni notifications).
    });
  }, []);
  return null;
}
