import type { CatapultDailyLoadRow, CatapultExternalLoadBaseline } from "./types";
import { oneRowPerDate } from "@/lib/micropulse/load/oneRowPerDate";

type RawExternalLoadRow = Record<string, unknown>;

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function sum(values: number[]): number {
  return values.reduce((acc, value) => acc + value, 0);
}

function average(values: number[]): number {
  return values.length ? sum(values) / values.length : 0;
}

function startOfWindow(date: string, days: number): string {
  const base = new Date(`${date}T00:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() - days);
  return base.toISOString().slice(0, 10);
}

/** Whole-day distance between two ISO YYYY-MM-DD dates (later - earlier). */
export function daysBetween(earlier: string, later: string): number {
  const a = new Date(`${earlier}T00:00:00.000Z`).getTime();
  const b = new Date(`${later}T00:00:00.000Z`).getTime();
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

function hasSameOrEarlierDate(rowDate: string, targetDate: string): boolean {
  return rowDate <= targetDate;
}

export function getAccelLoad(row: CatapultDailyLoadRow | null | undefined): number {
  if (!row) return 0;
  return row.accelerations ?? row.totalAccelerations ?? 0;
}

export function getDecelLoad(row: CatapultDailyLoadRow | null | undefined): number {
  if (!row) return 0;
  return row.decelerations ?? row.totalDecelerations ?? 0;
}

export function getDensityStress(row: CatapultDailyLoadRow | null | undefined): number {
  return row?.playerLoadPerMinute ?? 0;
}

export function getBand6Distance(row: CatapultDailyLoadRow | null | undefined): number {
  return row?.velocityBand6TotalDistance ?? 0;
}

/** High-intensity deceleration efforts (Band 2-3). */
export function getHighDecelEfforts(row: CatapultDailyLoadRow | null | undefined): number {
  return row?.decelBand2to3Efforts ?? 0;
}

/** High-intensity acceleration efforts (Band 2-3). */
export function getHighAccelEfforts(row: CatapultDailyLoadRow | null | undefined): number {
  return row?.accelBand2to3Efforts ?? 0;
}

/** Total distance covered. */
export function getTotalDistance(row: CatapultDailyLoadRow | null | undefined): number {
  return row?.totalDistance ?? 0;
}

/**
 * HIR (High-Intensity Running) distance.
 * If the dedicated `hirDist` field is populated, use it.
 * Otherwise fall back to Band 5 + Band 6 velocity distances,
 * which together approximate the HIR threshold (~5.5 m/s+).
 */
export function getHirDistance(row: CatapultDailyLoadRow | null | undefined): number {
  if (!row) return 0;
  if (row.hirDist != null && row.hirDist > 0) return row.hirDist;
  return (row.velocityBand5TotalDistance ?? 0) + (row.velocityBand6TotalDistance ?? 0);
}

export function normalizeCatapultDailyLoadRow(row: RawExternalLoadRow): CatapultDailyLoadRow | null {
  const playerId = typeof row.player_id === "string" ? row.player_id : typeof row.playerId === "string" ? row.playerId : null;
  const date = typeof row.date === "string" ? row.date : null;
  if (!playerId || !date) return null;

  return {
    playerId,
    teamId: typeof row.team_id === "string" ? row.team_id : typeof row.teamId === "string" ? row.teamId : null,
    date,
    totalDistance: asNumber(row.total_distance ?? row.totalDistance),
    hirDist: asNumber(row.hir_dist ?? row.hirDist),
    maxVelocity: asNumber(row.max_vel ?? row.max_velocity ?? row.maxVelocity),
    accelerations: asNumber(row.accelerations),
    decelerations: asNumber(row.decelerations),
    playerLoad: asNumber(row.total_player_load ?? row.player_load ?? row.playerLoad),
    playerLoadPerMinute: asNumber(row.player_load_per_minute ?? row.playerLoadPerMinute),
    velocityBand5TotalDistance: asNumber(row.velocity_band5_total_distance ?? row.velocityBand5TotalDistance),
    velocityBand6TotalDistance: asNumber(row.velocity_band6_total_distance ?? row.velocityBand6TotalDistance),
    accelBand2to3Efforts: asNumber(row.accel_b2_3_tot_effs_gen2 ?? row.accelBand2to3Efforts),
    decelBand2to3Efforts: asNumber(row.decel_b2_3_tot_effs_gen2 ?? row.decelBand2to3Efforts),
    totalAccelerations: asNumber(row.tot_as ?? row.totalAccelerations),
    totalDecelerations: asNumber(row.tot_ds ?? row.totalDecelerations),
    // FMP
    fmpDynamicMediumS: asNumber(row.fmp_dynamic_medium_s ?? row.fmpDynamicMediumS),
    fmpDynamicHighS: asNumber(row.fmp_dynamic_high_s ?? row.fmpDynamicHighS),
    fmpRunningHighS: asNumber(row.fmp_running_high_s ?? row.fmpRunningHighS),
    fmpTotalDurationS: asNumber(row.fmp_total_duration_s ?? row.fmpTotalDurationS),
    imaTotal: asNumber(row.ima_total ?? row.imaTotal),
  };
}

export async function fetchCatapultDailyLoadRows(args: {
  playerId: string;
  date: string;
  teamId?: string | null;
}): Promise<CatapultDailyLoadRow[]> {
  const { getSupabaseServer } = await import("@/lib/supabaseServer");
  const supabase = getSupabaseServer();
  const startDate = startOfWindow(args.date, 28);

  const buildQuery = (withTeamFilter: boolean) => {
    let query = supabase
      .from("player_external_load_daily")
      .select("*")
      .in("source", ["catapult", "manual"])
      .eq("player_id", args.playerId)
      .gte("date", startDate)
      .lte("date", args.date)
      .order("date", { ascending: true });

    if (withTeamFilter && args.teamId) {
      query = query.eq("team_id", args.teamId);
    }
    return query;
  };

  let response = await buildQuery(!!args.teamId);
  if (response.error && args.teamId && /team_id/i.test(response.error.message)) {
    response = await buildQuery(false);
  }
  if (response.error) throw response.error;

  // One effective row per date: a manual coach entry overrides the pod reading
  // for that day. Dedupe on the raw rows (they carry `source`) before normalise.
  const deduped = oneRowPerDate(
    (response.data ?? []) as Array<RawExternalLoadRow & { date: string; source?: string | null }>,
  );
  return deduped
    .map(normalizeCatapultDailyLoadRow)
    .filter((row): row is CatapultDailyLoadRow => row != null)
    .filter((row) => hasSameOrEarlierDate(row.date, args.date));
}

export function computeCatapultExternalLoadBaseline(args: {
  rows: CatapultDailyLoadRow[];
  date: string;
}): {
  today: CatapultDailyLoadRow | null;
  baseline: CatapultExternalLoadBaseline;
  /**
   * Whole-day distance between args.date and today.date. Zero when the
   * exact-date row was found; positive when the fallback path picked a
   * previous training day. Used downstream by signals.ts to apply Hader
   * 2019 recovery decay to spike ratios so a Sunday match doesn't keep
   * looking like "today's spike" three days later.
   */
  daysSinceData: number;
  /** True when today is a fallback row (no exact-date match). */
  isStale: boolean;
} {
  const sorted = [...args.rows].sort((a, b) => a.date.localeCompare(b.date));
  const exactToday = sorted.find((row) => row.date === args.date) ?? null;
  // When today has no GPS data yet (morning check-in before training),
  // fall back to the most recent previous day that has data.
  // This way the quadrant shows "last session load" vs "today's readiness".
  const previousRows = sorted.filter((row) => row.date < args.date);
  const today = exactToday ?? (previousRows.length > 0 ? previousRows[previousRows.length - 1] : null);
  // When using a fallback day as "today", exclude it from baseline so it isn't double-counted
  const baselineRows = today && !exactToday
    ? previousRows.filter((row) => row.date !== today.date)
    : previousRows;
  const isStale = !!today && !exactToday;
  const daysSinceData = isStale && today ? daysBetween(today.date, args.date) : 0;
  const acute3dRows = baselineRows.slice(-3);
  const acute7dRows = baselineRows.slice(-7);
  const chronic28dRows = baselineRows.slice(-28);

  return {
    today,
    daysSinceData,
    isStale,
    baseline: {
      acute3d: {
        playerLoad: sum(acute3dRows.map((row) => row.playerLoad ?? 0)),
        hirDist: sum(acute3dRows.map((row) => getHirDistance(row))),
        decelLoad: sum(acute3dRows.map((row) => getDecelLoad(row))),
        accelLoad: sum(acute3dRows.map((row) => getAccelLoad(row))),
      },
      acute7d: {
        playerLoad: sum(acute7dRows.map((row) => row.playerLoad ?? 0)),
        hirDist: sum(acute7dRows.map((row) => getHirDistance(row))),
        decelLoad: sum(acute7dRows.map((row) => getDecelLoad(row))),
        accelLoad: sum(acute7dRows.map((row) => getAccelLoad(row))),
      },
      chronic28dAvg: {
        playerLoad: average(chronic28dRows.map((row) => row.playerLoad ?? 0)),
        hirDist: average(chronic28dRows.map((row) => getHirDistance(row))),
        decelLoad: average(chronic28dRows.map((row) => getDecelLoad(row))),
        accelLoad: average(chronic28dRows.map((row) => getAccelLoad(row))),
        maxVelocity: average(chronic28dRows.map((row) => row.maxVelocity ?? 0)),
        densityStress: average(chronic28dRows.map((row) => getDensityStress(row))),
        band6Distance: average(chronic28dRows.map((row) => getBand6Distance(row))),
        highDecelEfforts: average(chronic28dRows.map((row) => getHighDecelEfforts(row))),
        highAccelEfforts: average(chronic28dRows.map((row) => getHighAccelEfforts(row))),
        totalDistance: average(chronic28dRows.map((row) => getTotalDistance(row))),
        // FMP (Indoor Mode)
        fmpDynamicHighS: average(chronic28dRows.map((row) => row.fmpDynamicHighS ?? 0)),
        fmpDynamicMediumS: average(chronic28dRows.map((row) => row.fmpDynamicMediumS ?? 0)),
        fmpRunningHighS: average(chronic28dRows.map((row) => row.fmpRunningHighS ?? 0)),
        imaTotal: average(chronic28dRows.map((row) => row.imaTotal ?? 0)),
      },
      availability: {
        daysAvailable7d: acute7dRows.length,
        daysAvailable28d: chronic28dRows.length,
      },
    },
  };
}
