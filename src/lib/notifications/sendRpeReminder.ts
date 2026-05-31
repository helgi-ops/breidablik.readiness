import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getRpeComplianceForDate } from "@/lib/session-rpe/compliance";
import { rpeReminderConfig, type RpeReminderType } from "@/lib/session-rpe/reminderConfig";
import type { ReminderProfile } from "@/lib/notifications/schedule";
import { isSubscriptionGone, sendWebPush, type NativePushSubscription } from "@/lib/push/webPush";
import { getGpsOnlyTeamIds } from "@/lib/teamMode";
import { getTeamsOnBreak } from "@/lib/notifications/teamBreaks";

type SubscriptionRow = {
  id: string;
  player_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  is_active: boolean | null;
  updated_at: string | null;
};

async function getOffDayTeamIds(
  sb: SupabaseClient,
  args: { dateKey: string; teamIds: string[] }
): Promise<Set<string>> {
  const offTeamIds = new Set<string>();
  if (!args.teamIds.length) return offTeamIds;

  const { data, error } = await sb
    .from("week_plans")
    .select("team_id, day_type")
    .eq("day_date", args.dateKey)
    .in("team_id", args.teamIds);

  if (error) {
    // If the lookup fails, fail open (don't block reminders) — error will surface elsewhere.
    return offTeamIds;
  }

  for (const row of (data ?? []) as Array<{ team_id: string; day_type: string | null }>) {
    const dayType = String(row.day_type ?? "").toUpperCase();
    if (dayType === "OFF") offTeamIds.add(String(row.team_id));
  }
  return offTeamIds;
}

async function getLatestActiveSubscriptionByPlayer(sb: SupabaseClient, playerIds: string[]) {
  if (!playerIds.length) return new Map<string, SubscriptionRow>();

  const { data, error } = await sb
    .from("player_push_subscriptions")
    .select("id, player_id, endpoint, p256dh, auth, is_active, updated_at")
    .eq("is_active", true)
    .in("player_id", playerIds)
    .order("updated_at", { ascending: false });

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as SubscriptionRow[];
  const map = new Map<string, SubscriptionRow>();
  for (const row of rows) {
    if (!row.player_id || !row.endpoint || !row.p256dh || !row.auth) continue;
    if (!map.has(row.player_id)) map.set(row.player_id, row);
  }
  return map;
}

