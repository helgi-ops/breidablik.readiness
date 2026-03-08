"use client";

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getMessaging, getToken, isSupported, type Messaging } from "firebase/messaging";

let _app: FirebaseApp | null = null;
let _messaging: Messaging | null = null;

function firebaseConfig() {
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
}

export function getFirebaseApp(): FirebaseApp {
  if (_app) return _app;
  if (getApps().length) {
    _app = getApps()[0]!;
    return _app;
  }

  _app = initializeApp(firebaseConfig());
  return _app;
}

export async function getMessagingIfSupported(): Promise<Messaging | null> {
  if (typeof window === "undefined") return null;
  if (!("serviceWorker" in navigator)) return null;

  const supported = await isSupported().catch(() => false);
  if (!supported) return null;

  if (_messaging) return _messaging;
  _messaging = getMessaging(getFirebaseApp());
  return _messaging;
}

export async function requestPermissionAndGetFcmToken(): Promise<string> {
  if (typeof window === "undefined") throw new Error("Notifications are only available in the browser.");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notification permission not granted.");
  }

  const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js", { scope: "/" });
  const messaging = await getMessagingIfSupported();

  if (!messaging) throw new Error("Firebase Messaging is not supported in this browser.");

  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
  const token = await getToken(
    messaging,
    vapidKey
      ? { vapidKey, serviceWorkerRegistration: registration }
      : { serviceWorkerRegistration: registration }
  );

  if (!token) throw new Error("Could not obtain FCM token.");
  return token;
}

export async function getExistingFcmTokenIfGranted(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  if (Notification.permission !== "granted") return null;

  const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js", { scope: "/" });
  const messaging = await getMessagingIfSupported();
  if (!messaging) return null;

  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
  const token = await getToken(
    messaging,
    vapidKey
      ? { vapidKey, serviceWorkerRegistration: registration }
      : { serviceWorkerRegistration: registration }
  );

  return token || null;
}
