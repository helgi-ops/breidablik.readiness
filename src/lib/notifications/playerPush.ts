import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendWebPush, isSubscriptionGone } from "@/lib/push/webPush";

/**
 * Shared helper to push a coach→player message to the player's PWA.
 *
 * Extracted from src/app/api/messages/route.ts so the same delivery path
 * is used by:
 *   - the chat /api/messages POST (coach typing freely)
 *   - the AI recovery message endpoints (Stig 1 manual draft, Stig 2
 *     auto-send) that bypass the chat surface but still want the player
 *     to see "📨 Coach sent you something" on their lock screen.
 *
 * Fire-and-forget semantics: we swallow individual subscription errors
 * (404/410 marks the row inactive) and never throw — failure to push
 * shouldn't roll back the inserted player_coach_messages row.
 */
export async function pushCoachMessageToPlayer(
  supabase: SupabaseClient,
  playerId: string,
  body: string,
  opts?: { title?: string },
): Promise<number> {
  const { data: subs } = await supabase
    .from("player_push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("player_id", playerId)
    .eq("is_active", true);
  if (!subs || subs.length === 0) return 0;

  const payload = {
    title: opts?.title ?? "Þjálfari",
    body: body.slice(0, 100),
    url: "/player",
  };

  const rows = subs as Array<{
    id: string;
    endpoint: string | null;
    p256dh: string | null;
    auth: string | null;
  }>;

  let pushed = 0;
  for (const sub of rows) {
    if (!sub.endpoint || !sub.p256dh || !sub.auth) continue;
    try {
      await sendWebPush(
        { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
        payload,
      );
      pushed++;
    } catch (err) {
      if (isSubscriptionGone(err)) {
        await supabase
          .from("player_push_subscriptions")
          .update({ is_active: false })
          .eq("id", sub.id);
      }
      console.error("[playerPush] send error", err);
    }
  }
  return pushed;
}
