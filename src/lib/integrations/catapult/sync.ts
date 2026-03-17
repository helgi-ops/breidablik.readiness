import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { fetchActivitiesForDate, fetchActivityStats, fetchActivityStatsBatch, fetchCatapultAthletes } from "./api";
import { mapCatapultAthleteToPlayer, upsertCatapultAthleteMapping } from "./mapAthletes";
import { aggregateCatapultMetrics, normalizeCatapultActivityStats, toNormalizedExternalLoad } from "./normalize";
import type { CatapultAthlete, CatapultSyncResult } from "./types";

function dateKey(input?: string | null): string {
  if (input && /^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
  return new Date().toISOString().slice(0, 10);
}

async function logIntegrationEvent(args: {
  provider: string;
  scope: string;
  status: string;
  message: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    const sb = getSupabaseAdmin();
    await sb.from("integration_logs").insert({
      provider: args.provider,
      scope: args.scope,
      status: args.status,
      message: args.message,
      metadata: args.metadata ?? {},
    });
  } catch {
    // Avoid sync failure because logging table is unavailable.
  }
}

async function loadAthleteDirectory(): Promise<Map<string, CatapultAthlete>> {
  const athletes = await fetchCatapultAthletes();
  return new Map(athletes.map((athlete) => [athlete.id, athlete]));
}

type AggregatedRow = ReturnType<typeof toNormalizedExternalLoad>;

function mergeNormalizedRows(rows: AggregatedRow[]): AggregatedRow[] {
  const merged = new Map<string, AggregatedRow>();

  for (const row of rows) {
    const key = `${row.playerId}:${row.date}:${row.source}`;
    const current = merged.get(key);
    if (!current) {
      merged.set(key, { ...row, activityCount: row.activityCount ?? 1 });
      continue;
    }

    current.activityCount = (current.activityCount ?? 1) + (row.activityCount ?? 1);
    current.externalLoad.totalDistance = (current.externalLoad.totalDistance ?? 0) + (row.externalLoad.totalDistance ?? 0);
    current.externalLoad.highSpeedDistance = (current.externalLoad.highSpeedDistance ?? 0) + (row.externalLoad.highSpeedDistance ?? 0);
    current.externalLoad.sprintDistance = (current.externalLoad.sprintDistance ?? 0) + (row.externalLoad.sprintDistance ?? 0);
    current.externalLoad.accelerations = (current.externalLoad.accelerations ?? 0) + (row.externalLoad.accelerations ?? 0);
    current.externalLoad.decelerations = (current.externalLoad.decelerations ?? 0) + (row.externalLoad.decelerations ?? 0);
    current.externalLoad.playerLoad = (current.externalLoad.playerLoad ?? 0) + (row.externalLoad.playerLoad ?? 0);
    current.externalLoad.maxVelocity = Math.max(current.externalLoad.maxVelocity ?? 0, row.externalLoad.maxVelocity ?? 0);
    current.externalLoad.velocityBand5TotalDistance = (current.externalLoad.velocityBand5TotalDistance ?? 0) + (row.externalLoad.velocityBand5TotalDistance ?? 0);
    current.externalLoad.velocityBand6TotalDistance = (current.externalLoad.velocityBand6TotalDistance ?? 0) + (row.externalLoad.velocityBand6TotalDistance ?? 0);
    current.externalLoad.hirDist = (current.externalLoad.hirDist ?? 0) + (row.externalLoad.hirDist ?? 0);
    current.externalLoad.maxVel = Math.max(current.externalLoad.maxVel ?? 0, row.externalLoad.maxVel ?? 0);
    current.externalLoad.accelB23TotEffsGen2 = (current.externalLoad.accelB23TotEffsGen2 ?? 0) + (row.externalLoad.accelB23TotEffsGen2 ?? 0);
    current.externalLoad.totAs = (current.externalLoad.totAs ?? 0) + (row.externalLoad.totAs ?? 0);
    current.externalLoad.decelB23TotEffsGen2 = (current.externalLoad.decelB23TotEffsGen2 ?? 0) + (row.externalLoad.decelB23TotEffsGen2 ?? 0);
    current.externalLoad.totDs = (current.externalLoad.totDs ?? 0) + (row.externalLoad.totDs ?? 0);
    current.externalLoad.totalPlayerLoad = (current.externalLoad.totalPlayerLoad ?? 0) + (row.externalLoad.totalPlayerLoad ?? 0);
    current.externalLoad.playerLoadPerMinute = Math.max(current.externalLoad.playerLoadPerMinute ?? 0, row.externalLoad.playerLoadPerMinute ?? 0);
    current.externalLoad.metabolicPower = (current.externalLoad.metabolicPower ?? 0) + (row.externalLoad.metabolicPower ?? 0);
    current.externalLoad.explosiveDistance = (current.externalLoad.explosiveDistance ?? 0) + (row.externalLoad.explosiveDistance ?? 0);
  }

  return Array.from(merged.values());
}

async function enrichWithTeam(rows: AggregatedRow[]) {
  const sb = getSupabaseAdmin();
  const playerIds = Array.from(new Set(rows.map((row) => row.playerId)));
  if (!playerIds.length) return new Map<string, string | null>();
  const { data, error } = await sb.from("players").select("id, team_id").in("id", playerIds);
  if (error) throw new Error(error.message);
  return new Map(((data ?? []) as Array<Record<string, unknown>>).map((row) => [String(row.id), (row.team_id as string | null) ?? null]));
}

async function storeExternalLoadRows(rows: AggregatedRow[]): Promise<number> {
  const sb = getSupabaseAdmin();
  const teamByPlayer = await enrichWithTeam(rows);

  const payload = rows.map((row) => ({
    player_id: row.playerId,
    team_id: teamByPlayer.get(row.playerId) ?? null,
    date: row.date,
    total_distance: row.externalLoad.totalDistance,
    high_speed_distance: row.externalLoad.highSpeedDistance,
    sprint_distance: row.externalLoad.sprintDistance,
    accelerations: row.externalLoad.accelerations,
    decelerations: row.externalLoad.decelerations,
    player_load: row.externalLoad.playerLoad,
    max_velocity: row.externalLoad.maxVelocity,
    velocity_band5_total_distance: row.externalLoad.velocityBand5TotalDistance ?? null,
    velocity_band6_total_distance: row.externalLoad.velocityBand6TotalDistance ?? null,
    hir_dist: row.externalLoad.hirDist ?? null,
    max_vel: row.externalLoad.maxVel ?? null,
    accel_b2_3_tot_effs_gen2: row.externalLoad.accelB23TotEffsGen2 ?? null,
    tot_as: row.externalLoad.totAs ?? null,
    decel_b2_3_tot_effs_gen2: row.externalLoad.decelB23TotEffsGen2 ?? null,
    tot_ds: row.externalLoad.totDs ?? null,
    total_player_load: row.externalLoad.totalPlayerLoad ?? null,
    player_load_per_minute: row.externalLoad.playerLoadPerMinute ?? null,
    metabolic_power: row.externalLoad.metabolicPower ?? null,
    explosive_distance: row.externalLoad.explosiveDistance ?? null,
    source: "catapult",
    external_athlete_id: row.externalAthleteId,
    activity_count: row.activityCount ?? 1,
    raw_payload_json: row.rawPayload ?? null,
  }));

  if (!payload.length) return 0;

  const { error } = await sb.from("player_external_load_daily").upsert(payload, {
    onConflict: "player_id,date,source",
  });
  if (error) throw new Error(error.message);
  return payload.length;
}

export async function syncCatapultDailyMetrics(inputDate?: string | null): Promise<CatapultSyncResult> {
  const targetDate = dateKey(inputDate);
  const warnings: string[] = [];
  const athleteDirectory = await loadAthleteDirectory();
  const activities = await fetchActivitiesForDate(targetDate);

  const perActivityMetrics = [];
  let statsFetched = 0;
  if (activities.length) {
    try {
      const statsPayload = await fetchActivityStatsBatch(activities.map((activity) => activity.id));
      const normalized = normalizeCatapultActivityStats({
        date: targetDate,
        payload: statsPayload,
      });
      perActivityMetrics.push(...normalized);
      statsFetched = activities.length;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown Catapult stats error";
      warnings.push(`Bulk stats fetch failed: ${message}`);
      await logIntegrationEvent({
        provider: "catapult",
        scope: "daily-sync",
        status: "warning",
        message: "Bulk Catapult stats fetch failed. Falling back to per-activity requests.",
        metadata: { date: targetDate, activityCount: activities.length, error: message },
      });

      for (const activity of activities) {
        try {
          const statsPayload = await fetchActivityStats(activity.id);
          const normalized = normalizeCatapultActivityStats({
            activityId: activity.id,
            date: targetDate,
            payload: statsPayload,
          });
          perActivityMetrics.push(...normalized);
          statsFetched += 1;
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown Catapult stats error";
          warnings.push(`Activity ${activity.id}: ${message}`);
          await logIntegrationEvent({
            provider: "catapult",
            scope: "daily-sync",
            status: "error",
            message,
            metadata: { activityId: activity.id, date: targetDate },
          });
        }
      }
    }
  }

  const aggregated = aggregateCatapultMetrics(perActivityMetrics);
  const normalizedRows = [];
  let unmatchedCount = 0;

  for (const metric of aggregated) {
    const athlete = athleteDirectory.get(metric.athleteId) ?? {
      id: metric.athleteId,
      firstName: "",
      lastName: "",
      email: null,
    };
    const mapped = await mapCatapultAthleteToPlayer(athlete);
    if (!mapped) {
      unmatchedCount += 1;
      warnings.push(`Unmatched Catapult athlete ${metric.athleteId}`);
      await logIntegrationEvent({
        provider: "catapult",
        scope: "athlete-map",
        status: "warning",
        message: "Unmatched Catapult athlete during daily sync.",
        metadata: { athleteId: metric.athleteId, date: targetDate },
      });
      continue;
    }

    await upsertCatapultAthleteMapping(mapped);
    normalizedRows.push(toNormalizedExternalLoad(metric, mapped.micropulsePlayerId));
  }

  const mergedRows = mergeNormalizedRows(normalizedRows);
  const storedCount = await storeExternalLoadRows(mergedRows);

  await logIntegrationEvent({
    provider: "catapult",
    scope: "daily-sync",
    status: "success",
    message: `Catapult sync completed for ${targetDate}.`,
    metadata: {
      athletesFetched: athleteDirectory.size,
      activitiesFetched: activities.length,
      statsFetched,
      normalizedCount: mergedRows.length,
      storedCount,
      unmatchedCount,
      warnings,
    },
  });

  return {
    date: targetDate,
    athletesFetched: athleteDirectory.size,
    activitiesFetched: activities.length,
    statsFetched,
    normalizedCount: mergedRows.length,
    storedCount,
    unmatchedCount,
    warnings,
  };
}
