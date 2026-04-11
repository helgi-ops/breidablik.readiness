/**
 * Cumulative Weekly Load Tracker (server-only)
 *
 * Computes how the current week's GPS load is accumulating day by day,
 * compared to the historical average for the same type of week.
 *
 * The coach sees: "We're on MD-2 and have reached 62% of our typical weekly load"
 * helping them calibrate remaining sessions to hit the right weekly total.
 */

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { computeWeeklyTarget } from "./loadTargets";

// Re-export types
export type {
  WeeklyLoadResult,
  WeeklyLoadDay,
  WeeklyLoadMetricSummary,
} from "./weeklyLoadTypes";

import type {
  WeeklyLoadResult,
  WeeklyLoadDay,
  WeeklyLoadMetricKey,
} from "./weeklyLoadTypes";

import { WEEKLY_LOAD_METRICS } from "./weeklyLoadTypes";

// ─── Helpers ────────────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Get Monday of the week containing a given date */
function getWeekMonday(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const diff = day === 0 ? -6 : 1 - day; // Monday = 1
  d.setUTCDate(d.getUTCDate() + diff);
  return toDateStr(d);
}

/** Generate dates from start to end inclusive */
function dateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const d = new Date(start);
  const endD = new Date(end);
  while (d <= endD) {
    dates.push(toDateStr(d));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return dates;
}

type RawRow = {
  player_id: string;
  date: string;
  total_distance: number | null;
  total_player_load: number | null;
  player_load: number | null;
  velocity_band5_total_distance: number | null;
  velocity_band6_total_distance: number | null;
  accel_b2_3_tot_effs_gen2: number | null;
  decel_b2_3_tot_effs_gen2: number | null;
};

function extractMetric(row: RawRow, key: WeeklyLoadMetricKey): number | null {
  switch (key) {
    case "totalDistance": return row.total_distance;
    case "totalPlayerLoad": return row.total_player_load ?? row.player_load;
    case "velocityBand5": return row.velocity_band5_total_distance;
    case "velocityBand6": return row.velocity_band6_total_distance;
    case "accelB23": return row.accel_b2_3_tot_effs_gen2;
    case "decelB23": return row.decel_b2_3_tot_effs_gen2;
  }
}

// ─── Main Computation ───────────────────────────────────────────────────────

const SELECT_COLS = [
  "player_id", "date",
  "total_distance",
  "total_player_load", "player_load",
  "velocity_band5_total_distance", "velocity_band6_total_distance",
  "accel_b2_3_tot_effs_gen2", "decel_b2_3_tot_effs_gen2",
].join(", ");

