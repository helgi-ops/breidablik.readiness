// Force immediate activation so badge fixes take effect without waiting
// for the user to close and reopen all tabs.
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// ── Badge helper ────────────────────────────────────────────────────────────
// Try every known path for the Badge API across browsers and contexts.
function setAppBadge(count) {
  try {
    // Standard: WorkerNavigator (Chrome 81+, iOS 16.4+ in SW context)
    if (self.navigator && 'setAppBadge' in self.navigator) {
      return self.navigator.setAppBadge(count);
    }
  } catch { /* ignore */ }
  return Promise.resolve();
}

function clearAppBadge() {
  try {
    if (self.navigator && 'clearAppBadge' in self.navigator) {
      return self.navigator.clearAppBadge();
    }
  } catch { /* ignore */ }
  return Promise.resolve();
}

// ── Push handler ────────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = payload.title || 'MicroPulse';
  const body  = payload.body  || 'You have a new reminder.';
  const url   = payload.url   || '/player/checkin';
  const icon  = payload.icon  || '/icons/icon-192.png';
  const badge = payload.badge || '/icons/icon-192.png';

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, {
        body,
        icon,
        badge,
        data: { url },
      }),
      setAppBadge(1),
    ])
  );
});

// ── Notification click ──────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  clearAppBadge();

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

        return clients.openWindow ? clients.openWindow(targetUrl) : undefined;
      })
  );
});
