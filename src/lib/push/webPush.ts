import "server-only";

import webpush, { type PushSubscription, type SendResult } from "web-push";

let configured = false;

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

function configureWebPush() {
  if (configured) return;
  webpush.setVapidDetails(
    required("VAPID_SUBJECT"),
    required("NEXT_PUBLIC_VAPID_PUBLIC_KEY"),
    required("VAPID_PRIVATE_KEY")
  );
  configured = true;
}

export type NativePushSubscription = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export function toWebPushSubscription(input: NativePushSubscription): PushSubscription {
  return {
    endpoint: input.endpoint,
    keys: {
      p256dh: input.p256dh,
      auth: input.auth,
    },
  };
}

export async function sendWebPush(
  subscription: NativePushSubscription,
  payload: Record<string, unknown>
): Promise<SendResult> {
  configureWebPush();
  return webpush.sendNotification(toWebPushSubscription(subscription), JSON.stringify(payload));
}

export function isSubscriptionGone(error: unknown): boolean {
  const err = error as { statusCode?: number; body?: string } | null | undefined;
  const status = err?.statusCode ?? 0;
  return status === 404 || status === 410;
}
