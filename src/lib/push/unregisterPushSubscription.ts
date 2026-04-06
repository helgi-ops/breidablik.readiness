"use client";

import { getSupabaseClient } from "@/lib/supabaseClient";

type PushSubscriptionLike = {
  endpoint?: string;
};

function browserSupportsPush(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
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

export async function unregisterPushSubscription(): Promise<void> {
  try {
    if (!browserSupportsPush()) return;

    const registration = await navigator.serviceWorker.ready;
    if (!registration) return;

    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;

    const payload = subscription.toJSON() as PushSubscriptionLike;
    const endpoint = String(payload.endpoint ?? "").trim();

    const headers = await authHeaders();
    if (headers && endpoint) {
      await fetch("/api/push/unregister", {
        method: "POST",
        headers,
        body: JSON.stringify({ endpoint }),
      });
    }

    await subscription.unsubscribe();
  } catch {
    // best-effort only
  }
}
