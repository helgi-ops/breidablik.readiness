"use client";

import {
  registerPushSubscription,
  RegisterPushSubscriptionError,
} from "@/lib/push/registerPushSubscription";

export type RegisterPushTokenResult = {
  success: boolean;
  token: string | null;
  reason?:
    | "NOTIFICATION_UNSUPPORTED"
    | "SERVICE_WORKER_UNSUPPORTED"
    | "PUSH_UNSUPPORTED"
    | "PERMISSION_DENIED"
    | "VAPID_PUBLIC_KEY_MISSING"
    | "REGISTER_API_FAILED"
    | "UNKNOWN";
  error?: string;
};

export async function registerPushToken(): Promise<RegisterPushTokenResult> {
  try {
    const result = await registerPushSubscription();
    return {
      success: true,
      token: result.endpoint,
    };
  } catch (error: unknown) {
    if (error instanceof RegisterPushSubscriptionError) {
      return {
        success: false,
        token: null,
        reason: error.code,
        error: error.message,
      };
    }
    return {
      success: false,
      token: null,
      reason: "UNKNOWN",
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
  if (typeof window === "undefined") return null;
  if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) return null;
  if (Notification.permission !== "granted") return null;

  const result = await registerPushToken();
  if (!result.success) return null;
  return result.token;
}
