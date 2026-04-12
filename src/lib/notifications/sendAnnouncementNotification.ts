import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isSubscriptionGone,
  sendWebPush,
  type NativePushSubscription,
} from "@/lib/push/webPush";

type SubscriptionRow = {
  id: string;
  player_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

/**
 * Get all active push subscriptions for players on a given team.
 * Returns the most recently updated subscription per player.
 */
async function getTeamSubscriptions(
  sb: SupabaseClient,
  teamId: string,
): Promise<Map<string, SubscriptionRow>> {
  // Get all player IDs on this team
  const { data: players, error: pErr } = await sb
    .from("players")
    .select("id")
    .eq("team_id", teamId);

  if (pErr || !players?.length) return new Map();

  const playerIds = players.map((p: { id: string }) => p.id);

  const { data: subs, error: sErr } = await sb
    .from("player_push_subscriptions")
    .select("id, player_id, endpoint, p256dh, auth")
    .eq("is_active", true)
    .in("player_id", playerIds)
    .order("updated_at", { ascending: false });

  if (sErr || !subs) return new Map();

  // One subscription per player (latest)
  const map = new Map<string, SubscriptionRow>();
  for (const row of subs as SubscriptionRow[]) {
    if (!row.endpoint || !row.p256dh || !row.auth) continue;
    if (!map.has(row.player_id)) map.set(row.player_id, row);
  }
  return map;
}

/**
 * Send a push notification about a new team announcement to all players.
 */
export async function sendAnnouncementNotification(
  sb: SupabaseClient,
  args: {
    teamId: string;
    title: string;
    body: string;
    authorName?: string;
  },
) {
  const subscriptions = await getTeamSubscriptions(sb, args.teamId);

  if (subscriptions.size === 0) {
    return { sent: 0, failed: 0, noSubscription: 0 };
  }

  const payload = {
    title: `📢 ${args.title}`,
    body: args.body.length > 120 ? args.body.slice(0, 117) + "..." : args.body,
    url: "/team",
    type: "announcement",
  };

  let sent = 0;
  let failed = 0;
  const invalidIds: string[] = [];

  for (const [, row] of subscriptions) {
    const sub: NativePushSubscription = {
      endpoint: row.endpoint,
      p256dh: row.p256dh,
      auth: row.auth,
    };

    try {
      await sendWebPush(sub, payload);
      sent++;
    } catch (error) {
      failed++;
      if (isSubscriptionGone(error)) {
        invalidIds.push(row.id);
      }
    }
  }

  // Deactivate gone subscriptions
  if (invalidIds.length > 0) {
    await sb
      .from("player_push_subscriptions")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .in("id", invalidIds);
  }

  return {
    sent,
    failed,
    invalidRemoved: invalidIds.length,
    totalSubscriptions: subscriptions.size,
  };
}
