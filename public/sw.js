/*
 * Service worker : script que le navigateur garde en arrière-plan, même app fermée.
 * Il reçoit les notifications push et gère le clic sur une notification.
 * (Fichier servi tel quel depuis /sw.js : pas de TypeScript ni d'import ici.)
 */

self.addEventListener("install", () => self.skipWaiting()); // une nouvelle version s'active tout de suite
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

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
