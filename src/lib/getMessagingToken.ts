import { getToken } from "firebase/messaging";
import { messaging } from "@/lib/firebase";

export async function getMessagingToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  if (!("Notification" in window)) return null;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return null;

  const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js", {
    scope: "/",
  });

  if (!messaging) {
    throw new Error("Firebase messaging is not available in this browser.");
  }

  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

  const token = await getToken(
    messaging,
    vapidKey
      ? { vapidKey, serviceWorkerRegistration: registration }
      : { serviceWorkerRegistration: registration }
  );

  return token || null;
}
