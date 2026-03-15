import type { NormalizedMonitoringSnapshot } from "@/lib/integrations/shared/types";
import { getUtcDateWindow, toIsoDateUTC } from "@/lib/integrations/shared/date";
import { getAllWhoopPages, getWhoopProfile, getWhoopRecovery, getWhoopSleep, getWhoopWorkouts } from "./client";
import { mapWhoopDailySnapshot } from "./mapper";
import { refreshWhoopAccessToken } from "./oauth";
import type { WhoopIntegrationRecord, WhoopRecoveryRecord, WhoopSleepRecord, WhoopSyncResult, WhoopWorkoutRecord } from "./types";
import {
  getWhoopIntegrationByAthleteId,
  markWhoopIntegrationStatus,
  saveMonitoringSnapshot,
  updateWhoopIntegrationTokens,
  upsertWhoopIntegration,
} from "@/lib/server/integrations/whoopStore";
import { withWhoopRefreshLock } from "@/lib/server/integrations/whoopRefreshLock";

function isoDate(date = new Date()): string {
  return toIsoDateUTC(date);
}

function isTokenNearExpiry(integration: WhoopIntegrationRecord): boolean {
  if (!integration.access_token_expires_at) return false;
  const expiresAtMs = Date.parse(integration.access_token_expires_at);
  if (!Number.isFinite(expiresAtMs)) return false;
  return expiresAtMs - Date.now() < 5 * 60 * 1000;
}

function pickRecordForDate<T extends { created_at?: string | null }>(records: T[], date: string): T | null {
  for (const record of records) {
    if (!record.created_at) continue;
    if (record.created_at.slice(0, 10) === date) return record;
  }
  return records[0] ?? null;
}

async function withFreshToken(athleteId: string, integration: WhoopIntegrationRecord): Promise<WhoopIntegrationRecord> {
  if (!integration.access_token) return integration;
  if (!isTokenNearExpiry(integration)) return integration;
  if (!integration.refresh_token) throw new Error("WHOOP refresh token missing.");

  return withWhoopRefreshLock(athleteId, async () => {
    const latest = await getWhoopIntegrationByAthleteId(athleteId);
    if (!latest) throw new Error("WHOOP integration not found.");
    if (!isTokenNearExpiry(latest) && latest.access_token) return latest;
    if (!latest.refresh_token) throw new Error("WHOOP refresh token missing.");
    const refreshed = await refreshWhoopAccessToken(latest.refresh_token);
    return updateWhoopIntegrationTokens({
      athleteId,
      token: refreshed,
    });
  });
}

async function fetchDailyWhoopData(args: {
  accessToken: string;
  date: string;
}): Promise<{ recovery: WhoopRecoveryRecord | null; sleep: WhoopSleepRecord | null; workouts: WhoopWorkoutRecord[] }> {
  const { start, end } = getUtcDateWindow(args.date);
  const [recoveries, sleeps, workouts] = await Promise.all([
    getAllWhoopPages((nextToken) => getWhoopRecovery(args.accessToken, { start, end, nextToken })),
    getAllWhoopPages((nextToken) => getWhoopSleep(args.accessToken, { start, end, nextToken })),
    getAllWhoopPages((nextToken) => getWhoopWorkouts(args.accessToken, { start, end, nextToken })),
  ]);
  return {
    recovery: pickRecordForDate(recoveries, args.date),
    sleep: pickRecordForDate(sleeps, args.date),
    workouts,
  };
}

