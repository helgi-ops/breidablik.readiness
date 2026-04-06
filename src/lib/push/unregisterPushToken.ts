"use client";

import { unregisterPushSubscription } from "@/lib/push/unregisterPushSubscription";

export async function unregisterPushToken(): Promise<void> {
  await unregisterPushSubscription();
}

export async function disablePushReminders() {
  await unregisterPushToken();
}
