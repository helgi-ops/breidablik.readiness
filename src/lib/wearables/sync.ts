/**
 * src/lib/wearables/sync.ts
 *
 * Pulls wearable data for a single connection and upserts it into
 * wearable_sleep_data + wearable_daily_data. Used by:
 *   - /api/wearables/sync (manual / cron-triggered sync, e.g. nightly)
 *   - Polar webhook receiver (single-connection sync on push notification)
 */

import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getWearableProvider } from "./registry";
import type {
  WearableConnectionState,
  WearableProviderKey,
} from "./types";

function getAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE ?? "";
  return createClient(url, key, { auth: { persistSession: false } });
}

type ConnectionRow = {
  id: string;
  profile_id: string;
  provider: WearableProviderKey;
  provider_user_id: string;
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
  scopes: string[];
  device_label: string | null;
};

function toState(row: ConnectionRow): WearableConnectionState {
  return {
    providerUserId: row.provider_user_id,
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    expiresAt: row.expires_at,
    scopes: row.scopes,
    deviceLabel: row.device_label,
  };
}

/** Resolve the players.id for a connection's profile. Wearable data is
 *  stored against player_id (not profile_id) so the rest of the system
 *  (readiness, decision engine) can find it via existing FK paths. */
async function resolvePlayerId(
  sb: SupabaseClient,
  profileId: string,
): Promise<string | null> {
  const { data } = await sb
    .from("profiles")
    .select("player_id")
    .eq("id", profileId)
    .maybeSingle();
  return (data as { player_id?: string | null } | null)?.player_id ?? null;
}

/** Sync sleep + daily summaries for a single connection. Date range
 *  defaults to last 14 days (covers a 1-week absence + dedup margin). */
export async function syncConnection(
  connectionId: string,
  opts: { from?: string; to?: string } = {},
): Promise<{
  ok: true;
  sleepCount: number;
  dailyCount: number;
} | {
  ok: false;
  error: string;
}> {
  const sb = getAdminClient();

  const { data: rawRow, error: connErr } = await sb
    .from("wearable_connections")
    .select("id, profile_id, provider, provider_user_id, access_token, refresh_token, expires_at, scopes, device_label")
    .eq("id", connectionId)
    .eq("is_active", true)
    .maybeSingle();

  if (connErr || !rawRow) {
    return { ok: false, error: `Connection not found: ${connectionId}` };
  }
  const row = rawRow as ConnectionRow;

  const playerId = await resolvePlayerId(sb, row.profile_id);
  if (!playerId) {
    await sb
      .from("wearable_connections")
      .update({
        last_sync_error: "Profile has no linked player_id — wearable data has no destination",
      })
      .eq("id", connectionId);
    return { ok: false, error: "No player_id on profile" };
  }

  const today = new Date();
  const to = opts.to ?? today.toISOString().slice(0, 10);
  const fromDate = new Date(today);
  fromDate.setUTCDate(fromDate.getUTCDate() - 13);
  const from = opts.from ?? fromDate.toISOString().slice(0, 10);

  const provider = getWearableProvider(row.provider);
  const state = toState(row);

  let sleepCount = 0;
  let dailyCount = 0;

  try {
    const sleep = await provider.fetchSleep(state, from, to);
    if (sleep.length > 0) {
      const payload = sleep.map((n) => ({
        player_id: playerId,
        connection_id: row.id,
        provider: row.provider,
        sleep_date: n.sleepDate,
        sleep_start_at: n.sleepStartAt,
        sleep_end_at: n.sleepEndAt,
        total_sleep_min: n.totalSleepMin,
        sleep_efficiency_pct: n.sleepEfficiencyPct,
        deep_sleep_min: n.deepSleepMin,
        rem_sleep_min: n.remSleepMin,
        light_sleep_min: n.lightSleepMin,
        wake_min: n.wakeMin,
        provider_score: n.providerScore,
        source_record_id: n.sourceRecordId,
        raw: n.raw,
      }));
      const { error: upErr } = await sb
        .from("wearable_sleep_data")
        .upsert(payload, { onConflict: "connection_id,sleep_date" });
      if (upErr) throw new Error(`sleep upsert: ${upErr.message}`);
      sleepCount = payload.length;
    }

    const daily = await provider.fetchDailySummary(state, from, to);
    if (daily.length > 0) {
      const payload = daily.map((d) => ({
        player_id: playerId,
        connection_id: row.id,
        provider: row.provider,
        measurement_date: d.measurementDate,
        resting_hr_bpm: d.restingHrBpm,
        hrv_rmssd_ms: d.hrvRmssdMs,
        provider_recovery_score: d.providerRecoveryScore,
        source_record_id: d.sourceRecordId,
        raw: d.raw,
      }));
      const { error: upErr } = await sb
        .from("wearable_daily_data")
        .upsert(payload, { onConflict: "connection_id,measurement_date" });
      if (upErr) throw new Error(`daily upsert: ${upErr.message}`);
      dailyCount = payload.length;
    }

    await sb
      .from("wearable_connections")
      .update({
        last_synced_at: new Date().toISOString(),
        last_sync_error: null,
      })
      .eq("id", connectionId);

    return { ok: true, sleepCount, dailyCount };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown sync error";
    await sb
      .from("wearable_connections")
      .update({ last_sync_error: msg.slice(0, 500) })
      .eq("id", connectionId);
    return { ok: false, error: msg };
  }
}

/** Sync every active connection. For nightly cron. */
export async function syncAllConnections(): Promise<{
  total: number;
  ok: number;
  failed: number;
  errors: string[];
}> {
  const sb = getAdminClient();
  const { data, error } = await sb
    .from("wearable_connections")
    .select("id")
    .eq("is_active", true);

  if (error || !data) {
    return { total: 0, ok: 0, failed: 0, errors: [error?.message ?? "no rows"] };
  }

  const results = await Promise.all(
    (data as Array<{ id: string }>).map((row) => syncConnection(row.id)),
  );

  const errors: string[] = [];
  let ok = 0;
  let failed = 0;
  for (const r of results) {
    if (r.ok) ok += 1;
    else {
      failed += 1;
      errors.push(r.error);
    }
  }

  return { total: results.length, ok, failed, errors };
}
