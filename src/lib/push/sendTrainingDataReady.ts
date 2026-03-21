import "server-only";

import { createClient } from "@supabase/supabase-js";
import { isSubscriptionGone, sendWebPush } from "@/lib/push/webPush";

type SubscriptionRow = {
  id: string;
  player_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  is_active: boolean | null;
  updated_at: string | null;
};

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");
  return createClient(url, key, { auth: { persistSession: false } });
}

async function getAllActiveSubscriptions(sb: ReturnType<typeof getAdminClient>) {
  const { data, error } = await sb
    .from("player_push_subscriptions")
    .select("id, player_id, endpoint, p256dh, auth, is_active, updated_at")
    .eq("is_active", true)
    .order("updated_at", { ascending: false });

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as SubscriptionRow[];
  // Deduplicate: one subscription per player (most recently updated)
  const seen = new Set<string>();
  const unique: SubscriptionRow[] = [];
  for (const row of rows) {
    if (!row.player_id || !row.endpoint || !row.p256dh || !row.auth) continue;
    if (seen.has(row.player_id)) continue;
    seen.add(row.player_id);
    unique.push(row);
  }
  return unique;
}

export type TrainingDataReadyResult = {
  totalSubscriptions: number;
  sent: number;
  failed: number;
  removedInvalidTokens: number;
};

/**
 * Sends a push notification to every player with an active subscription
 * informing them that today's training data (from Catapult) is ready.
 * Called from the Catapult daily-sync route after a successful sync.
 */
export async function sendTrainingDataReadyNotification(
  dateKey: string
): Promise<TrainingDataReadyResult> {
  const sb = getAdminClient();
  const subscriptions = await getAllActiveSubscriptions(sb);

  if (!subscriptions.length) {
    return { totalSubscriptions: 0, sent: 0, failed: 0, removedInvalidTokens: 0 };
  }

  const payload = {
    title: "Breidablik Readiness",
    body: "Gögn frá tæfingu dagsins eru komin inn. Skoðaðu GPS.",
    url: "/player",
    type: "training_data_ready",
    screen: "dashboard",
    date_key: dateKey,
  };

  let sent = 0;
  let failed = 0;
  const invalidIds = new Set<string>();

  for (const row of subscriptions) {
    try {
      await sendWebPush({ endpoint: row.endpoint, p256dh: row.p256dh, auth: row.auth }, payload);
      sent += 1;
    } catch (err) {
      failed += 1;
      if (row.id && isSubscriptionGone(err)) {
        invalidIds.add(row.id);
      }
    }
  }

  let removedInvalidTokens = 0;
  if (invalidIds.size > 0) {
    const ids = Array.from(invalidIds);
    const { error } = await sb
      .from("player_push_subscriptions")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .in("id", ids);
    if (!error) removedInvalidTokens = ids.length;
  }

  return { totalSubscriptions: subscriptions.length, sent, failed, removedInvalidTokens };
}
