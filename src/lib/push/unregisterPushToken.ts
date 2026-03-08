"use client";

import { getToken } from "firebase/messaging";
import { messaging } from "@/lib/firebase";
import { getSupabaseClient } from "@/lib/supabaseClient";

function browserSupportsPush(): boolean {
  return typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator;
}

async function authHeaders(): Promise<Record<string, string> | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;

  const accessToken = data?.session?.access_token;
  if (!accessToken) return null;

  return {
    Authorization: `Bearer ${accessToken}`,
    "content-type": "application/json",
  };
}

export async function unregisterPushToken(): Promise<void> {
  try {
    if (!browserSupportsPush()) return;
    if (!messaging) return;

    const vapidKey = String(process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY ?? "").trim();
    if (!vapidKey) return;

    const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js", {
      scope: "/",
    });

    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: registration,
    });

    if (!token) return;

    const headers = await authHeaders();
    if (!headers) return;

    await fetch("/api/notifications/unregister-token", {
      method: "POST",
      headers,
      body: JSON.stringify({ fcmToken: token }),
    });
  } catch {
    // best effort only
  }
}

export async function disablePushReminders() {
  await unregisterPushToken();
}