async function reserveLog(
  sb: SupabaseClient,
  args: {
    playerId: string;
    teamId: string | null;
    dateKey: string;
    scheduledSlot: string;
    reminderType: RpeReminderType;
  }
) {
  const { data, error } = await sb
    .from("rpe_notification_log")
    .insert({
      player_id: args.playerId,
      team_id: args.teamId,
      reminder_date: args.dateKey,
      scheduled_slot: args.scheduledSlot,
      channel: "push",
      status: "skipped",
      notification_type: "session_rpe_missing",
      metadata: {
        reserved: true,
        reminder_type: args.reminderType,
      },
      sent_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return null;
    throw new Error(error.message);
  }

  return (data as { id?: string } | null)?.id ?? null;
}

async function finalizeLog(
  sb: SupabaseClient,
  args: {
    id: string;
    status: "sent" | "skipped" | "failed";
    providerMessageId?: string | null;
    metadata?: Record<string, unknown>;
  }
) {
  const { error } = await sb
    .from("rpe_notification_log")
    .update({
      status: args.status,
      metadata: args.metadata ?? {},
      sent_at: new Date().toISOString(),
      provider_message_id: args.providerMessageId ?? null,
    })
    .eq("id", args.id);
  if (error) throw new Error(error.message);
}

export async function sendRpeReminderToMissingPlayers(
  sb: SupabaseClient,
  args: {
    reminderType: RpeReminderType;
    scheduledSlot: string;
    dateKey: string;
    timeZone: string;
    teamId?: string | null;
    profile?: ReminderProfile;
  }
) {
  const compliance = await getRpeComplianceForDate(sb, {
    teamId: args.teamId ?? null,
    dateKey: args.dateKey,
    timeZone: args.timeZone,
    profile: args.profile,
  });

  const allMissing = compliance.missingPlayers;

  // GPS-only teams don't use RPE — skip their players entirely.
  const gpsOnlyTeams = await getGpsOnlyTeamIds(sb);
  const afterGpsFilter = gpsOnlyTeams.size === 0
    ? allMissing
    : allMissing.filter((p) => !(p.team_id && gpsOnlyTeams.has(String(p.team_id))));

  // Skip RPE reminders for teams whose week_plan marks today as OFF.
  const teamIdsForOffCheck = Array.from(
    new Set(afterGpsFilter.map((p) => p.team_id).filter((id): id is string => Boolean(id)))
  );
  const offTeamIds = await getOffDayTeamIds(sb, {
    dateKey: args.dateKey,
    teamIds: teamIdsForOffCheck,
  });

  const afterOffFilter = afterGpsFilter.filter((p) => !(p.team_id && offTeamIds.has(String(p.team_id))));
  const skippedOffDay = afterGpsFilter.length - afterOffFilter.length;

  // Skip RPE reminders for teams on a declared break (players get a real break).
  const breakTeams = await getTeamsOnBreak(sb, args.dateKey);
  const missing = breakTeams.size === 0
    ? afterOffFilter
    : afterOffFilter.filter((p) => !(p.team_id && breakTeams.has(String(p.team_id))));
  const skippedGpsOnly = allMissing.length - afterGpsFilter.length;
  void skippedGpsOnly;

  const subsByPlayer = await getLatestActiveSubscriptionByPlayer(
    sb,
    missing.map((p) => p.player_id)
  );

  const queued: Array<{ playerId: string; subscription: NativePushSubscription; subscriptionId: string | null; logId: string }> = [];
  let skippedNoToken = 0;
  let skippedDuplicate = 0;

  for (const p of missing) {
    const reserved = await reserveLog(sb, {
      playerId: p.player_id,
      teamId: p.team_id,
      dateKey: args.dateKey,
      scheduledSlot: args.scheduledSlot,
      reminderType: args.reminderType,
    });

    if (!reserved) {
      skippedDuplicate += 1;
      continue;
    }

    const sub = subsByPlayer.get(p.player_id);
    if (!sub?.endpoint || !sub?.p256dh || !sub?.auth) {
      skippedNoToken += 1;
      await finalizeLog(sb, {
        id: reserved,
        status: "skipped",
        metadata: {
          reason: "no_push_subscription",
          reminder_type: args.reminderType,
        },
      });
      continue;
    }

    queued.push({
      playerId: p.player_id,
      subscriptionId: sub.id ?? null,
      logId: reserved,
      subscription: {
        endpoint: sub.endpoint,
        p256dh: sub.p256dh,
        auth: sub.auth,
      },
    });
  }

  if (!queued.length) {
    return {
      date: args.dateKey,
      slot: args.scheduledSlot,
      expected_count: compliance.summary.expectedCount,
      already_submitted_count: compliance.summary.submittedCount,
      missing_count: compliance.summary.missingCount,
      attempted_count: 0,
      sent_count: 0,
      skipped_count: skippedNoToken + skippedDuplicate + skippedOffDay,
      failed_count: 0,
      removed_invalid_tokens: 0,
      skipped_no_token: skippedNoToken,
      skipped_duplicate: skippedDuplicate,
      skipped_off_day: skippedOffDay,
    };
  }

  const copy = rpeReminderConfig.copy[args.reminderType];
  const payload = {
    title: copy.title,
    body: copy.body,
    url: "/player",
    type: "session_rpe_missing",
    screen: "player",
    reminder_type: args.reminderType,
    scheduled_slot: args.scheduledSlot,
    reminder_date: args.dateKey,
  };

  const invalidSubscriptionIds = new Set<string>();
  let sentCount = 0;
  let failedCount = 0;

  for (const item of queued) {
    try {
      const response = await sendWebPush(item.subscription, payload);
      sentCount += 1;
      await finalizeLog(sb, {
        id: item.logId,
        status: "sent",
        providerMessageId: response.headers?.location ?? null,
        metadata: { reminder_type: args.reminderType },
      });
    } catch (error) {
      failedCount += 1;
      await finalizeLog(sb, {
        id: item.logId,
        status: "failed",
        metadata: {
          reason: "provider_error",
          error_message: error instanceof Error ? error.message : "Push send failed",
          reminder_type: args.reminderType,
        },
      });
      if (item.subscriptionId && isSubscriptionGone(error)) invalidSubscriptionIds.add(item.subscriptionId);
    }
  }

  let removedInvalidTokens = 0;
  if (invalidSubscriptionIds.size > 0) {
    const ids = Array.from(invalidSubscriptionIds);
    const { error } = await sb
      .from("player_push_subscriptions")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .in("id", ids);
    if (!error) removedInvalidTokens = ids.length;
  }

  return {
    date: args.dateKey,
    slot: args.scheduledSlot,
    expected_count: compliance.summary.expectedCount,
    already_submitted_count: compliance.summary.submittedCount,
    missing_count: compliance.summary.missingCount,
    attempted_count: queued.length,
    sent_count: sentCount,
    skipped_count: skippedNoToken + skippedDuplicate + skippedOffDay,
    failed_count: failedCount,
    removed_invalid_tokens: removedInvalidTokens,
    skipped_no_token: skippedNoToken,
    skipped_duplicate: skippedDuplicate,
    skipped_off_day: skippedOffDay,
  };
}
