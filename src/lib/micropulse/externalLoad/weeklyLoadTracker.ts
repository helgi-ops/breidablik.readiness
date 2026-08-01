/**
 * Cumulative Weekly Load Tracker (server-only)
 *
 * Computes how the current week's GPS load is accumulating day by day,
 * compared to the historical average for the same type of week.
 *
 * The coach sees: "We're on MD-2 and have reached 62% of our typical weekly load"
 * helping them calibrate remaining sessions to hit the right weekly total.
 *
 * Indoor support: when `team_settings.indoor_mode = true`, the tracker
 * switches from the outdoor GPS KPI set to the indoor FMP/IMA KPI set
 * (see `weeklyLoadTypes.ts`).
 */

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  computeWeeklyTarget,
  findTeamMatchDates,
  getTeamIndoorMode,
  getTeamLoadTargetConfig,
} from "./loadTargets";

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

import { getActiveWeeklyLoadMetrics } from "./weeklyLoadTypes";
import { EXCLUDE_PREV_CLUB_OR } from "@/lib/micropulse/load/previousClub";
import { resolveTeamSport } from "@/lib/micropulse/weekSetup/resolveSport";

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
  fmp_dynamic_high_s: number | null;
  fmp_dynamic_medium_s: number | null;
  fmp_running_high_s: number | null;
  ima_total: number | null;
  ima_accel: number | null;
  ima_decel: number | null;
  // CoD directional breakdown — the aggregate ima_cod column is NULL on our
  // tiers, so total CoD is the sum of these six directional/intensity buckets.
  ima_cod_left_high: number | null;
  ima_cod_left_medium: number | null;
  ima_cod_left_low: number | null;
  ima_cod_right_high: number | null;
  ima_cod_right_medium: number | null;
  ima_cod_right_low: number | null;
  // High-cadence Free-Running stride bands (fast / sprint cadence)
  ima_fr_band6_stride_count: number | null;
  ima_fr_band7_stride_count: number | null;
  ima_fr_band8_stride_count: number | null;
};

// Total CoD = sum of the six directional buckets. Null only when all six are
// null (so a genuine no-CoD row stays null rather than a misleading 0).
function sumCod(row: RawRow): number | null {
  const parts = [
    row.ima_cod_left_high, row.ima_cod_left_medium, row.ima_cod_left_low,
    row.ima_cod_right_high, row.ima_cod_right_medium, row.ima_cod_right_low,
  ];
  if (parts.every((v) => v == null)) return null;
  return parts.reduce((s: number, v) => s + (v ?? 0), 0);
}

function extractMetric(row: RawRow, key: WeeklyLoadMetricKey): number | null {
  switch (key) {
    // Outdoor (GPS)
    case "totalDistance":     return row.total_distance;
    case "totalPlayerLoad":   return row.total_player_load ?? row.player_load;
    case "velocityBand5":     return row.velocity_band5_total_distance;
    case "velocityBand6":     return row.velocity_band6_total_distance;
    case "accelB23":          return row.accel_b2_3_tot_effs_gen2;
    case "decelB23":          return row.decel_b2_3_tot_effs_gen2;
    // Indoor (FMP + IMA)
    case "fmpDynamicHigh":    return row.fmp_dynamic_high_s;
    case "fmpDynamicMedium":  return row.fmp_dynamic_medium_s;
    case "fmpRunningHigh":    return row.fmp_running_high_s;
    case "imaTotal":          return row.ima_total;
    // IMA breakdown (driver)
    case "imaAccel":          return row.ima_accel;
    case "imaDecel":          return row.ima_decel;
    case "imaCod":            return sumCod(row);
    case "imaStrideBand6":    return row.ima_fr_band6_stride_count;
    case "imaStrideBand7":    return row.ima_fr_band7_stride_count;
    case "imaStrideBand8":    return row.ima_fr_band8_stride_count;
  }
}

// ─── Main Computation ───────────────────────────────────────────────────────

