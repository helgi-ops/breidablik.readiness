import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendWebPush, isSubscriptionGone } from "@/lib/push/webPush";
import { buildPushBody, loadPushContext } from "@/lib/notifications/narrativePushBody";

/**
 * Pull notifications that haven't been pushed yet for a team, send PWA push
 * to all coaches with active subscriptions, and stamp push_sent_at so we
 * don't re-push on next detection.
 *
 * Used in two places:
 *   - /api/coach/notifications POST handler (manual trigger)
 *   - /api/integrations/catapult/daily-sync (auto after each sync)
 *
 * Returns the number of pushes successfully delivered.
 */
export async function pushNewCoachNotifications(
  supabase: SupabaseClient,
  teamId: string,
): Promise<number> {
  const { data: pendingNotifs } = await supabase
    .from("coach_notifications")
    .select("id, parameter, direction, severity, summary, summary_is, value_now, value_prev, player_id, players(full_name)")
    .eq("team_id", teamId)
    .is("push_sent_at", null)
    .is("acknowledged_at", null)
    .order("fired_at", { ascending: false })
    .limit(20);

  if (!pendingNotifs || pendingNotifs.length === 0) return 0;

  // Resolve coaches on this team via two routes
  const { data: profileCoaches } = await supabase
    .from("profiles").select("id, role").eq("team_id", teamId);
  const profileIds = ((profileCoaches ?? []) as Array<{ id: string; role: string | null }>)
    .filter((c) => ["coach","admin","staff"].includes(String(c.role ?? "").toLowerCase()))
    .map((c) => c.id);
  const { data: ctRows } = await supabase
    .from("coach_teams").select("coach_id").eq("team_id", teamId);
  const ctIds = ((ctRows ?? []) as Array<{ coach_id: string }>).map((r) => r.coach_id);
  const coachIds = Array.from(new Set([...profileIds, ...ctIds])).filter(Boolean);
  if (coachIds.length === 0) return 0;

  const { data: subscriptions } = await supabase
    .from("coach_push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .in("profile_id", coachIds)
    .eq("is_active", true);
  if (!subscriptions || subscriptions.length === 0) return 0;
  const subRows = subscriptions as Array<{
    id: string; endpoint: string | null; p256dh: string | null; auth: string | null;
  }>;

  type NotifLite = {
    id: string; parameter: string; direction: string | null; severity: string;
    summary: string; summary_is: string | null;
    value_now: number | null; value_prev: number | null;
    player_id: string;
    players: { full_name: string | null } | null;
  };
  const notifRows = pendingNotifs as unknown as NotifLite[];

  // Batch-load 2 days of wellness scores per player so the narrative
  // builder can derive WHY context (Sleep 4→2, soreness rose) without
  // a per-notification round trip. One query, used by every push below.
  const todayIso = new Date().toISOString().slice(0, 10);
  const playerIds = Array.from(new Set(notifRows.map((n) => n.player_id).filter(Boolean)));
  const pushContext = await loadPushContext(supabase, playerIds, todayIso);

  let pushed = 0;
  for (const notif of notifRows) {
    const playerName = notif.players?.full_name ?? "Player";
    const title =
      notif.severity === "urgent"  ? `🚨 ${playerName}` :
      notif.severity === "warning" ? `⚠️ ${playerName}` :
                                     `ℹ️ ${playerName}`;
    // Default to IS body since most pilots are Iceland clubs; falls
    // back to EN automatically when summary_is is null.
    const body = buildPushBody({
      parameter: notif.parameter,
      direction: notif.direction,
      severity: notif.severity,
      summary: notif.summary,
      summary_is: notif.summary_is,
      value_now: notif.value_now,
      value_prev: notif.value_prev,
      player_id: notif.player_id,
      player_name: playerName,
    }, pushContext, "IS");
    const payload = { title, body, url: "/coach/notifications" };

    for (const sub of subRows) {
      if (!sub.endpoint || !sub.p256dh || !sub.auth) continue;
      try {
        await sendWebPush({ endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth }, payload);
        pushed++;
      } catch (err) {
        if (isSubscriptionGone(err)) {
          await supabase.from("coach_push_subscriptions").update({ is_active: false }).eq("id", sub.id);
        }
        console.error("[coach-notifications] push send error", err);
      }
    }

    await supabase
      .from("coach_notifications")
      .update({ push_sent_at: new Date().toISOString() })
      .eq("id", notif.id);
  }

  return pushed;
}
