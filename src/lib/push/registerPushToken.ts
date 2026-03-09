"use client";

import { registerPushSubscription } from "@/lib/push/registerPushSubscription";

export type RegisterPushTokenResult = {
  success: boolean;
  token: string | null;
  reason?: "unsupported" | "denied" | "unauthenticated" | "server-error" | "unknown";
  error?: string;
};

export async function registerPushToken(): Promise<RegisterPushTokenResult> {
  const result = await registerPushSubscription();
  return {
    success: result.success,
    token: result.endpoint ?? null,
    reason: result.reason,
    error: result.error,
  };
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