export async function syncWhoopForAthleteDate(args: { athleteId: string; date: string }): Promise<WhoopSyncResult> {
  const warnings: string[] = [];
  const integration = await getWhoopIntegrationByAthleteId(args.athleteId);
  if (!integration || integration.status === "revoked") {
    return {
      ok: false,
      athleteId: args.athleteId,
      date: args.date,
      status: "not_connected",
      partial: false,
      warnings,
      error: "WHOOP is not connected for this athlete.",
    };
  }

  try {
    const refreshed = await withFreshToken(args.athleteId, integration);
    if (!refreshed.access_token) throw new Error("WHOOP access token missing.");

    const profileMissing = !refreshed.external_user_id;
    let externalUserId = refreshed.external_user_id ?? null;
    let externalEmail: string | null = refreshed.external_email ?? null;
    let externalFirstName: string | null = refreshed.external_first_name ?? null;
    let externalLastName: string | null = refreshed.external_last_name ?? null;
    if (profileMissing) {
      const profile = await getWhoopProfile(refreshed.access_token);
      externalUserId = profile.user_id ?? null;
      externalEmail = profile.email ?? null;
      externalFirstName = profile.first_name ?? null;
      externalLastName = profile.last_name ?? null;
    }

    let dailyData;
    try {
      dailyData = await fetchDailyWhoopData({
        accessToken: refreshed.access_token,
        date: args.date,
      });
    } catch (error) {
      const status = (error as Error & { status?: number }).status;
      if (status !== 401 || !refreshed.refresh_token) throw error;
      warnings.push("WHOOP access token expired during sync; attempted refresh.");
      const retried = await withWhoopRefreshLock(args.athleteId, async () => {
        const latest = await getWhoopIntegrationByAthleteId(args.athleteId);
        if (!latest?.refresh_token) throw new Error("WHOOP refresh token missing.");
        const token = await refreshWhoopAccessToken(latest.refresh_token);
        return updateWhoopIntegrationTokens({
          athleteId: args.athleteId,
          token,
        });
      });
      if (!retried.access_token) throw new Error("WHOOP token refresh failed.");
      dailyData = await fetchDailyWhoopData({
        accessToken: retried.access_token,
        date: args.date,
      });
    }

    const noRecords = !dailyData.recovery && !dailyData.sleep && dailyData.workouts.length === 0;
    if (noRecords) {
      await upsertWhoopIntegration({
        athlete_id: args.athleteId,
        provider: "whoop",
        status: "active",
        last_synced_at: new Date().toISOString(),
        last_sync_status: "success",
        last_sync_error: null,
      });
      return {
        ok: true,
        athleteId: args.athleteId,
        date: args.date,
        status: "partial",
        partial: true,
        warnings: [...warnings, "No WHOOP records returned for this date."],
        lastSyncedAt: new Date().toISOString(),
      };
    }

    const snapshot: NormalizedMonitoringSnapshot = mapWhoopDailySnapshot({
      athleteId: args.athleteId,
      date: args.date,
      recovery: dailyData.recovery,
      sleep: dailyData.sleep,
      workouts: dailyData.workouts,
    });

    await saveMonitoringSnapshot(snapshot);
    const lastSyncedAt = new Date().toISOString();
    await upsertWhoopIntegration({
      athlete_id: args.athleteId,
      provider: "whoop",
      status: "active",
      external_user_id: externalUserId,
      external_email: externalEmail,
      external_first_name: externalFirstName,
      external_last_name: externalLastName,
      last_synced_at: lastSyncedAt,
      last_sync_status: "success",
      last_sync_error: null,
    });

    const partial = !dailyData.recovery || !dailyData.sleep;
    if (partial) warnings.push("WHOOP returned partial daily data for the selected date.");

    return {
      ok: true,
      athleteId: args.athleteId,
      date: args.date,
      status: partial ? "partial" : "success",
      partial,
      snapshot,
      warnings,
      lastSyncedAt,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "WHOOP sync failed";
    await markWhoopIntegrationStatus({
      athleteId: args.athleteId,
      status: "error",
      lastSyncStatus: "error",
      error: message,
    });
    return {
      ok: false,
      athleteId: args.athleteId,
      date: args.date,
      status: "error",
      partial: false,
      warnings,
      error: message,
    };
  }
}

export async function syncWhoopForToday(args: { athleteId: string }): Promise<WhoopSyncResult> {
  return syncWhoopForAthleteDate({ athleteId: args.athleteId, date: isoDate() });
}

export async function syncWhoopInitialBackfill(args: { athleteId: string; days?: number }): Promise<{
  ok: boolean;
  athleteId: string;
  syncedDates: string[];
  failedDates: Array<{ date: string; error: string }>;
  partialDates: string[];
}> {
  const days = Math.max(1, Math.min(args.days ?? 7, 30));
  const today = new Date();
  const dates: string[] = [];
  for (let i = 0; i < days; i += 1) {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() - i);
    dates.push(isoDate(d));
  }

  const syncedDates: string[] = [];
  const failedDates: Array<{ date: string; error: string }> = [];
  const partialDates: string[] = [];

  for (const date of dates) {
    const result = await syncWhoopForAthleteDate({ athleteId: args.athleteId, date });
    if (result.ok) {
      syncedDates.push(date);
      if (result.partial) partialDates.push(date);
    } else {
      failedDates.push({ date, error: result.error || "sync_failed" });
    }
  }

  if (syncedDates.includes(dates[0])) {
    await upsertWhoopIntegration({
      athlete_id: args.athleteId,
      provider: "whoop",
      status: "active",
      last_sync_status: "success",
      last_sync_error: null,
      last_synced_at: new Date().toISOString(),
    });
  }

  return {
    ok: syncedDates.length > 0 && syncedDates.includes(dates[0]),
    athleteId: args.athleteId,
    syncedDates,
    failedDates,
    partialDates,
  };
}

// Backward-compatible export name for existing references.
export const syncWhoopForAthlete = syncWhoopForAthleteDate;
