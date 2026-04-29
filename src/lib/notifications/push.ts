import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendWebPush, isSubscriptionGone } from "@/lib/push/webPush";

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
    .select("id, parameter, severity, summary, summary_is, players(full_name)")
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
    id: string; parameter: string; severity: string;
    summary: string; summary_is: string | null;
    players: { full_name: string | null } | null;
  };
  const notifRows = pendingNotifs as unknown as NotifLite[];

  let pushed = 0;
  for (const notif of notifRows) {
    const playerName = notif.players?.full_name ?? "Player";
    const title =
      notif.severity === "urgent"  ? `🚨 ${playerName}` :
      notif.severity === "warning" ? `⚠️ ${playerName}` :
                                     `ℹ️ ${playerName}`;
    const body = notif.summary_is ?? notif.summary;
    const payload = { title, body: body.slice(0, 120), url: "/coach/notifications" };

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