export async function computeWeeklyLoad(args: {
  teamId: string;
  /** Reference date (defaults to today) */
  date?: string;
  /** How many historical weeks to average (default 8) */
  historicalWeeks?: number;
  /** Optional: compute for a single player instead of team average */
  playerId?: string;
}): Promise<WeeklyLoadResult> {
  const { teamId, historicalWeeks = 8, playerId } = args;
  const sb = getSupabaseAdmin();
  const today = args.date ?? toDateStr(new Date());

  // 1. Determine current week (Monday–Sunday)
  const weekMonday = getWeekMonday(today);
  const weekSunday = (() => {
    const d = new Date(weekMonday);
    d.setUTCDate(d.getUTCDate() + 6);
    return toDateStr(d);
  })();

  // Days elapsed so far in the week (including today)
  const currentWeekDates = dateRange(weekMonday, today);
  const totalWeekDays = 7;
  const daysElapsed = currentWeekDates.length;

  // 2. Fetch current week's data
  let currentQuery = sb
    .from("player_external_load_daily")
    .select(SELECT_COLS)
    .eq("team_id", teamId)
    .gte("date", weekMonday)
    .lte("date", today)
    .in("source", ["catapult", "manual"]);
  if (playerId) currentQuery = currentQuery.eq("player_id", playerId);
  const { data: currentRows } = await currentQuery;

  // 3. Build per-day averages for current week (team avg or single player)
  const dayMap = new Map<string, Map<WeeklyLoadMetricKey, number[]>>();
  for (const row of (currentRows ?? []) as unknown as RawRow[]) {
    if (!dayMap.has(row.date)) {
      dayMap.set(row.date, new Map());
    }
    const metrics = dayMap.get(row.date)!;
    for (const key of WEEKLY_LOAD_METRICS) {
      const v = extractMetric(row, key);
      if (v != null) {
        if (!metrics.has(key)) metrics.set(key, []);
        metrics.get(key)!.push(v);
      }
    }
  }

  // Current week days with team averages
  const days: WeeklyLoadDay[] = currentWeekDates.map((date) => {
    const dayMetrics = dayMap.get(date);
    const metrics: Record<string, number | null> = {};
    for (const key of WEEKLY_LOAD_METRICS) {
      const vals = dayMetrics?.get(key);
      metrics[key] = vals && vals.length > 0
        ? vals.reduce((a, b) => a + b, 0) / vals.length
        : null;
    }
    const dayOfWeek = new Date(date).getUTCDay(); // 0=Sun
    const dayLabel = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dayOfWeek];
    return {
      date,
      dayLabel,
      dayOfWeek,
      metrics: metrics as Record<WeeklyLoadMetricKey, number | null>,
      hasData: dayMetrics != null && dayMetrics.size > 0,
    };
  });

  // 4. Fetch historical weeks' data for baseline
  const histStart = (() => {
    const d = new Date(weekMonday);
    d.setUTCDate(d.getUTCDate() - historicalWeeks * 7);
    return toDateStr(d);
  })();
  // Exclude current week
  const histEnd = (() => {
    const d = new Date(weekMonday);
    d.setUTCDate(d.getUTCDate() - 1);
    return toDateStr(d);
  })();

  let histQuery = sb
    .from("player_external_load_daily")
    .select(SELECT_COLS)
    .eq("team_id", teamId)
    .gte("date", histStart)
    .lte("date", histEnd)
    .in("source", ["catapult", "manual"]);
  if (playerId) histQuery = histQuery.eq("player_id", playerId);
  const { data: histRows } = await histQuery;

  // 5. Group historical data by week → compute full-week team averages per day
  // For each historical week: sum all daily team averages = weekly total
  const histWeekTotals = new Map<string, Map<WeeklyLoadMetricKey, number>>();
  const histWeekDayCounts = new Map<string, number>(); // how many days had data

  for (const row of (histRows ?? []) as unknown as RawRow[]) {
    const wk = getWeekMonday(row.date);
    if (!histWeekTotals.has(wk)) {
      histWeekTotals.set(wk, new Map());
      histWeekDayCounts.set(wk, 0);
    }
  }

  // First, build per-day team averages for historical data
  const histDayMap = new Map<string, Map<WeeklyLoadMetricKey, number[]>>();
  for (const row of (histRows ?? []) as unknown as RawRow[]) {
    if (!histDayMap.has(row.date)) histDayMap.set(row.date, new Map());
    const metrics = histDayMap.get(row.date)!;
    for (const key of WEEKLY_LOAD_METRICS) {
      const v = extractMetric(row, key);
      if (v != null) {
        if (!metrics.has(key)) metrics.set(key, []);
        metrics.get(key)!.push(v);
      }
    }
  }

  // Now sum daily team averages into weekly totals
  const daysWithDataPerWeek = new Map<string, Set<string>>();
  for (const [date, metrics] of histDayMap) {
    const wk = getWeekMonday(date);
    if (!histWeekTotals.has(wk)) histWeekTotals.set(wk, new Map());
    if (!daysWithDataPerWeek.has(wk)) daysWithDataPerWeek.set(wk, new Set());
    daysWithDataPerWeek.get(wk)!.add(date);

    const weekMetrics = histWeekTotals.get(wk)!;
    for (const key of WEEKLY_LOAD_METRICS) {
      const vals = metrics.get(key);
      if (vals && vals.length > 0) {
        const teamAvg = vals.reduce((a, b) => a + b, 0) / vals.length;
        weekMetrics.set(key, (weekMetrics.get(key) ?? 0) + teamAvg);
      }
    }
  }

  // 6. Average across historical weeks to get "typical week total"
  const validWeeks = [...histWeekTotals.entries()].filter(
    ([wk]) => (daysWithDataPerWeek.get(wk)?.size ?? 0) >= 3 // need at least 3 days of data
  );

  const typicalWeekTotal: Record<WeeklyLoadMetricKey, number> = {} as any;
  for (const key of WEEKLY_LOAD_METRICS) {
    const weekValues = validWeeks.map(([, m]) => m.get(key) ?? 0).filter((v) => v > 0);
    typicalWeekTotal[key] = weekValues.length > 0
      ? weekValues.reduce((a, b) => a + b, 0) / weekValues.length
      : 0;
  }

  // 7. Compute current week cumulative totals
  const currentCumulative: Record<WeeklyLoadMetricKey, number> = {} as any;
  for (const key of WEEKLY_LOAD_METRICS) {
    currentCumulative[key] = days.reduce((sum, d) => sum + (d.metrics[key] ?? 0), 0);
  }

  // 8. Compute target from team_load_targets (baseline / match_demand / coach_weekly)
  let targetComp: Awaited<ReturnType<typeof computeWeeklyTarget>> | null = null;
  try {
    targetComp = await computeWeeklyTarget({ teamId, referenceDate: today });
  } catch {
    targetComp = null;
  }

  // 9. Build metric summaries
  const metricSummaries = WEEKLY_LOAD_METRICS.map((key) => {
    const current = currentCumulative[key];
    const typical = typicalWeekTotal[key];
    const pctOfTypical = typical > 0 ? (current / typical) * 100 : null;
    // Expected % at this point in the week (linear assumption)
    const expectedPct = (daysElapsed / totalWeekDays) * 100;
    // Projected full week (linear extrapolation from days with data)
    const daysWithLoad = days.filter((d) => d.metrics[key] != null && d.metrics[key]! > 0).length;
    const projected = daysWithLoad > 0 ? (current / daysWithLoad) * totalWeekDays : null;

    // Target (non-baseline modes). Falls back to null if unavailable.
    const rawTarget = targetComp?.target_week_total?.[key];
    const targetWeekTotal = rawTarget != null && Number.isFinite(Number(rawTarget)) ? Number(rawTarget) : null;
    const pctOfTarget = targetWeekTotal != null && targetWeekTotal > 0
      ? (current / targetWeekTotal) * 100
      : null;

    return {
      metric: key,
      currentTotal: current,
      typicalWeekTotal: typical,
      pctOfTypical,
      expectedPctAtThisPoint: expectedPct,
      projectedWeekTotal: projected,
      daysWithData: daysWithLoad,
      targetWeekTotal,
      pctOfTarget,
    };
  });

  return {
    teamId,
    weekMonday,
    weekSunday,
    today,
    daysElapsed,
    totalWeekDays,
    days,
    metrics: metricSummaries,
    historicalWeeksUsed: validWeeks.length,
    target: targetComp
      ? {
          mode: targetComp.mode,
          corridorPct: targetComp.corridor_pct,
          mesocyclePhase: targetComp.mesocycle_phase,
          mesocycleMultiplier: targetComp.mesocycle_multiplier,
          matchesSampled: targetComp.matches_sampled,
          matchDemandAvg: targetComp.match_demand_avg,
          templateWeekSum: targetComp.template_week_sum,
          fullMatchRowsUsed: targetComp.full_match_rows_used,
          rowsSkippedPartial: targetComp.rows_skipped_partial,
          minMinutesUsed: targetComp.min_minutes_used,
        }
      : {
          mode: "baseline" as const,
          corridorPct: 0.15,
          mesocyclePhase: null,
          mesocycleMultiplier: 1.0,
        },
  };
}
