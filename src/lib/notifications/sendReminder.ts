import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { BatchResponse, SendResponse } from "firebase-admin/messaging";
import { getFirebaseAdminMessaging } from "@/lib/firebase-admin";
import { getMissingPlayersForToday } from "@/lib/notifications/checkins";
import type { ReminderType } from "@/lib/notifications/schedule";

type TokenRow = {
  id: string;
  player_id: string;
  fcm_token: string;
  is_active: boolean | null;
  updated_at: string | null;
};

type LogRow = {
  id: string;
};

const INVALID_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
  "messaging/invalid-argument",
]);

function isMissingScheduledSlotColumnError(error: { message?: string; details?: string } | null | undefined) {
  const text = `${error?.message ?? ""} ${error?.details ?? ""}`.toLowerCase();
  return text.includes("scheduled_slot") && (text.includes("could not find") || text.includes("column"));
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function reminderCopy(type: ReminderType) {
  if (type === "second") {
    return {
      title: "Breiðablik Readiness",
      body: "Reminder: today's readiness check-in is still missing.",
    };
  }

  if (type === "manual") {
    return {
      title: "Breiðablik Readiness",
      body: "Coach reminder: please complete today's readiness check-in.",
    };
  }

  return {
    title: "Breiðablik Readiness",
    body: "Please complete today's readiness check-in.",
  };
}

async function getLatestActiveTokenByPlayer(sb: SupabaseClient, playerIds: string[]) {
  if (!playerIds.length) return new Map<string, TokenRow>();

  const { data, error } = await sb
    .from("player_push_tokens")
    .select("id, player_id, fcm_token, is_active, updated_at")
    .eq("is_active", true)
    .in("player_id", playerIds)
    .order("updated_at", { ascending: false });

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as TokenRow[];
  const map = new Map<string, TokenRow>();
  for (const row of rows) {
    if (!row?.player_id || !row?.fcm_token) continue;
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
    tokenId: string | null;
  }
): Promise<string | null> {
  const basePayload = {
    player_id: args.playerId,
    date_key: args.dateKey,
    reminder_type: args.reminderType,
    token_id: args.tokenId,
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

function getErrorFromBatchResponse(batch: BatchResponse, token: string, indexMap: Map<string, number>): SendResponse | null {
  const idx = indexMap.get(token);
  if (idx == null) return null;
  return batch.responses[idx] ?? null;
}

export async function sendReminderToMissingPlayers(
  sb: SupabaseClient,
  args: {
    reminderType: ReminderType;
    scheduledSlot: string;
    dateKey: string;
    timeZone: string;
  }
) {
  const missing = await getMissingPlayersForToday(sb, { dateKey: args.dateKey, timeZone: args.timeZone });
  const missingPlayers = missing.players;

  const tokensByPlayer = await getLatestActiveTokenByPlayer(
    sb,
    missingPlayers.map((p) => p.id)
  );

  const queued: Array<{ playerId: string; token: string; tokenId: string | null; logId: string }> = [];
  let skippedNoToken = 0;
  let skippedDuplicate = 0;

  for (const p of missingPlayers) {
    const tokenRow = tokensByPlayer.get(p.id);
    const reserved = await reserveNotificationLog(sb, {
      playerId: p.id,
      dateKey: args.dateKey,
      reminderType: args.reminderType,
      scheduledSlot: args.scheduledSlot,
      tokenId: tokenRow?.id ?? null,
    });

    if (!reserved) {
      skippedDuplicate += 1;
      continue;
    }

    if (!tokenRow?.fcm_token) {
      skippedNoToken += 1;
      await completeNotificationLog(sb, {
        logId: reserved,
        status: "skipped_no_token",
        errorMessage: "No active token",
      });
      continue;
    }

    queued.push({
      playerId: p.id,
      token: tokenRow.fcm_token,
      tokenId: tokenRow.id ?? null,
      logId: reserved,
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

  const messaging = getFirebaseAdminMessaging();
  const message = reminderCopy(args.reminderType);
  const uniqueTokens = Array.from(new Set(queued.map((q) => q.token)));

  let sent = 0;
  let failed = 0;
  const invalidTokenIds = new Set<string>();

  const tokenToResponse = new Map<string, SendResponse>();
  const tokenBatches = chunk(uniqueTokens, 500);

  for (const batchTokens of tokenBatches) {
    const batchResponse = await messaging.sendEachForMulticast({
      tokens: batchTokens,
      notification: {
        title: message.title,
        body: message.body,
      },
      data: {
        type: "daily_checkin",
        screen: "checkin",
        reminder_type: args.reminderType,
        scheduled_slot: args.scheduledSlot,
        date_key: args.dateKey,
      },
      webpush: {
        fcmOptions: {
          link: "/player/checkin",
        },
      },
    });

    sent += batchResponse.successCount;
    failed += batchResponse.failureCount;

    const indexMap = new Map<string, number>();
    for (let i = 0; i < batchTokens.length; i += 1) indexMap.set(batchTokens[i]!, i);

    for (const token of batchTokens) {
      const response = getErrorFromBatchResponse(batchResponse, token, indexMap);
      if (!response) continue;
      tokenToResponse.set(token, response);
    }
  }

  for (const item of queued) {
    const res = tokenToResponse.get(item.token);
    if (!res) {
      await completeNotificationLog(sb, {
        logId: item.logId,
        status: "failed",
        errorMessage: "No provider response for token",
      });
      continue;
    }

    if (res.success) {
      await completeNotificationLog(sb, {
        logId: item.logId,
        status: "sent",
        providerMessageId: (res as SendResponse).messageId ?? null,
      });
      continue;
    }

    const errorCode = res.error?.code ?? "unknown";
    await completeNotificationLog(sb, {
      logId: item.logId,
      status: "failed",
      errorMessage: `${errorCode}${res.error?.message ? `: ${res.error.message}` : ""}`,
    });

    if (item.tokenId && INVALID_TOKEN_CODES.has(errorCode)) {
      invalidTokenIds.add(item.tokenId);
    }
  }

  let removedInvalidTokens = 0;
  if (invalidTokenIds.size > 0) {
    const ids = Array.from(invalidTokenIds);
    const { error } = await sb
      .from("player_push_tokens")
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
    totalTokens: uniqueTokens.length,
    targetedPlayers: queued.length,
    sent,
    failed,
    skipped: skippedNoToken + skippedDuplicate,
    skippedNoToken,
    skippedDuplicate,
    removedInvalidTokens,
  };
}