// Always select union of outdoor + indoor columns so that a team switching
// modes mid-week still gets consistent aggregation without a re-query.
const SELECT_COLS = [
  "player_id", "date",
  // Outdoor
  "total_distance",
  "total_player_load", "player_load",
  "velocity_band5_total_distance", "velocity_band6_total_distance",
  "accel_b2_3_tot_effs_gen2", "decel_b2_3_tot_effs_gen2",
  // Indoor (FMP + IMA)
  "fmp_dynamic_high_s", "fmp_dynamic_medium_s", "fmp_running_high_s",
  "ima_total", "ima_accel", "ima_decel",
  "ima_cod_left_high", "ima_cod_left_medium", "ima_cod_left_low",
  "ima_cod_right_high", "ima_cod_right_medium", "ima_cod_right_low",
  "ima_fr_band6_stride_count", "ima_fr_band7_stride_count", "ima_fr_band8_stride_count",
].join(", ");

export async function computeWeeklyLoad(args: {
  teamId: string;
  /** Reference date (defaults to today) */
  date?: string;
  /** How many historical weeks to average (default 8) */
  historicalWeeks?: number;
  /** Optional: compute for a single player instead of team average */
  playerId?: string;
  /** Override auto-detected indoor mode. */
  indoor?: boolean;
  /**
   * Explicit KPI list override. When provided (e.g. the IMA driver group), it
   * replaces the indoor/outdoor auto-selection so a caller can request a
   * specific metric set without changing the team's mode. All downstream loops
   * read `activeMetrics`, so this is the only wiring needed.
   */
  metrics?: readonly WeeklyLoadMetricKey[];
}): Promise<WeeklyLoadResult> {
  const { teamId, historicalWeeks = 8, playerId } = args;
  const sb = getSupabaseAdmin();
  const today = args.date ?? toDateStr(new Date());

  // Resolve indoor mode + sport up front — both drive the active KPI list.
  // Basketball is indoor but has no FMP; it uses the Player Load + IMA set.
  const indoor = args.indoor ?? (await getTeamIndoorMode(teamId));
  const isBasketball = (await resolveTeamSport(sb, teamId)) === "basketball";
  const activeMetrics = args.metrics ?? getActiveWeeklyLoadMetrics(indoor, isBasketball);

  // Read team config once to know whether the baseline rollup should
  // exclude match days (recommended for indoor teams).
  const cfg = await getTeamLoadTargetConfig(teamId);
  const excludeMatchDaysFromBaseline = cfg.baseline_exclude_match_days === true;

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
  // Team branch rolls players together by date → exclude pre-transfer rows. The
  // single-player branch keeps them (his own weekly view includes his history).
  if (playerId) currentQuery = currentQuery.eq("player_id", playerId);
  else currentQuery = currentQuery.or(EXCLUDE_PREV_CLUB_OR);
  const { data: currentRows } = await currentQuery;

  // 3. Build per-day averages for current week (team avg or single player)
  const dayMap = new Map<string, Map<WeeklyLoadMetricKey, number[]>>();
  for (const row of (currentRows ?? []) as unknown as RawRow[]) {
    if (!dayMap.has(row.date)) {
      dayMap.set(row.date, new Map());
    }
    const metrics = dayMap.get(row.date)!;
    for (const key of activeMetrics) {
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
    const metrics: Partial<Record<WeeklyLoadMetricKey, number | null>> = {};
    for (const key of activeMetrics) {
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
      metrics,
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

  // Team-wide (no playerId) over ~8 weeks × dual source is > 1000 rows, so page
  // past PostgREST's 1000-row cap — otherwise the "typical week" baseline is
  // built from a truncated (~half) sample and every week-vs-typical read is off.
  const buildHist = (from: number) => {
    let q = sb
      .from("player_external_load_daily")
      .select(SELECT_COLS)
      .eq("team_id", teamId)
      .gte("date", histStart)
      .lte("date", histEnd)
      .in("source", ["catapult", "manual"]);
    if (playerId) q = q.eq("player_id", playerId);
    else q = q.or(EXCLUDE_PREV_CLUB_OR); // team weekly baseline — exclude pre-transfer rows
    return q.order("date", { ascending: true }).range(from, from + 999);
  };
  const histRows: RawRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await buildHist(from);
    if (!data || data.length === 0) break;
    histRows.push(...(data as unknown as RawRow[]));
    if (data.length < 1000) break;
  }

  // Optionally discover match dates within the historical window so we can
  // exclude them from the baseline rollup. This yields a cleaner "typical
  // training week" baseline — especially important for indoor teams where a
  // 90-min match can inflate weekly totals by 15-25%.
  let excludedMatchDates: Set<string> = new Set();
  if (excludeMatchDaysFromBaseline) {
    try {
      const dates = await findTeamMatchDates({
        teamId,
        fromDate: histStart,
        toDate: histEnd,
        indoor,
      });
      excludedMatchDates = new Set(dates);
    } catch {
      excludedMatchDates = new Set();
    }
  }

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

  // First, build per-day team averages for historical data.
  // Skip rows whose date is in the excluded match-date set (when the flag
  // is on) so the baseline reflects training-only load.
  const histDayMap = new Map<string, Map<WeeklyLoadMetricKey, number[]>>();
  let excludedHistRowCount = 0;
  for (const row of (histRows ?? []) as unknown as RawRow[]) {
    if (excludedMatchDates.has(row.date)) {
      excludedHistRowCount += 1;
      continue;
    }
    if (!histDayMap.has(row.date)) histDayMap.set(row.date, new Map());
    const metrics = histDayMap.get(row.date)!;
    for (const key of activeMetrics) {
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
    for (const key of activeMetrics) {
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

  const typicalWeekTotal: Partial<Record<WeeklyLoadMetricKey, number>> = {};
  for (const key of activeMetrics) {
    const weekValues = validWeeks
      .map(([, m]) => m.get(key) ?? 0)
      .filter((v) => v > 0);
    typicalWeekTotal[key] = weekValues.length > 0
      ? weekValues.reduce((a, b) => a + b, 0) / weekValues.length
      : 0;
  }

  // 7. Compute current week cumulative totals
  const currentCumulative: Partial<Record<WeeklyLoadMetricKey, number>> = {};
  for (const key of activeMetrics) {
    currentCumulative[key] = days.reduce((sum, d) => sum + (d.metrics[key] ?? 0), 0);
  }

  // 8. Compute target from team_load_targets (baseline / match_demand / coach_weekly)
  let targetComp: Awaited<ReturnType<typeof computeWeeklyTarget>> | null = null;
  try {
    targetComp = await computeWeeklyTarget({ teamId, referenceDate: today, indoor });
  } catch {
    targetComp = null;
  }

  // 9. Build metric summaries
  const metricSummaries = activeMetrics.map((key) => {
    const current = currentCumulative[key] ?? 0;
    const typical = typicalWeekTotal[key] ?? 0;
    const pctOfTypical = typical > 0 ? (current / typical) * 100 : null;
    // Expected % at this point in the week (linear assumption)
    const expectedPct = (daysElapsed / totalWeekDays) * 100;
    // Projected full week (linear extrapolation from days with data)
    const daysWithLoad = days.filter((d) => d.metrics[key] != null && (d.metrics[key] as number) > 0).length;
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
    indoor,
    activeMetrics,
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
          indoor,
          baselineExcludesMatchDays: excludeMatchDaysFromBaseline,
          baselineMatchDatesExcluded: excludedMatchDates.size,
          baselineRowsExcluded: excludedHistRowCount,
        }
      : {
          mode: "baseline" as const,
          corridorPct: 0.15,
          mesocyclePhase: null,
          mesocycleMultiplier: 1.0,
          indoor,
          baselineExcludesMatchDays: excludeMatchDaysFromBaseline,
          baselineMatchDatesExcluded: excludedMatchDates.size,
          baselineRowsExcluded: excludedHistRowCount,
        },
  };
}
