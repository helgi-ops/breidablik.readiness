import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { NormalizedMonitoringSnapshot } from "@/lib/integrations/shared/types";
import type { WhoopIntegrationRecord, WhoopTokenResponse } from "@/lib/integrations/whoop/types";
import { computeAccessTokenExpiresAt } from "@/lib/integrations/whoop/oauth";

function nowIso(): string {
  return new Date().toISOString();
}

function redactErrorMessage(message: string): string {
  return message.replace(/[A-Za-z0-9-_]{20,}\.[A-Za-z0-9-_]{20,}\.[A-Za-z0-9-_]{20,}/g, "[redacted-token]");
}

function isNoRowsError(error: { code?: string; details?: string | null; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "PGRST116";
}

function isMissingRelationOrColumnError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "42P01" || error.code === "42703";
}

export async function resolveAthleteIdForUser(userId: string): Promise<string> {
  const sb = getSupabaseAdmin();
  const { data } = await sb.from("profiles").select("player_id").eq("id", userId).maybeSingle();
  const playerId = (data as { player_id?: string | null } | null)?.player_id ?? null;
  return playerId || userId;
}

export async function resolveOwnedAthleteIdForPlayerUser(userId: string): Promise<string> {
  const sb = getSupabaseAdmin();
  // 1) Preferred mapping: players.user_id -> players.id
  const { data: playerRows, error: playerErr } = await sb
    .from("players")
    .select("id")
    .eq("user_id", userId)
    .order("id", { ascending: true })
    .limit(1);
  if (playerErr) throw playerErr;
  const playerIdFromPlayers = ((playerRows as { id?: string | null }[] | null)?.[0]?.id ?? null) as string | null;
  if (playerIdFromPlayers) return playerIdFromPlayers;

  // 2) Secondary mapping: profiles.player_id
  const { data: profileRow, error: profileErr } = await sb.from("profiles").select("player_id").eq("id", userId).maybeSingle();
  if (profileErr) throw profileErr;
  const playerIdFromProfile = (profileRow as { player_id?: string | null } | null)?.player_id ?? null;
  if (playerIdFromProfile) return playerIdFromProfile;

  // 3) Safe ownership fallback: keep data bound to current authenticated user only.
  return userId;
}

export async function getWhoopIntegrationByAthleteId(athleteId: string): Promise<WhoopIntegrationRecord | null> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("athlete_integrations")
    .select("*")
    .eq("athlete_id", athleteId)
    .eq("provider", "whoop")
    .order("updated_at", { ascending: false })
    .limit(1);
  if (error) {
    if (isMissingRelationOrColumnError(error)) return null;
    throw error;
  }
  return ((data as WhoopIntegrationRecord[] | null)?.[0] ?? null) as WhoopIntegrationRecord | null;
}

export async function upsertWhoopIntegration(record: Partial<WhoopIntegrationRecord> & { athlete_id: string }): Promise<WhoopIntegrationRecord> {
  const sb = getSupabaseAdmin();
  const payload: Record<string, unknown> = {
    provider: "whoop",
    athlete_id: record.athlete_id,
    updated_at: nowIso(),
  };
  if (record.status !== undefined) payload.status = record.status;
  if (record.external_user_id !== undefined) payload.external_user_id = record.external_user_id;
  if (record.external_email !== undefined) payload.external_email = record.external_email;
  if (record.external_first_name !== undefined) payload.external_first_name = record.external_first_name;
  if (record.external_last_name !== undefined) payload.external_last_name = record.external_last_name;
  if (record.access_token !== undefined) payload.access_token = record.access_token;
  if (record.refresh_token !== undefined) payload.refresh_token = record.refresh_token;
  if (record.token_type !== undefined) payload.token_type = record.token_type;
  if (record.scopes !== undefined) payload.scopes = record.scopes;
  if (record.access_token_expires_at !== undefined) payload.access_token_expires_at = record.access_token_expires_at;
  if (record.last_synced_at !== undefined) payload.last_synced_at = record.last_synced_at;
  if (record.last_sync_status !== undefined) payload.last_sync_status = record.last_sync_status;
  if (record.last_sync_error !== undefined) payload.last_sync_error = record.last_sync_error;

  const { data, error } = await sb
    .from("athlete_integrations")
    .upsert(payload, { onConflict: "athlete_id,provider" })
    .select("*")
    .single();
  if (error) throw error;
  return data as WhoopIntegrationRecord;
}

export async function updateWhoopIntegrationTokens(args: {
  athleteId: string;
  token: WhoopTokenResponse;
  scopes?: string[] | null;
}): Promise<WhoopIntegrationRecord> {
  return upsertWhoopIntegration({
    athlete_id: args.athleteId,
    status: "active",
    access_token: args.token.access_token,
    refresh_token: args.token.refresh_token ?? null,
    token_type: args.token.token_type ?? "Bearer",
    scopes: args.scopes ?? (args.token.scope ? args.token.scope.split(" ").filter(Boolean) : null),
    access_token_expires_at: computeAccessTokenExpiresAt(args.token),
    last_sync_error: null,
  });
}

