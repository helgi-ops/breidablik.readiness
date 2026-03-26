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

function sumNullable(a?: number | null, b?: number | null): number | null {
  const hasA = typeof a === "number";
  const hasB = typeof b === "number";
  if (!hasA && !hasB) return null;
  return (a ?? 0) + (b ?? 0);
}

function maxNullable(a?: number | null, b?: number | null): number | null {
  const hasA = typeof a === "number";
  const hasB = typeof b === "number";
  if (!hasA && !hasB) return null;
  return Math.max(a ?? Number.NEGATIVE_INFINITY, b ?? Number.NEGATIVE_INFINITY);
}

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
    current.externalLoad.totalDistance = sumNullable(current.externalLoad.totalDistance, row.externalLoad.totalDistance);
    current.externalLoad.highSpeedDistance = sumNullable(current.externalLoad.highSpeedDistance, row.externalLoad.highSpeedDistance);
    current.externalLoad.sprintDistance = sumNullable(current.externalLoad.sprintDistance, row.externalLoad.sprintDistance);
    current.externalLoad.accelerations = sumNullable(current.externalLoad.accelerations, row.externalLoad.accelerations);
    current.externalLoad.decelerations = sumNullable(current.externalLoad.decelerations, row.externalLoad.decelerations);
    current.externalLoad.playerLoad = sumNullable(current.externalLoad.playerLoad, row.externalLoad.playerLoad);
    current.externalLoad.maxVelocity = maxNullable(current.externalLoad.maxVelocity, row.externalLoad.maxVelocity);
    current.externalLoad.velocityBand5TotalDistance = sumNullable(
      current.externalLoad.velocityBand5TotalDistance,
      row.externalLoad.velocityBand5TotalDistance
    );
    current.externalLoad.velocityBand6TotalDistance = sumNullable(
      current.externalLoad.velocityBand6TotalDistance,
      row.externalLoad.velocityBand6TotalDistance
    );
    current.externalLoad.hirDist = sumNullable(current.externalLoad.hirDist, row.externalLoad.hirDist);
    current.externalLoad.maxVel = maxNullable(current.externalLoad.maxVel, row.externalLoad.maxVel);
    current.externalLoad.accelB23TotEffsGen2 = sumNullable(
      current.externalLoad.accelB23TotEffsGen2,
      row.externalLoad.accelB23TotEffsGen2
    );
    current.externalLoad.totAs = sumNullable(current.externalLoad.totAs, row.externalLoad.totAs);
    current.externalLoad.decelB23TotEffsGen2 = sumNullable(
      current.externalLoad.decelB23TotEffsGen2,
      row.externalLoad.decelB23TotEffsGen2
    );
    current.externalLoad.totDs = sumNullable(current.externalLoad.totDs, row.externalLoad.totDs);
    current.externalLoad.totalPlayerLoad = sumNullable(current.externalLoad.totalPlayerLoad, row.externalLoad.totalPlayerLoad);
    current.externalLoad.playerLoadPerMinute = maxNullable(
      current.externalLoad.playerLoadPerMinute,
      row.externalLoad.playerLoadPerMinute
    );
    current.externalLoad.metabolicPower = sumNullable(current.externalLoad.metabolicPower, row.externalLoad.metabolicPower);
    current.externalLoad.explosiveDistance = sumNullable(current.externalLoad.explosiveDistance, row.externalLoad.explosiveDistance);
    current.externalLoad.imaAccel = sumNullable(current.externalLoad.imaAccel, row.externalLoad.imaAccel);
    current.externalLoad.imaDecel = sumNullable(current.externalLoad.imaDecel, row.externalLoad.imaDecel);
    current.externalLoad.imaCod = sumNullable(current.externalLoad.imaCod, row.externalLoad.imaCod);
    current.externalLoad.imaTotal = sumNullable(current.externalLoad.imaTotal, row.externalLoad.imaTotal);
    current.externalLoad.codEvents = sumNullable(current.externalLoad.codEvents, row.externalLoad.codEvents);
    current.externalLoad.impacts = sumNullable(current.externalLoad.impacts, row.externalLoad.impacts);
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
    ima_accel: row.externalLoad.imaAccel ?? null,
    ima_decel: row.externalLoad.imaDecel ?? null,
    ima_cod: row.externalLoad.imaCod ?? null,
    ima_total: row.externalLoad.imaTotal ?? null,
    cod_events: row.externalLoad.codEvents ?? null,
    impacts: row.externalLoad.impacts ?? null,
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

export async function syncCatapultDailyMetrics(
  inputDate?: string | null,
  options?: { debugIma?: boolean }
): Promise<CatapultSyncResult> {
  const targetDate = dateKey(inputDate);
  const debugImaEnabled = options?.debugIma || process.env.CATAPULT_DEBUG_IMA === "true";
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
  const imaDebug: NonNullable<CatapultSyncResult["imaDebug"]> = [];
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
    if (debugImaEnabled && metric.imaDebug) {
      imaDebug.push({
        athleteId: metric.athleteId,
        activityId: metric.activityId ?? null,
        matchedFields: metric.imaDebug,
        normalized: {
          ima_accel: metric.imaAccel ?? null,
          ima_decel: metric.imaDecel ?? null,
          ima_cod: metric.imaCod ?? null,
          ima_total: metric.imaTotal ?? null,
          cod_events: metric.codEvents ?? null,
          impacts: metric.impacts ?? null,
          playerload_per_min: metric.playerLoadPerMinute ?? null,
        },
      });
    }
  }

  const mergedRows = mergeNormalizedRows(normalizedRows);
  const storedCount = await storeExternalLoadRows(mergedRows);

  if (debugImaEnabled) {
    const sampleDebug = imaDebug.slice(0, 3);
    const noImaFound = sampleDebug.length > 0 && sampleDebug.every((item) => item.matchedFields?.interestingKeys.length === 0);
    console.info(
      JSON.stringify({
        scope: "catapult_sync_ima_debug",
        date: targetDate,
        playersProcessed: aggregated.length,
        sampleSize: sampleDebug.length,
        noImaFound,
        samples: sampleDebug,
      })
    );
    if (!sampleDebug.length) {
      console.info(
        JSON.stringify({
          scope: "catapult_sync_ima_debug",
          date: targetDate,
          message: "No IMA-related fields found in Catapult payload for this activity/date",
        })
      );
    }
  }

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
    imaDebug: debugImaEnabled ? imaDebug : undefined,
  };
}
