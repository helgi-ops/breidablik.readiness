self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = payload.title || 'MicroPulse';
  const body = payload.body || 'You have a new reminder.';
  const url = payload.url || '/player/checkin';
  const icon = payload.icon || '/icons/icon-192.png';
  const badge = payload.badge || '/icons/icon-192.png';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge,
      data: { url },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl =
    (event.notification && event.notification.data && event.notification.data.url) ||
    '/player/checkin';

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        const normalizedTarget = new URL(targetUrl, self.location.origin).href;

        for (const client of windowClients) {
          if (client.url === normalizedTarget || client.url.startsWith(normalizedTarget)) {
            return client.focus();
          }
        }

        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }

        return undefined;
      })
  );
});
