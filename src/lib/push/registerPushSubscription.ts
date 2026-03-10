"use client";

import { getSupabaseClient } from "@/lib/supabaseClient";

export type RegisterPushSubscriptionErrorCode =
  | "SERVICE_WORKER_UNSUPPORTED"
  | "PUSH_UNSUPPORTED"
  | "NOTIFICATION_UNSUPPORTED"
  | "PERMISSION_DENIED"
  | "VAPID_PUBLIC_KEY_MISSING"
  | "REGISTER_API_FAILED";

export class RegisterPushSubscriptionError extends Error {
  code: RegisterPushSubscriptionErrorCode;

  constructor(code: RegisterPushSubscriptionErrorCode, message?: string) {
    super(message ?? code);
    this.name = "RegisterPushSubscriptionError";
    this.code = code;
  }
}

export type RegisterPushSubscriptionResult = {
  endpoint: string;
};

type PushSubscriptionLike = {
  endpoint: string;
  expirationTime: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
};

function urlBase64ToArrayBuffer(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const bytes = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) bytes[i] = rawData.charCodeAt(i);

  const arrayBuffer = new ArrayBuffer(bytes.length);
  new Uint8Array(arrayBuffer).set(bytes);
  return arrayBuffer;
}

function assertSupported() {
  if (typeof window === "undefined" || !("Notification" in window)) {
    throw new RegisterPushSubscriptionError("NOTIFICATION_UNSUPPORTED");
  }
  if (!("serviceWorker" in navigator)) {
    throw new RegisterPushSubscriptionError("SERVICE_WORKER_UNSUPPORTED");
  }
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
    assertSupported();

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      throw new RegisterPushSubscriptionError("PERMISSION_DENIED");
    }

    const vapidPublicKey = String(
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY ?? ""
    ).trim();
    if (!vapidPublicKey) {
      throw new RegisterPushSubscriptionError("VAPID_PUBLIC_KEY_MISSING");
    }

    await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    const registration = await navigator.serviceWorker.ready;

    if (!registration.pushManager) {
      throw new RegisterPushSubscriptionError("PUSH_UNSUPPORTED");
    }

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToArrayBuffer(vapidPublicKey),
      });
    }

    const json = subscription.toJSON() as PushSubscriptionLike;
    if (!json?.endpoint || !json?.keys?.p256dh || !json?.keys?.auth) {
      throw new RegisterPushSubscriptionError("REGISTER_API_FAILED", "Invalid push subscription payload");
    }

    const headers = await authHeaders();
    if (!headers) {
      throw new RegisterPushSubscriptionError("REGISTER_API_FAILED", "Missing bearer token");
    }

    const res = await fetch("/api/push/register", {
      method: "POST",
      headers,
      body: JSON.stringify({ subscription: json, userAgent: navigator.userAgent }),
    });

    const responseJson = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !responseJson?.ok) {
      throw new RegisterPushSubscriptionError("REGISTER_API_FAILED", responseJson?.error || "Failed to register subscription");
    }

    return { endpoint: json.endpoint };
  } catch (error: unknown) {
    if (error instanceof RegisterPushSubscriptionError) throw error;

    const message = error instanceof Error ? error.message : "Unknown error";

    if (message.includes("PushManager") || message.includes("push service")) {
      throw new RegisterPushSubscriptionError("PUSH_UNSUPPORTED", message);
    }
    if (message.includes("ServiceWorker") || message.includes("service worker") || message.includes("secure context")) {
      throw new RegisterPushSubscriptionError("SERVICE_WORKER_UNSUPPORTED", message);
    }

    throw new RegisterPushSubscriptionError("REGISTER_API_FAILED", message);
  }
}
