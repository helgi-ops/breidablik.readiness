import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getMissingPlayersForToday } from "@/lib/notifications/checkins";
import type { ReminderProfile, ReminderType } from "@/lib/notifications/schedule";
import { isSubscriptionGone, sendWebPush, type NativePushSubscription } from "@/lib/push/webPush";

type SubscriptionRow = {
  id: string;
  player_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  is_active: boolean | null;
  updated_at: string | null;
};

type LogRow = {
  id: string;
};

function isMissingScheduledSlotColumnError(error: { message?: string; details?: string } | null | undefined) {
  const text = `${error?.message ?? ""} ${error?.details ?? ""}`.toLowerCase();
  return text.includes("scheduled_slot") && (text.includes("could not find") || text.includes("column"));
}

function reminderCopy(type: ReminderType) {
  if (type === "second") {
    return {
      title: "MicroPulse",
      body: "Reminder: today's readiness check-in is still missing.",
    };
  }

  if (type === "manual") {
    return {
      title: "MicroPulse",
      body: "Coach reminder: please complete today's readiness check-in.",
    };
  }

  return {
    title: "MicroPulse",
    body: "Please complete today's readiness check-in.",
  };
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
    if (!row?.player_id || !row?.endpoint || !row?.p256dh || !row?.auth) continue;
    if (!map.has(row.player_id)) map.set(row.player_id, row);
  }
  return map;
}

async function reserveNotificationLog(
  sb: SupabaseClient,
  args: {
    playerId: string;
    dateKey: string;
    reminderType: ReminderType;
    scheduledSlot: string;
  }
): Promise<string | null> {
  const basePayload = {
    player_id: args.playerId,
    date_key: args.dateKey,
    reminder_type: args.reminderType,
    status: "pending",
    sent_at: new Date().toISOString(),
  };

  const tryInsert = async (withScheduledSlot: boolean) =>
    sb
      .from("checkin_notification_log")
      .insert(
        withScheduledSlot
          ? {
              ...basePayload,
              scheduled_slot: args.scheduledSlot,
            }
          : basePayload
      )
      .select("id")
      .single();

  let { data, error } = await tryInsert(true);

  if (error && isMissingScheduledSlotColumnError(error)) {
    const retry = await tryInsert(false);
    data = retry.data;
    error = retry.error;
  }

  if (error) {
    if (error.code === "23505") return null;
    throw new Error(error.message);
  }

  return ((data as LogRow | null)?.id ?? null);
}

async function completeNotificationLog(
  sb: SupabaseClient,
  args: {
    logId: string;
    status: "sent" | "failed" | "skipped_no_token" | "skipped_duplicate";
    providerMessageId?: string | null;
    errorMessage?: string | null;
  }
) {
  const { error } = await sb
    .from("checkin_notification_log")
    .update({
      status: args.status,
      provider_message_id: args.providerMessageId ?? null,
      error_message: args.errorMessage ?? null,
      sent_at: new Date().toISOString(),
    })
    .eq("id", args.logId);

  if (error) throw new Error(error.message);
}

export async function sendReminderToMissingPlayers(
  sb: SupabaseClient,
  args: {
    reminderType: ReminderType;
    scheduledSlot: string;
    dateKey: string;
    timeZone: string;
    profile?: ReminderProfile;
  }
) {
  const missing = await getMissingPlayersForToday(sb, {
    dateKey: args.dateKey,
    timeZone: args.timeZone,
    profile: args.profile,
  });
  const missingPlayers = missing.players;

  const subscriptionsByPlayer = await getLatestActiveSubscriptionByPlayer(
    sb,
    missingPlayers.map((p) => p.id)
  );

  const queued: Array<{ playerId: string; subscription: NativePushSubscription; subscriptionId: string | null; logId: string }> = [];
  let skippedNoToken = 0;
  let skippedDuplicate = 0;

  for (const p of missingPlayers) {
    const row = subscriptionsByPlayer.get(p.id);
    const reserved = await reserveNotificationLog(sb, {
      playerId: p.id,
      dateKey: args.dateKey,
      reminderType: args.reminderType,
      scheduledSlot: args.scheduledSlot,
    });

    if (!reserved) {
      skippedDuplicate += 1;
      continue;
    }

    if (!row?.endpoint || !row?.p256dh || !row?.auth) {
      skippedNoToken += 1;
      await completeNotificationLog(sb, {
        logId: reserved,
        status: "skipped_no_token",
        errorMessage: "No active subscription",
      });
      continue;
    }

    queued.push({
      playerId: p.id,
      subscriptionId: row.id ?? null,
      logId: reserved,
      subscription: {
        endpoint: row.endpoint,
        p256dh: row.p256dh,
        auth: row.auth,
      },
    });
  }

  if (!queued.length) {
    return {
      dateKey: args.dateKey,
      reminderType: args.reminderType,
      scheduledSlot: args.scheduledSlot,
      totalPlayersMatched: missingPlayers.length,
      totalTokens: 0,
      targetedPlayers: 0,
      sent: 0,
      failed: 0,
      skipped: skippedNoToken + skippedDuplicate,
      skippedNoToken,
      skippedDuplicate,
      removedInvalidTokens: 0,
    };
  }

  const message = reminderCopy(args.reminderType);
  const payload = {
    title: message.title,
    body: message.body,
    url: "/player/checkin",
    type: "daily_checkin",
    screen: "checkin",
    reminder_type: args.reminderType,
    scheduled_slot: args.scheduledSlot,
    date_key: args.dateKey,
  };

  let sent = 0;
  let failed = 0;
  const invalidSubscriptionIds = new Set<string>();

  for (const item of queued) {
    try {
      const response = await sendWebPush(item.subscription, payload);
      sent += 1;
      const locationHeader = response.headers?.location ?? null;
      await completeNotificationLog(sb, {
        logId: item.logId,
        status: "sent",
        providerMessageId: locationHeader,
      });
    } catch (error) {
      failed += 1;
      await completeNotificationLog(sb, {
        logId: item.logId,
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Push send failed",
      });

      if (item.subscriptionId && isSubscriptionGone(error)) {
        invalidSubscriptionIds.add(item.subscriptionId);
      }
    }
  }

  let removedInvalidTokens = 0;
  if (invalidSubscriptionIds.size > 0) {
    const ids = Array.from(invalidSubscriptionIds);
    const { error } = await sb
      .from("player_push_subscriptions")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .in("id", ids);

    if (!error) {
      removedInvalidTokens = ids.length;
    }
  }

  return {
    dateKey: args.dateKey,
    reminderType: args.reminderType,
    scheduledSlot: args.scheduledSlot,
    totalPlayersMatched: missingPlayers.length,
    totalTokens: queued.length,
    targetedPlayers: queued.length,
    sent,
    failed,
    skipped: skippedNoToken + skippedDuplicate,
    skippedNoToken,
    skippedDuplicate,
    removedInvalidTokens,
  };
}
