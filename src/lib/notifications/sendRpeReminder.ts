import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { BatchResponse, SendResponse } from "firebase-admin/messaging";
import { getFirebaseAdminMessaging } from "@/lib/firebase-admin";
import { getRpeComplianceForDate } from "@/lib/session-rpe/compliance";
import { rpeReminderConfig, type RpeReminderType } from "@/lib/session-rpe/reminderConfig";

type TokenRow = {
  id: string;
  player_id: string;
  fcm_token: string;
  is_active: boolean | null;
  updated_at: string | null;
};

const INVALID_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
  "messaging/invalid-argument",
]);

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
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
    if (!row.player_id || !row.fcm_token) continue;
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

function getErrorFromBatchResponse(batch: BatchResponse, token: string, indexMap: Map<string, number>): SendResponse | null {
  const idx = indexMap.get(token);
  if (idx == null) return null;
  return batch.responses[idx] ?? null;
}

export async function sendRpeReminderToMissingPlayers(
  sb: SupabaseClient,
  args: {
    reminderType: RpeReminderType;
    scheduledSlot: string;
    dateKey: string;
    timeZone: string;
    teamId?: string | null;
  }
) {
  const compliance = await getRpeComplianceForDate(sb, {
    teamId: args.teamId ?? null,
    dateKey: args.dateKey,
    timeZone: args.timeZone,
  });

  const missing = compliance.missingPlayers;
  const tokensByPlayer = await getLatestActiveTokenByPlayer(
    sb,
    missing.map((p) => p.player_id)
  );

  const queued: Array<{ playerId: string; token: string; tokenId: string | null; logId: string }> = [];
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

    const tokenRow = tokensByPlayer.get(p.player_id);
    if (!tokenRow?.fcm_token) {
      skippedNoToken += 1;
      await finalizeLog(sb, {
        id: reserved,
        status: "skipped",
        metadata: {
          reason: "no_push_token",
          reminder_type: args.reminderType,
        },
      });
      continue;
    }

    queued.push({
      playerId: p.player_id,
      token: tokenRow.fcm_token,
      tokenId: tokenRow.id ?? null,
      logId: reserved,
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
      skipped_count: skippedNoToken + skippedDuplicate,
      failed_count: 0,
      removed_invalid_tokens: 0,
      skipped_no_token: skippedNoToken,
      skipped_duplicate: skippedDuplicate,
    };
  }

  const copy = rpeReminderConfig.copy[args.reminderType];
  const messaging = getFirebaseAdminMessaging();
  const uniqueTokens = Array.from(new Set(queued.map((q) => q.token)));
  const tokenToResponse = new Map<string, SendResponse>();
  const invalidTokenIds = new Set<string>();
  let sentCount = 0;
  let failedCount = 0;

  for (const batchTokens of chunk(uniqueTokens, 500)) {
    const batchResponse = await messaging.sendEachForMulticast({
      tokens: batchTokens,
      notification: {
        title: copy.title,
        body: copy.body,
      },
      data: {
        type: "session_rpe_missing",
        screen: "player",
        reminder_type: args.reminderType,
        scheduled_slot: args.scheduledSlot,
        reminder_date: args.dateKey,
      },
      webpush: {
        fcmOptions: {
          link: "/player",
        },
      },
    });
    sentCount += batchResponse.successCount;
    failedCount += batchResponse.failureCount;

    const indexMap = new Map<string, number>();
    for (let i = 0; i < batchTokens.length; i += 1) indexMap.set(batchTokens[i]!, i);
    for (const token of batchTokens) {
      const response = getErrorFromBatchResponse(batchResponse, token, indexMap);
      if (response) tokenToResponse.set(token, response);
    }
  }

  for (const item of queued) {
    const res = tokenToResponse.get(item.token);
    if (!res) {
      await finalizeLog(sb, {
        id: item.logId,
        status: "failed",
        metadata: { reason: "missing_provider_response", reminder_type: args.reminderType },
      });
      continue;
    }

    if (res.success) {
      await finalizeLog(sb, {
        id: item.logId,
        status: "sent",
        providerMessageId: res.messageId ?? null,
        metadata: { reminder_type: args.reminderType },
      });
      continue;
    }

    const errorCode = res.error?.code ?? "unknown";
    await finalizeLog(sb, {
      id: item.logId,
      status: "failed",
      metadata: {
        reason: "provider_error",
        error_code: errorCode,
        error_message: res.error?.message ?? null,
        reminder_type: args.reminderType,
      },
    });
    if (item.tokenId && INVALID_TOKEN_CODES.has(errorCode)) invalidTokenIds.add(item.tokenId);
  }

  let removedInvalidTokens = 0;
  if (invalidTokenIds.size > 0) {
    const ids = Array.from(invalidTokenIds);
    const { error } = await sb
      .from("player_push_tokens")
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
    skipped_count: skippedNoToken + skippedDuplicate,
    failed_count: failedCount,
    removed_invalid_tokens: removedInvalidTokens,
    skipped_no_token: skippedNoToken,
    skipped_duplicate: skippedDuplicate,
  };
}

