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

  // Set app icon badge (red dot on home screen) — Badge API v2
  // In service worker context the API lives on self.navigator (WorkerNavigator)
  const setBadge = () => {
    try {
      if (self.navigator && 'setAppBadge' in self.navigator) {
        return self.navigator.setAppBadge(1);
      }
    } catch {
      // Not supported — silently ignore
    }
    return Promise.resolve();
  };

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, {
        body,
        icon,
        badge,
        data: { url },
      }),
      setBadge(),
    ])
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  // Clear the app icon badge when the user taps the notification
  try {
    if (self.navigator && 'clearAppBadge' in self.navigator) {
      self.navigator.clearAppBadge();
    }
  } catch {
    // Not supported — silently ignore
  }

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
