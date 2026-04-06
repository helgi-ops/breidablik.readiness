import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getDateKeyInTimezone, getNextScheduledSlot, getOperationalTimezone } from "@/lib/notifications/schedule";

type ActivePlayerRow = {
  id: string;
  full_name: string | null;
  user_id: string | null;
};

type CheckinRow = {
  player_id: string;
};

type LastSendRow = {
  sent_at: string | null;
};

export type ActivePlayer = {
  id: string;
  full_name: string | null;
};

export async function getActivePlayers(sb: SupabaseClient): Promise<ActivePlayer[]> {
  const { data, error } = await sb.from("players").select("id, full_name, user_id").not("user_id", "is", null);
  if (error) throw new Error(error.message);

  return ((data ?? []) as ActivePlayerRow[])
    .filter((p) => Boolean(p?.id))
    .map((p) => ({
      id: p.id,
      full_name: p.full_name ?? null,
    }));
}

export async function getCheckedInPlayerIds(
  sb: SupabaseClient,
  args: { dateKey: string; playerIds: string[] }
): Promise<Set<string>> {
  if (!args.playerIds.length) return new Set();

  const { data, error } = await sb
    .from("readiness_entries")
    .select("player_id")
    .eq("entry_date", args.dateKey)
    .in("player_id", args.playerIds);

  if (error) throw new Error(error.message);

  return new Set(((data ?? []) as CheckinRow[]).map((r) => String(r.player_id)));
}

export async function getMissingPlayersForToday(
  sb: SupabaseClient,
  args?: { dateKey?: string; timeZone?: string }
): Promise<{ dateKey: string; players: ActivePlayer[] }> {
  const timeZone = args?.timeZone || getOperationalTimezone();
  const dateKey = args?.dateKey || getDateKeyInTimezone(new Date(), timeZone);

  const players = await getActivePlayers(sb);
  const playerIds = players.map((p) => p.id);
  const checkedInSet = await getCheckedInPlayerIds(sb, { dateKey, playerIds });

  return {
    dateKey,
    players: players.filter((p) => !checkedInSet.has(p.id)),
  };
}

export async function getCheckinComplianceSummary(
  sb: SupabaseClient,
  args?: { dateKey?: string; timeZone?: string }
): Promise<{
  dateKey: string;
  totalActivePlayers: number;
  checkedInToday: number;
  missingToday: number;
  lastReminderSentAt: string | null;
  nextScheduledReminderLabel: string;
}> {
  const timeZone = args?.timeZone || getOperationalTimezone();
  const dateKey = args?.dateKey || getDateKeyInTimezone(new Date(), timeZone);

  const players = await getActivePlayers(sb);
  const checkedInSet = await getCheckedInPlayerIds(sb, {
    dateKey,
    playerIds: players.map((p) => p.id),
  });

  const { data: sendRows, error: sendErr } = await sb
    .from("checkin_notification_log")
    .select("sent_at")
    .eq("date_key", dateKey)
    .in("status", ["sent", "failed"])
    .order("sent_at", { ascending: false })
    .limit(1);

  if (sendErr) throw new Error(sendErr.message);

  const nextSlot = getNextScheduledSlot({ timeZone });

  return {
    dateKey,
    totalActivePlayers: players.length,
    checkedInToday: checkedInSet.size,
    missingToday: Math.max(0, players.length - checkedInSet.size),
    lastReminderSentAt: ((sendRows ?? []) as LastSendRow[])[0]?.sent_at ?? null,
    nextScheduledReminderLabel: nextSlot.label,
  };
}
