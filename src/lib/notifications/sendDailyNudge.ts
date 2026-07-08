import "server-only";

/**
 * Gentle, OPT-IN daily player nudges that close the anticipation → resolution
 * loop: a morning "outlook" (what today looks like) and an evening "recap" (how
 * it went vs your usual). Health-first, not a slot machine:
 *   - Opt-in only: a player receives a type ONLY if they enabled it in
 *     player_notification_preferences (off by default — safest for minors).
 *   - Break- and off-day-aware, de-duped (reuses rpe_notification_log), and
 *     self-limiting: the outlook fires only on training days; the recap fires
 *     only for players who actually have a session today (never nag).
 * Mirrors sendRpeReminder's proven send/de-dup/token-cleanup machinery.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { isSubscriptionGone, sendWebPush, type NativePushSubscription } from "@/lib/push/webPush";
import { getTeamsOnBreak } from "@/lib/notifications/teamBreaks";
import { getPlayersOnBreak } from "@/lib/notifications/clientBreaks";
import { resolveMdContext } from "@/lib/micropulse/loadPlan/forTeam";
import { planSessionLoad } from "@/lib/micropulse/plannedSessionLoad";

export type NudgeType = "daily_outlook" | "daily_recap";

const NUDGE_COPY: Record<NudgeType, { title: string; body: string }> = {
  daily_outlook: { title: "MicroPulse", body: "Your outlook for today is ready — see what's on for you." },
  daily_recap:   { title: "MicroPulse", body: "See how today went next to your usual." },
};

type SubscriptionRow = { id: string; player_id: string; endpoint: string; p256dh: string; auth: string };

async function getOffDayTeamIds(sb: SupabaseClient, dateKey: string, teamIds: string[]): Promise<Set<string>> {
  const off = new Set<string>();
  if (!teamIds.length) return off;
  const { data, error } = await sb.from("week_plans").select("team_id, day_type").eq("day_date", dateKey).in("team_id", teamIds);
  if (error) return off; // fail open
  for (const r of (data ?? []) as Array<{ team_id: string; day_type: string | null }>) {
    if (String(r.day_type ?? "").toUpperCase() === "OFF") off.add(String(r.team_id));
  }
  return off;
}

async function getLatestActiveSubscriptionByPlayer(sb: SupabaseClient, playerIds: string[]) {
  const map = new Map<string, SubscriptionRow>();
  if (!playerIds.length) return map;
  const { data } = await sb
    .from("player_push_subscriptions")
    .select("id, player_id, endpoint, p256dh, auth, updated_at")
    .eq("is_active", true).in("player_id", playerIds).order("updated_at", { ascending: false });
  for (const row of (data ?? []) as Array<SubscriptionRow & { updated_at: string | null }>) {
    if (!row.player_id || !row.endpoint || !row.p256dh || !row.auth) continue;
    if (!map.has(row.player_id)) map.set(row.player_id, row);
  }
  return map;
}

/** Reserve a de-dup slot in rpe_notification_log; null when a duplicate exists. */
async function reserveLog(sb: SupabaseClient, playerId: string, teamId: string | null, dateKey: string, slot: string, nudgeType: NudgeType) {
  const { data, error } = await sb.from("rpe_notification_log").insert({
    player_id: playerId, team_id: teamId, reminder_date: dateKey, scheduled_slot: slot,
    channel: "push", status: "skipped", notification_type: nudgeType,
    metadata: { reserved: true }, sent_at: new Date().toISOString(),
  }).select("id").single();
  if (error) { if (error.code === "23505") return null; throw new Error(error.message); }
  return (data as { id?: string } | null)?.id ?? null;
}

async function finalizeLog(sb: SupabaseClient, id: string, status: "sent" | "skipped" | "failed", metadata: Record<string, unknown> = {}) {
  await sb.from("rpe_notification_log").update({ status, metadata, sent_at: new Date().toISOString() }).eq("id", id);
}

