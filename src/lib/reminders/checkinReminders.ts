import type { SupabaseClient } from "@supabase/supabase-js";
import { getFirebaseAdminMessaging } from "@/lib/push/firebaseAdmin";

type ReminderType = "first" | "second" | "manual";

type PlayerRow = {
  id: string;
  full_name: string | null;
};

type TokenRow = {
  player_id: string;
  fcm_token: string;
};

type CheckinPlayerRow = { player_id: string };
type IdRow = { id: string };
type SentAtRow = { sent_at: string | null };
type LogInsertRow = { id: string };

function timezoneDateParts(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = fmt.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";

  const year = get("year");
  const month = get("month");
  const day = get("day");
  const hour = Number(get("hour") || 0);
  const minute = Number(get("minute") || 0);

  return {
    dateKey: `${year}-${month}-${day}`,
    hour,
    minute,
  };
}

export function getReminderContext(now = new Date(), timeZone = process.env.APP_TIMEZONE || "Atlantic/Reykjavik") {
  const local = timezoneDateParts(now, timeZone);

  const minuteOfDay = local.hour * 60 + local.minute;
  const firstStart = 8 * 60 + 30;
  const secondStart = 10 * 60;
  const cutoff = 12 * 60;

  let reminderType: ReminderType | null = null;

  if (minuteOfDay >= firstStart && minuteOfDay < secondStart) reminderType = "first";
  if (minuteOfDay >= secondStart && minuteOfDay < cutoff) reminderType = "second";

  return {
    timeZone,
    dateKey: local.dateKey,
    reminderType,
  };
}

export async function getMissingPlayersForDate(
  sb: SupabaseClient,
  args: { dateKey: string }
): Promise<PlayerRow[]> {
  const { data: players, error: playersErr } = await sb.from("players").select("id, full_name");
  if (playersErr) throw new Error(playersErr.message);

  const playerRows = (players ?? []) as PlayerRow[];
  if (!playerRows.length) return [];

  const playerIds = playerRows.map((p) => p.id);

  const { data: checkins, error: checkinsErr } = await sb
    .from("readiness_entries")
    .select("player_id")
    .eq("entry_date", args.dateKey)
    .in("player_id", playerIds);

  if (checkinsErr) throw new Error(checkinsErr.message);

  const checkedIn = new Set(((checkins ?? []) as CheckinPlayerRow[]).map((r) => String(r.player_id)));
  return playerRows.filter((p) => !checkedIn.has(String(p.id)));
}

export async function getCoachReminderStatus(
  sb: SupabaseClient,
  args: { dateKey: string }
): Promise<{
  dateKey: string;
  totalPlayers: number;
  checkedIn: number;
  missing: number;
  lastManualSendAt: string | null;
}> {
  const { data: players, error: playersErr } = await sb.from("players").select("id");
  if (playersErr) throw new Error(playersErr.message);

  const playerIds = ((players ?? []) as IdRow[]).map((p) => p.id);
  if (!playerIds.length) {
    return {
      dateKey: args.dateKey,
      totalPlayers: 0,
      checkedIn: 0,
      missing: 0,
      lastManualSendAt: null,
    };
  }

  const { data: checkins, error: checkinsErr } = await sb
    .from("readiness_entries")
    .select("player_id")
    .eq("entry_date", args.dateKey)
    .in("player_id", playerIds);

  if (checkinsErr) throw new Error(checkinsErr.message);

  const checkedInSet = new Set(((checkins ?? []) as CheckinPlayerRow[]).map((r) => String(r.player_id)));

  const { data: manualRows, error: manualErr } = await sb
    .from("checkin_notification_log")
    .select("sent_at")
    .eq("date_key", args.dateKey)
    .eq("reminder_type", "manual")
    .order("sent_at", { ascending: false })
    .limit(1);

  if (manualErr) throw new Error(manualErr.message);

  return {
    dateKey: args.dateKey,
    totalPlayers: playerIds.length,
    checkedIn: checkedInSet.size,
    missing: Math.max(0, playerIds.length - checkedInSet.size),
    lastManualSendAt: ((manualRows ?? []) as SentAtRow[])[0]?.sent_at ?? null,
  };
}

