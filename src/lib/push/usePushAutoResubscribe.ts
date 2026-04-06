"use client";

import { useEffect } from "react";
import { registerPushSubscription } from "./registerPushSubscription";

/**
 * Silently re-registers the push subscription on every app load.
 *
 * - Does nothing if the browser hasn't granted notification permission.
 * - If the user already said "yes", this runs in the background and:
 *   a) Creates a fresh subscription if none exists (e.g. cleared browser data).
 *   b) Detects VAPID key rotation and re-subscribes with the new key.
 * - Never shows any UI — errors are swallowed intentionally.
 */
export function usePushAutoResubscribe() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) return;
    // Only auto-run if the user already granted permission.
    // If permission is "default" they'll see the explicit prompt instead.
    if (Notification.permission !== "granted") return;

    registerPushSubscription().catch(() => {
      // Silently ignore — no push subscription just means no push reminders.
    });
  }, []);
}
