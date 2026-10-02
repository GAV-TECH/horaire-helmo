/*
 * Service worker : script que le navigateur garde en arrière-plan, même app fermée.
 * Il reçoit les notifications push et gère le clic sur une notification.
 * (Fichier servi tel quel depuis /sw.js : pas de TypeScript ni d'import ici.)
 */

self.addEventListener("install", () => self.skipWaiting()); // une nouvelle version s'active tout de suite
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

/*
 * Navigation : on passe par le réseau (pas de cache : l'horaire doit toujours être à jour).
 * Sans réseau, on affiche une petite page "hors ligne" au lieu de l'erreur du navigateur.
 * Plusieurs navigateurs exigent aussi ce gestionnaire pour proposer l'installation de l'app.
 */
const OFFLINE_PAGE = `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Hors ligne · Horaire HELMO</title>
<body style="font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center;padding:1rem">
<div><p style="font-size:2rem;margin:0">📡</p><h1 style="font-size:1.2rem">Pas de connexion</h1>
<p style="color:#71717a">L'horaire s'affichera dès que la connexion reviendra.</p>
<button onclick="location.reload()" style="padding:.5rem 1rem;border-radius:.4rem;border:1px solid #d4d4d8;background:none;font:inherit">Réessayer</button></div></body></html>`;

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return; // images, scripts, API : comportement normal du navigateur
  event.respondWith(
    fetch(event.request).catch(
      () => new Response(OFFLINE_PAGE, { headers: { "Content-Type": "text/html; charset=utf-8" } }),
    ),
  );
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Horaire HELMO", {
      body: data.body || "",
      tag: data.tag, // même tag = remplace la notification précédente au lieu d'en empiler une nouvelle
      // Sans renotify, une notification qui en remplace une autre (même tag) s'affiche en silence :
      // le 2e message d'une discussion passerait inaperçu.
      renotify: Boolean(data.tag),
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      lang: "fr",
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      // Si l'app est déjà ouverte, on la ramène au premier plan sur la bonne page ; sinon on l'ouvre.
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if (client.url.startsWith(self.location.origin)) {
          await client.focus();
          return client.navigate(url);
        }
      }
      return self.clients.openWindow(url);
    })(),
  );
});
