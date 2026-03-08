"use client";

import { getToken } from "firebase/messaging";
import { messaging } from "@/lib/firebase";
import { getSupabaseClient } from "@/lib/supabaseClient";

export type RegisterPushTokenResult = {
  success: boolean;
  token: string | null;
  reason?: "unsupported" | "denied" | "no-token" | "unauthenticated" | "server-error" | "unknown";
  error?: string;
};

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

export async function registerPushToken(): Promise<RegisterPushTokenResult> {
  try {
    if (!browserSupportsPush()) {
      return { success: false, token: null, reason: "unsupported" };
    }

    const vapidKey = String(process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY ?? "").trim();

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      return { success: false, token: null, reason: "denied" };
    }

    if (!messaging) {
      return { success: false, token: null, reason: "unsupported", error: "Firebase messaging is unavailable" };
    }

    const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js", {
      scope: "/",
    });

    const token = await getToken(
      messaging,
      vapidKey
        ? {
            vapidKey,
            serviceWorkerRegistration: registration,
          }
        : {
            serviceWorkerRegistration: registration,
          }
    );

    if (!token) {
      return { success: false, token: null, reason: "no-token" };
    }

    const headers = await authHeaders();
    if (!headers) {
      return { success: false, token: token, reason: "unauthenticated" };
    }

    const res = await fetch("/api/notifications/register-token", {
      method: "POST",
      headers,
      body: JSON.stringify({
        fcmToken: token,
        platform: "web",
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      }),
    });

    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };

    if (!res.ok || !json?.ok) {
      return {
        success: false,
        token,
        reason: "server-error",
        error: json?.error || "Failed to register token",
      };
    }

    return {
      success: true,
      token,
    };
  } catch (error: unknown) {
    return {
      success: false,
      token: null,
      reason: "unknown",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function enablePushReminders() {
  const result = await registerPushToken();
  if (!result.success) throw new Error(result.error || result.reason || "Could not enable reminders");
  return { token: result.token };
}

export async function syncPushRemindersIfGranted() {
  if (typeof window === "undefined" || !browserSupportsPush()) return null;
  if (Notification.permission !== "granted") return null;

  const result = await registerPushToken();
  if (!result.success) return null;
  return result.token;
}
