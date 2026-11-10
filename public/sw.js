/*
 * Service worker de la plataforma HSEA: recibe las notificaciones push de firmas pendientes y, al tocarlas,
 * abre el permiso (o enfoca la pestaña que ya lo tenga abierto). No guarda nada en caché.
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Gestión HSEA";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/iconos/icono-192.png",
      badge: "/iconos/insignia-96.png",
      tag: data.tag,
      renotify: Boolean(data.tag),
      data: { url: data.url || "/inicio" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/inicio", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const same = windows.find((client) => client.url === target);
      if (same) return same.focus();
      const any = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (any) {
        await any.focus();
        return any.navigate(target);
      }
      return self.clients.openWindow(target);
    })(),
  );
});