async function getLatestActiveTokensByPlayer(
  sb: SupabaseClient,
  playerIds: string[]
): Promise<Map<string, TokenRow>> {
  if (!playerIds.length) return new Map();

  const { data, error } = await sb
    .from("player_push_tokens")
    .select("player_id, fcm_token, updated_at")
    .eq("is_active", true)
    .in("player_id", playerIds)
    .order("updated_at", { ascending: false });

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Array<TokenRow & { updated_at?: string | null }>;
  const map = new Map<string, TokenRow>();
  for (const row of rows) {
    if (!row?.player_id || !row?.fcm_token) continue;
    if (!map.has(row.player_id)) {
      map.set(row.player_id, {
        player_id: row.player_id,
        fcm_token: row.fcm_token,
      });
    }
  }
  return map;
}

async function reserveLogRow(
  sb: SupabaseClient,
  args: {
    playerId: string;
    dateKey: string;
    reminderType: ReminderType;
  }
): Promise<string | null> {
  const { data, error } = await sb
    .from("checkin_notification_log")
    .insert({
      player_id: args.playerId,
      date_key: args.dateKey,
      reminder_type: args.reminderType,
      status: "pending",
      sent_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return null;
    throw new Error(error.message);
  }

  return ((data as LogInsertRow | null)?.id ?? null);
}

async function markLogStatus(
  sb: SupabaseClient,
  args: {
    id: string;
    status: "sent" | "failed" | "skipped_no_token";
    providerMessageId?: string | null;
  }
) {
  const { error } = await sb
    .from("checkin_notification_log")
    .update({
      status: args.status,
      provider_message_id: args.providerMessageId ?? null,
      sent_at: new Date().toISOString(),
    })
    .eq("id", args.id);

  if (error) throw new Error(error.message);
}

function buildReminderMessage(reminderType: ReminderType) {
  if (reminderType === "second") {
    return {
      title: "Second reminder: complete check-in",
      body: "Please complete today’s readiness check-in before training.",
    };
  }

  if (reminderType === "manual") {
    return {
      title: "Coach reminder: check-in pending",
      body: "Your coach asked for today’s readiness check-in.",
    };
  }

  return {
    title: "Daily check-in reminder",
    body: "Please complete today’s readiness check-in.",
  };
}

export async function sendReminderToMissingPlayers(
  sb: SupabaseClient,
  args: {
    dateKey: string;
    reminderType: ReminderType;
  }
) {
  const missingPlayers = await getMissingPlayersForDate(sb, {
    dateKey: args.dateKey,
  });

  const tokenMap = await getLatestActiveTokensByPlayer(
    sb,
    missingPlayers.map((p) => p.id)
  );

  const messaging = getFirebaseAdminMessaging();
  const msg = buildReminderMessage(args.reminderType);

  let sent = 0;
  let skippedNoToken = 0;
  let duplicateSkipped = 0;
  let failed = 0;

  for (const player of missingPlayers) {
    const logId = await reserveLogRow(sb, {
      playerId: player.id,
      dateKey: args.dateKey,
      reminderType: args.reminderType,
    });

    if (!logId) {
      duplicateSkipped += 1;
      continue;
    }

    const token = tokenMap.get(player.id)?.fcm_token;
    if (!token) {
      skippedNoToken += 1;
      await markLogStatus(sb, { id: logId, status: "skipped_no_token" });
      continue;
    }

    try {
      const messageId = await messaging.send({
        token,
        notification: {
          title: msg.title,
          body: msg.body,
        },
        webpush: {
          notification: {
            title: msg.title,
            body: msg.body,
            icon: "/icons/icon-192.png",
            badge: "/icons/icon-192.png",
            data: {
              targetUrl: "/player/checkin",
            },
          },
          fcmOptions: {
            link: "/player/checkin",
          },
        },
        data: {
          reminderType: args.reminderType,
          dateKey: args.dateKey,
          targetUrl: "/player/checkin",
        },
      });

      sent += 1;
      await markLogStatus(sb, {
        id: logId,
        status: "sent",
        providerMessageId: messageId,
      });
    } catch (err) {
      failed += 1;
      console.error("Failed to send check-in reminder:", err);
      await markLogStatus(sb, {
        id: logId,
        status: "failed",
      });
    }
  }

  return {
    dateKey: args.dateKey,
    reminderType: args.reminderType,
    missingPlayers: missingPlayers.length,
    sent,
    skippedNoToken,
    duplicateSkipped,
    failed,
  };
}
