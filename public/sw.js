self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "Уведомление", body: event.data ? event.data.text() : "" };
  }

  const title = payload && payload.title ? String(payload.title) : "Asia Mix";
  const options = {
    body: payload && payload.body ? String(payload.body) : "",
    icon: "/asiamix-logo.svg",
    badge: "/asiamix-logo.svg",
    data: {
      url: payload && payload.url ? String(payload.url) : "/dashboard",
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl =
    event.notification && event.notification.data && event.notification.data.url
      ? String(event.notification.data.url)
      : "/dashboard";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(targetUrl) && "focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
      return undefined;
    }),
  );
});

