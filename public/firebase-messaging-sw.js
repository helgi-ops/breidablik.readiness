importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyDzmve86nb_K4SoZEaZBc6acBKb4qILBMM",
  authDomain: "micropulse-a2f26.firebaseapp.com",
  projectId: "micropulse-a2f26",
  storageBucket: "micropulse-a2f26.firebasestorage.app",
  messagingSenderId: "724954192202",
  appId: "1:724954192202:web:92d3be04ddf881096e49b3",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload?.notification?.title || "Breiðablik Readiness";
  const body = payload?.notification?.body || "Please complete today's readiness check-in.";
  const clickUrl = payload?.data?.screen === "checkin" ? "/player/checkin" : "/player";

  self.registration.showNotification(title, {
    body,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: {
      url: clickUrl,
    },
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || "/player/checkin";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(targetUrl) && "focus" in client) {
            return client.focus();
          }
        }

        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
        return null;
      })
  );
});