export async function sendDailyNudge(
  sb: SupabaseClient,
  args: { nudgeType: NudgeType; dateKey: string; scheduledSlot: string },
) {
  const zero = { type: args.nudgeType, date: args.dateKey, slot: args.scheduledSlot, opted_in: 0, attempted: 0, sent: 0, failed: 0, skipped_duplicate: 0, skipped_no_token: 0, skipped_gated: 0, removed_invalid: 0 };

  // 1. Opted-in players for this nudge type (off by default → must have enabled=true).
  const { data: prefs } = await sb
    .from("player_notification_preferences").select("player_id")
    .eq("notification_type", args.nudgeType).eq("enabled", true);
  const optedIn = Array.from(new Set(((prefs ?? []) as Array<{ player_id: string }>).map((p) => p.player_id)));
  if (!optedIn.length) return zero;

  // 2. Resolve teams.
  const { data: playerRows } = await sb.from("players").select("id, team_id").in("id", optedIn);
  const teamByPlayer = new Map<string, string | null>();
  for (const p of (playerRows ?? []) as Array<{ id: string; team_id: string | null }>) teamByPlayer.set(p.id, p.team_id ?? null);
  const teamIds = Array.from(new Set(Array.from(teamByPlayer.values()).filter((t): t is string => Boolean(t))));

  // 3. Gating sets.
  const [breakTeams, breakPlayers, offTeams] = await Promise.all([
    getTeamsOnBreak(sb, args.dateKey),
    getPlayersOnBreak(sb, args.dateKey),
    getOffDayTeamIds(sb, args.dateKey, teamIds),
  ]);

  // Outlook: only teams with a training day today. Recap: only players with a
  // real (non-estimated) session today.
  let trainingTeams: Set<string> | null = null;
  if (args.nudgeType === "daily_outlook") {
    trainingTeams = new Set<string>();
    for (const tid of teamIds) {
      try {
        const md = await resolveMdContext(sb, tid, args.dateKey);
        if (planSessionLoad({ mdDay: md.mdDay, dayType: md.dayType, focus: md.focus }).applicable) trainingTeams.add(tid);
      } catch { /* skip team on error */ }
    }
  }
  let playersWithSession: Set<string> | null = null;
  if (args.nudgeType === "daily_recap") {
    playersWithSession = new Set<string>();
    const { data: loadRows } = await sb
      .from("player_external_load_daily").select("player_id, total_player_load, raw_payload_json")
      .in("player_id", optedIn).eq("date", args.dateKey).in("source", ["catapult", "manual"]);
    for (const r of (loadRows ?? []) as Array<{ player_id: string; total_player_load: number | null; raw_payload_json: unknown }>) {
      if ((r.raw_payload_json as { estimated?: boolean } | null)?.estimated) continue;
      const v = Number(r.total_player_load);
      if (Number.isFinite(v) && v > 0) playersWithSession.add(r.player_id);
    }
  }

  const targets = optedIn.filter((pid) => {
    const tid = teamByPlayer.get(pid) ?? null;
    if (tid && (breakTeams.has(tid) || offTeams.has(tid))) return false;
    if (breakPlayers.has(pid)) return false;
    if (trainingTeams && !(tid && trainingTeams.has(tid))) return false;
    if (playersWithSession && !playersWithSession.has(pid)) return false;
    return true;
  });
  const skippedGated = optedIn.length - targets.length;
  if (!targets.length) return { ...zero, opted_in: optedIn.length, skipped_gated: skippedGated };

  const subsByPlayer = await getLatestActiveSubscriptionByPlayer(sb, targets);

  const queued: Array<{ playerId: string; sub: NativePushSubscription; subId: string; logId: string }> = [];
  let skippedDuplicate = 0, skippedNoToken = 0;
  for (const pid of targets) {
    const logId = await reserveLog(sb, pid, teamByPlayer.get(pid) ?? null, args.dateKey, args.scheduledSlot, args.nudgeType);
    if (!logId) { skippedDuplicate++; continue; }
    const sub = subsByPlayer.get(pid);
    if (!sub?.endpoint || !sub?.p256dh || !sub?.auth) {
      skippedNoToken++;
      await finalizeLog(sb, logId, "skipped", { reason: "no_push_subscription" });
      continue;
    }
    queued.push({ playerId: pid, subId: sub.id, logId, sub: { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth } });
  }

  const payload = { ...NUDGE_COPY[args.nudgeType], url: "/player", type: args.nudgeType, screen: "player", scheduled_slot: args.scheduledSlot, reminder_date: args.dateKey };
  const invalid = new Set<string>();
  let sent = 0, failed = 0;
  for (const item of queued) {
    try {
      await sendWebPush(item.sub, payload);
      sent++;
      await finalizeLog(sb, item.logId, "sent", { nudge_type: args.nudgeType });
    } catch (error) {
      failed++;
      await finalizeLog(sb, item.logId, "failed", { reason: "provider_error", error_message: error instanceof Error ? error.message : "push failed" });
      if (item.subId && isSubscriptionGone(error)) invalid.add(item.subId);
    }
  }
  let removedInvalid = 0;
  if (invalid.size) {
    const ids = Array.from(invalid);
    const { error } = await sb.from("player_push_subscriptions").update({ is_active: false, updated_at: new Date().toISOString() }).in("id", ids);
    if (!error) removedInvalid = ids.length;
  }

  return { type: args.nudgeType, date: args.dateKey, slot: args.scheduledSlot, opted_in: optedIn.length, attempted: queued.length, sent, failed, skipped_duplicate: skippedDuplicate, skipped_no_token: skippedNoToken, skipped_gated: skippedGated, removed_invalid: removedInvalid };
}