export async function markWhoopIntegrationStatus(args: {
  athleteId: string;
  status: WhoopIntegrationRecord["status"];
  lastSyncStatus?: WhoopIntegrationRecord["last_sync_status"];
  error?: string | null;
  clearTokens?: boolean;
}): Promise<WhoopIntegrationRecord> {
  return upsertWhoopIntegration({
    athlete_id: args.athleteId,
    status: args.status,
    last_sync_status: args.lastSyncStatus,
    last_sync_error: args.error ? redactErrorMessage(args.error) : null,
    ...(args.clearTokens
      ? {
          access_token: null,
          refresh_token: null,
          token_type: null,
          access_token_expires_at: null,
        }
      : {}),
  });
}

export async function clearWhoopTokens(athleteId: string): Promise<WhoopIntegrationRecord> {
  return upsertWhoopIntegration({
    athlete_id: athleteId,
    provider: "whoop",
    access_token: null,
    refresh_token: null,
    token_type: null,
    access_token_expires_at: null,
  });
}

export async function saveMonitoringSnapshot(snapshot: NormalizedMonitoringSnapshot): Promise<void> {
  const sb = getSupabaseAdmin();
  const payload = {
    athlete_id: snapshot.athleteId,
    source: snapshot.source,
    date: snapshot.date,
    recovery_score: snapshot.recoveryScore ?? null,
    hrv: snapshot.hrv ?? null,
    resting_hr: snapshot.restingHr ?? null,
    respiratory_rate: snapshot.respiratoryRate ?? null,
    sleep_performance: snapshot.sleepPerformance ?? null,
    sleep_consistency: snapshot.sleepConsistency ?? null,
    sleep_efficiency: snapshot.sleepEfficiency ?? null,
    total_sleep_millis: snapshot.totalSleepMillis ?? null,
    workout_strain: snapshot.workoutStrain ?? null,
    average_hr: snapshot.averageHr ?? null,
    max_hr: snapshot.maxHr ?? null,
    raw_payload_json: snapshot.raw ?? null,
    updated_at: nowIso(),
  };

  const { error } = await sb.from("athlete_monitoring_snapshots").upsert(payload, {
    onConflict: "athlete_id,source,date",
  });
  if (error) throw error;
}

export async function getLatestMonitoringSnapshotForAthlete(
  athleteId: string,
  source: "whoop" | null = "whoop",
): Promise<NormalizedMonitoringSnapshot | null> {
  const sb = getSupabaseAdmin();
  let query = sb
    .from("athlete_monitoring_snapshots")
    .select("*")
    .eq("athlete_id", athleteId)
    .order("date", { ascending: false })
    .limit(1);
  if (source) query = query.eq("source", source);
  const { data, error } = await query.maybeSingle();
  if (error) {
    if (isNoRowsError(error) || isMissingRelationOrColumnError(error)) return null;
    throw error;
  }
  if (!data) return null;
  const row = data as Record<string, unknown>;
  return {
    athleteId: String(row.athlete_id),
    source: "whoop",
    date: String(row.date),
    recoveryScore: (row.recovery_score as number | null) ?? undefined,
    hrv: (row.hrv as number | null) ?? undefined,
    restingHr: (row.resting_hr as number | null) ?? undefined,
    respiratoryRate: (row.respiratory_rate as number | null) ?? undefined,
    sleepPerformance: (row.sleep_performance as number | null) ?? undefined,
    sleepConsistency: (row.sleep_consistency as number | null) ?? undefined,
    sleepEfficiency: (row.sleep_efficiency as number | null) ?? undefined,
    totalSleepMillis: (row.total_sleep_millis as number | null) ?? undefined,
    workoutStrain: (row.workout_strain as number | null) ?? undefined,
    averageHr: (row.average_hr as number | null) ?? undefined,
    maxHr: (row.max_hr as number | null) ?? undefined,
    raw: row.raw_payload_json,
  };
}

export async function getLatestWhoopSnapshotForAthlete(athleteId: string): Promise<NormalizedMonitoringSnapshot | null> {
  return getLatestMonitoringSnapshotForAthlete(athleteId, "whoop");
}

export async function getWhoopIntegrationStatusForAthlete(athleteId: string): Promise<{
  connected: boolean;
  status: WhoopIntegrationRecord["status"] | "not_connected";
  provider: "whoop";
  lastSyncedAt: string | null;
  lastSyncStatus: WhoopIntegrationRecord["last_sync_status"] | null;
  lastSyncError: string | null;
  externalProfile: {
    userId: string | null;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
  } | null;
}> {
  const integration = await getWhoopIntegrationByAthleteId(athleteId);
  if (!integration) {
    return {
      connected: false,
      status: "not_connected",
      provider: "whoop",
      lastSyncedAt: null,
      lastSyncStatus: null,
      lastSyncError: null,
      externalProfile: null,
    };
  }
  return {
    connected: integration.status === "active",
    status: integration.status,
    provider: "whoop",
    lastSyncedAt: integration.last_synced_at,
    lastSyncStatus: integration.last_sync_status ?? null,
    lastSyncError: integration.last_sync_error ?? null,
    externalProfile: {
      userId: integration.external_user_id ?? null,
      email: integration.external_email ?? null,
      firstName: integration.external_first_name ?? null,
      lastName: integration.external_last_name ?? null,
    },
  };
}
