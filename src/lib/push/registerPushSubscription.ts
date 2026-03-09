"use client";

import { getSupabaseClient } from "@/lib/supabaseClient";

export type RegisterPushSubscriptionResult = {
  success: boolean;
  endpoint: string | null;
  reason?: "unsupported" | "denied" | "unauthenticated" | "server-error" | "unknown";
  error?: string;
};

type PushSubscriptionLike = {
  endpoint: string;
  expirationTime: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
};

function browserSupportsPush(): boolean {
  return typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
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

export async function registerPushSubscription(): Promise<RegisterPushSubscriptionResult> {
  try {
    if (!browserSupportsPush()) {
      return { success: false, endpoint: null, reason: "unsupported" };
    }

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      return { success: false, endpoint: null, reason: "denied" };
    }

    const vapidPublicKey = String(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "").trim();
    if (!vapidPublicKey) {
      return { success: false, endpoint: null, reason: "server-error", error: "Missing NEXT_PUBLIC_VAPID_PUBLIC_KEY" };
    }

    const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });
    }

    const json = subscription.toJSON() as PushSubscriptionLike;
    if (!json?.endpoint || !json?.keys?.p256dh || !json?.keys?.auth) {
      return { success: false, endpoint: null, reason: "server-error", error: "Invalid push subscription payload" };
    }

    const headers = await authHeaders();
    if (!headers) {
      return { success: false, endpoint: json.endpoint, reason: "unauthenticated" };
    }

    const res = await fetch("/api/push/register", {
      method: "POST",
      headers,
      body: JSON.stringify({ subscription: json }),
    });

    const responseJson = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };

    if (!res.ok || !responseJson?.ok) {
      return {
        success: false,
        endpoint: json.endpoint,
        reason: "server-error",
        error: responseJson?.error || "Failed to register subscription",
      };
    }

    return {
      success: true,
      endpoint: json.endpoint,
    };
  } catch (error: unknown) {
    return {
      success: false,
      endpoint: null,
      reason: "unknown",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
