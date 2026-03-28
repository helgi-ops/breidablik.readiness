import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isSubscriptionGone, sendWebPush, type NativePushSubscription } from "@/lib/push/webPush";

// ── Types ─────────────────────────────────────────────────────────────────────

type CmjReminderReason = "protocol" | "neuromuscular" | "stale" | "missing";

type PlayerWithReason = {
  id: string;
  name: string;
  reason: CmjReminderReason;
};

type SubscriptionRow = {
  id: string;
  player_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

type LogRow = { id: string };

// ── Push message copy ─────────────────────────────────────────────────────────

function buildCmjMessage(reason: CmjReminderReason): { title: string; body: string } {
  if (reason === "neuromuscular") {
    return {
      title: "CMJ próf í dag 🦵",
      body: "Neuromuscular flag er virkt. Gerðu CMJ próf áður en þjálfun hefst.",
    };
  }
  if (reason === "protocol") {
    return {
      title: "CMJ próf í dag 🦵",
      body: "Protokoll dagur (MD-2/MD+1) — gerðu CMJ próf áður en þjálfun hefst.",
    };
  }
  if (reason === "stale") {
    return {
      title: "CMJ próf í dag 🦵",
      body: "CMJ gögnin þín eru meira en 7 dagar gömul. Mínúta á ForceDecks áður en þú kemur inn.",
    };
  }
  return {
    title: "CMJ próf í dag 🦵",
    body: "Engin CMJ gögn eru til fyrir þig — gerðu próf áður en þjálfun hefst.",
  };
}

// ── DB helpers ────────────────────────────────────────────────────────────────

async function getActiveSubscriptions(
  sb: SupabaseClient,
  playerIds: string[]
): Promise<Map<string, SubscriptionRow>> {
  if (!playerIds.length) return new Map();

  const { data, error } = await sb
    .from("player_push_subscriptions")
    .select("id, player_id, endpoint, p256dh, auth, updated_at")
    .eq("is_active", true)
    .in("player_id", playerIds)
    .order("updated_at", { ascending: false });

  if (error) throw new Error(error.message);

  const map = new Map<string, SubscriptionRow>();
  for (const row of (data ?? []) as Array<SubscriptionRow & { updated_at?: string | null }>) {
    if (!row?.player_id || !row?.endpoint || !row?.p256dh || !row?.auth) continue;
    if (!map.has(row.player_id)) map.set(row.player_id, row);
  }
  return map;
}

async function reserveLog(
  sb: SupabaseClient,
  args: { playerId: string; dateKey: string }
): Promise<string | null> {
  const { data, error } = await sb
    .from("checkin_notification_log")
    .insert({
      player_id: args.playerId,
      date_key: args.dateKey,
      reminder_type: "cmj_required",
      status: "pending",
      sent_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    // 23505 = unique violation — already sent today
    if (error.code === "23505") return null;
    throw new Error(error.message);
  }

  return (data as LogRow | null)?.id ?? null;
}

async function markLog(
  sb: SupabaseClient,
  args: {
    logId: string;
    status: "sent" | "failed" | "skipped_no_token";
    providerMessageId?: string | null;
  }
) {
  await sb
    .from("checkin_notification_log")
    .update({
      status: args.status,
      provider_message_id: args.providerMessageId ?? null,
      sent_at: new Date().toISOString(),
    })
    .eq("id", args.logId);
}

// ── Main logic: build list of players who need CMJ today ─────────────────────

async function getPlayersNeedingCmj(
  sb: SupabaseClient,
  args: { teamId: string; dateKey: string }
): Promise<PlayerWithReason[]> {
  const [snapshotRes, mdRes, playersRes, checkinRes] = await Promise.all([
    sb
      .from("vald_daily_player_snapshot")
      .select("microplayer_id, neuromuscular_flag, cmj_freshness_status")
      .eq("team_id", args.teamId)
      .eq("snapshot_date", args.dateKey),

    sb
      .from("v_training_day_context_team")
      .select("md_day")
      .eq("team_id", args.teamId)
      .eq("date", args.dateKey)
      .maybeSingle(),

    sb
      .from("players")
      .select("id, full_name")
      .eq("team_id", args.teamId)
      .eq("is_active", true),

    // Only notify players who have ALREADY completed their checkin today.
    // This prevents two simultaneous notifications (checkin + CMJ).
    // Players who haven't checked in will get the regular checkin reminder instead.
    sb
      .from("readiness_entries")
      .select("player_id")
      .eq("entry_date", args.dateKey),
  ]);

  const snapshots = (snapshotRes.data ?? []) as Array<{
    microplayer_id: string;
    neuromuscular_flag: string | null;
    cmj_freshness_status: string | null;
  }>;
  const mdDay = (mdRes.data as { md_day?: string | null } | null)?.md_day ?? null;
  const allPlayers = (playersRes.data ?? []) as Array<{ id: string; full_name: string | null }>;

  // Set of players who have submitted their checkin today
  const checkedInIds = new Set(
    ((checkinRes.data ?? []) as Array<{ player_id: string }>).map((r) => r.player_id)
  );

  const isProtocolDay = mdDay === "MD-2" || mdDay === "MD+1";
  const snapshotMap = new Map(snapshots.map((s) => [s.microplayer_id, s]));

  const result: PlayerWithReason[] = [];
  const seen = new Set<string>();

  // Helper: only include players who have already submitted their checkin.
  // Players who haven't checked in will receive the standard checkin reminder
  // instead — we don't want to send two notifications simultaneously.
  const eligible = (id: string) => checkedInIds.has(id);

  // 1. Neuromuscular concern (highest priority)
  for (const s of snapshots) {
    if (!eligible(s.microplayer_id)) continue;
    if (s.neuromuscular_flag === "red" || s.neuromuscular_flag === "yellow") {
      const player = allPlayers.find((p) => p.id === s.microplayer_id);
      result.push({
        id: s.microplayer_id,
        name: player?.full_name ?? s.microplayer_id,
        reason: "neuromuscular",
      });
      seen.add(s.microplayer_id);
    }
  }

  // 2. Protocol day — all active players who have checked in
  if (isProtocolDay) {
    for (const p of allPlayers) {
      if (!eligible(p.id)) continue;
      if (!seen.has(p.id)) {
        result.push({ id: p.id, name: p.full_name ?? p.id, reason: "protocol" });
        seen.add(p.id);
      }
    }
  }

  // 3. Stale CMJ
  for (const s of snapshots) {
    if (!eligible(s.microplayer_id)) continue;
    if (!seen.has(s.microplayer_id) && s.cmj_freshness_status === "stale") {
      const player = allPlayers.find((p) => p.id === s.microplayer_id);
      result.push({
        id: s.microplayer_id,
        name: player?.full_name ?? s.microplayer_id,
        reason: "stale",
      });
      seen.add(s.microplayer_id);
    }
  }

  // 4. Missing CMJ baseline (active players who have checked in but have no snapshot)
  for (const p of allPlayers) {
    if (!eligible(p.id)) continue;
    if (!seen.has(p.id) && !snapshotMap.has(p.id)) {
      result.push({ id: p.id, name: p.full_name ?? p.id, reason: "missing" });
      seen.add(p.id);
    }
  }

  return result;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function sendCmjReminderToTeam(
  sb: SupabaseClient,
  args: { teamId: string; dateKey: string }
): Promise<{
  teamId: string;
  dateKey: string;
  playersNeedingCmj: number;
  sent: number;
  skippedNoToken: number;
  skippedDuplicate: number;
  failed: number;
  removedInvalidTokens: number;
}> {
  const players = await getPlayersNeedingCmj(sb, args);

  if (!players.length) {
    return {
      teamId: args.teamId,
      dateKey: args.dateKey,
      playersNeedingCmj: 0,
      sent: 0,
      skippedNoToken: 0,
      skippedDuplicate: 0,
      failed: 0,
      removedInvalidTokens: 0,
    };
  }

  const subscriptions = await getActiveSubscriptions(
    sb,
    players.map((p) => p.id)
  );

  let sent = 0;
  let skippedNoToken = 0;
  let skippedDuplicate = 0;
  let failed = 0;
  const invalidSubscriptionIds = new Set<string>();

  for (const player of players) {
    const logId = await reserveLog(sb, { playerId: player.id, dateKey: args.dateKey });
    if (!logId) {
      skippedDuplicate += 1;
      continue;
    }

    const sub = subscriptions.get(player.id);
    if (!sub?.endpoint || !sub?.p256dh || !sub?.auth) {
      skippedNoToken += 1;
      await markLog(sb, { logId, status: "skipped_no_token" });
      continue;
    }

    const msg = buildCmjMessage(player.reason);

    try {
      const response = await sendWebPush(
        { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth } satisfies NativePushSubscription,
        {
          title: msg.title,
          body: msg.body,
          url: "/player",
          type: "cmj_required",
          screen: "cmj",
          reason: player.reason,
          dateKey: args.dateKey,
        }
      );
      sent += 1;
      await markLog(sb, { logId, status: "sent", providerMessageId: response.headers?.location ?? null });
    } catch (err) {
      failed += 1;
      if (sub.id && isSubscriptionGone(err)) invalidSubscriptionIds.add(sub.id);
      await markLog(sb, { logId, status: "failed" });
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
    teamId: args.teamId,
    dateKey: args.dateKey,
    playersNeedingCmj: players.length,
    sent,
    skippedNoToken,
    skippedDuplicate,
    failed,
    removedInvalidTokens,
  };
}
