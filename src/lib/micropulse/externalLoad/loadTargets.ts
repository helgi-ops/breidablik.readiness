/**
 * Weekly Load Target computation (server-only).
 *
 * Given a team's `team_load_targets` config, produce a per-KPI weekly target
 * that the `CoachWeeklyLoadCard` UI can compare the current-week cumulative
 * totals against.
 *
 * Three modes:
 *
 *   1. baseline      — return null. The card falls back to its existing
 *                      historical rolling average (`typicalWeekTotal`).
 *
 *   2. coach_weekly  — hand-set values from `coach_weekly_targets` jsonb,
 *                      multiplied by `mesocycle_multiplier`. Missing KPIs
 *                      fall back to baseline for that KPI only.
 *
 *   3. match_demand  — compute the average match demand from the last N
 *                      matches (via week_plans.day_type='GAME' or
 *                      team_schedule_events.event_type='match', else fallback
 *                      to top-TD days), then sum across the template's
 *                      MD-day percentages to produce a weekly total per KPI,
 *                      then apply mesocycle multiplier.
 *
 * References:
 *   - Martin-Garcia et al. 2018 (Barcelona B) — MD-day demand distribution
 *   - Akenhead et al. 2016 — Training:match ratio framework
 *   - Stevens et al. 2017 — Per-KPI demand percentages differ
 */

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { WeeklyLoadMetricKey } from "./weeklyLoadTypes";
import { WEEKLY_LOAD_METRICS } from "./weeklyLoadTypes";

// ─── Types ──────────────────────────────────────────────────────────────────

export type LoadTargetMode = "baseline" | "match_demand" | "coach_weekly";

export type LoadTargetConfig = {
  team_id: string;
  mode: LoadTargetMode;
  corridor_pct: number;
  mesocycle_phase: "build" | "maintain" | "taper" | null;
  mesocycle_multiplier: number;
  coach_weekly_targets: Partial<Record<WeeklyLoadMetricKey, number>>;
  match_demand_lookback_days: number;
  match_day_detection_min_td: number;
  /** Minimum minutes played in a match for a player row to be included in
   *  match demand averaging (≈ "FULL" game filter, default 75 min). */
  match_demand_min_minutes: number;
  match_demand_template: Record<string, Partial<Record<WeeklyLoadMetricKey, number>>>;
  match_demand_overrides: Partial<Record<WeeklyLoadMetricKey, number>>;
  updated_at: string;
};

export type TargetComputation = {
  mode: LoadTargetMode;
  corridor_pct: number;
  mesocycle_phase: LoadTargetConfig["mesocycle_phase"];
  mesocycle_multiplier: number;
  /** Per-KPI weekly target value (null when unavailable — falls back to baseline). */
  target_week_total: Partial<Record<WeeklyLoadMetricKey, number | null>>;
  /** Per-KPI average match demand used as the anchor (match_demand mode only). */
  match_demand_avg?: Partial<Record<WeeklyLoadMetricKey, number>>;
  /** Number of matches found when computing match demand average. */
  matches_sampled?: number;
  /** Number of player-match rows that passed the min-minutes filter. */
  full_match_rows_used?: number;
  /** Number of player-match rows skipped because they did not play enough. */
  rows_skipped_partial?: number;
  /** Minimum minutes threshold used for the FULL filter. */
  min_minutes_used?: number;
  /** Weekly sum of template percentages per KPI — shows how the week adds up. */
  template_week_sum?: Partial<Record<WeeklyLoadMetricKey, number>>;
};

// ─── Defaults ───────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: Omit<LoadTargetConfig, "team_id" | "updated_at"> = {
  mode: "baseline",
  corridor_pct: 0.15,
  mesocycle_phase: null,
  mesocycle_multiplier: 1.0,
  coach_weekly_targets: {},
  match_demand_lookback_days: 120,
  match_day_detection_min_td: 8000,
  match_demand_min_minutes: 75,
  match_demand_template: {
    "MD-5": { totalDistance: 1.10, totalPlayerLoad: 1.10, velocityBand5: 0.80, velocityBand6: 0.50, accelB23: 1.00, decelB23: 1.00 },
    "MD-4": { totalDistance: 1.15, totalPlayerLoad: 1.15, velocityBand5: 1.00, velocityBand6: 0.70, accelB23: 1.10, decelB23: 1.10 },
    "MD-3": { totalDistance: 1.00, totalPlayerLoad: 1.00, velocityBand5: 0.80, velocityBand6: 0.50, accelB23: 0.90, decelB23: 0.90 },
    "MD-2": { totalDistance: 0.75, totalPlayerLoad: 0.80, velocityBand5: 0.50, velocityBand6: 0.35, accelB23: 0.60, decelB23: 0.60 },
    "MD-1": { totalDistance: 0.50, totalPlayerLoad: 0.55, velocityBand5: 0.30, velocityBand6: 0.20, accelB23: 0.40, decelB23: 0.40 },
    "MD+1": { totalDistance: 0.40, totalPlayerLoad: 0.40, velocityBand5: 0.15, velocityBand6: 0.05, accelB23: 0.30, decelB23: 0.30 },
    "MD":   { totalDistance: 1.00, totalPlayerLoad: 1.00, velocityBand5: 1.00, velocityBand6: 1.00, accelB23: 1.00, decelB23: 1.00 },
  },
  match_demand_overrides: {},
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function metricFromRow(row: Record<string, unknown>, key: WeeklyLoadMetricKey): number | null {
  const get = (k: string): number | null => {
    const v = row[k];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  };
  switch (key) {
    case "totalDistance":    return get("total_distance");
    case "totalPlayerLoad":  return get("total_player_load") ?? get("player_load");
    case "velocityBand5":    return get("velocity_band5_total_distance");
    case "velocityBand6":    return get("velocity_band6_total_distance");
    case "accelB23":         return get("accel_b2_3_tot_effs_gen2");
    case "decelB23":         return get("decel_b2_3_tot_effs_gen2");
  }
}

// ─── Load the team's config (with defaults) ────────────────────────────────

export async function getTeamLoadTargetConfig(teamId: string): Promise<LoadTargetConfig> {
  const sb = getSupabaseAdmin();
  const { data } = await sb
    .from("team_load_targets")
    .select("*")
    .eq("team_id", teamId)
    .maybeSingle();

  if (!data) {
    return {
      team_id: teamId,
      ...DEFAULT_CONFIG,
      updated_at: new Date().toISOString(),
    };
  }

  const row = data as Record<string, unknown>;
  return {
    team_id: teamId,
    mode: (row.mode as LoadTargetMode) ?? DEFAULT_CONFIG.mode,
    corridor_pct: Number(row.corridor_pct ?? DEFAULT_CONFIG.corridor_pct),
    mesocycle_phase: (row.mesocycle_phase as LoadTargetConfig["mesocycle_phase"]) ?? null,
    mesocycle_multiplier: Number(row.mesocycle_multiplier ?? 1.0),
    coach_weekly_targets: (row.coach_weekly_targets as LoadTargetConfig["coach_weekly_targets"]) ?? {},
    match_demand_lookback_days: Number(row.match_demand_lookback_days ?? DEFAULT_CONFIG.match_demand_lookback_days),
    match_day_detection_min_td: Number(row.match_day_detection_min_td ?? DEFAULT_CONFIG.match_day_detection_min_td),
    match_demand_min_minutes: Number(row.match_demand_min_minutes ?? DEFAULT_CONFIG.match_demand_min_minutes),
    match_demand_template:
      (row.match_demand_template as LoadTargetConfig["match_demand_template"]) ?? DEFAULT_CONFIG.match_demand_template,
    match_demand_overrides: (row.match_demand_overrides as LoadTargetConfig["match_demand_overrides"]) ?? {},
    updated_at: String(row.updated_at ?? new Date().toISOString()),
  };
}

// ─── Match-day discovery ───────────────────────────────────────────────────

async function findRecentMatchDates(args: {
  teamId: string;
  fromDate: string;
  toDate: string;
  minTdFallback: number;
}): Promise<string[]> {
  const { teamId, fromDate, toDate, minTdFallback } = args;
  const sb = getSupabaseAdmin();

  const dateSet = new Set<string>();

  // 1. team_schedule_events.event_type = 'match'
  try {
    const { data: events } = await sb
      .from("team_schedule_events")
      .select("event_date, event_type")
      .eq("team_id", teamId)
      .gte("event_date", fromDate)
      .lte("event_date", toDate)
      .ilike("event_type", "match");
    for (const r of (events ?? []) as Array<{ event_date: string }>) {
      if (r.event_date) dateSet.add(r.event_date);
    }
  } catch {
    /* table may not exist or be queryable — continue */
  }

  // 2. week_plans.day_type = 'GAME'
  try {
    const { data: plans } = await sb
      .from("week_plans")
      .select("plan_date, day_type")
      .eq("team_id", teamId)
      .gte("plan_date", fromDate)
      .lte("plan_date", toDate)
      .ilike("day_type", "game");
    for (const r of (plans ?? []) as Array<{ plan_date: string }>) {
      if (r.plan_date) dateSet.add(r.plan_date);
    }
  } catch {
    /* continue */
  }

  // 3. Fallback — days where squad-average total_distance exceeds a threshold
  //    (catches matches even if schedule metadata is missing).
  if (dateSet.size === 0) {
    const { data: loadRows } = await sb
      .from("player_external_load_daily")
      .select("date, total_distance")
      .eq("team_id", teamId)
      .gte("date", fromDate)
      .lte("date", toDate)
      .in("source", ["catapult", "manual"]);

    const perDay = new Map<string, number[]>();
    for (const row of (loadRows ?? []) as Array<{ date: string; total_distance: number | null }>) {
      if (!row.date || row.total_distance == null) continue;
      if (!perDay.has(row.date)) perDay.set(row.date, []);
      perDay.get(row.date)!.push(Number(row.total_distance));
    }
    for (const [date, vals] of perDay) {
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      if (avg >= minTdFallback) dateSet.add(date);
    }
  }

  return [...dateSet].sort();
}

// ─── Per-KPI match demand average ──────────────────────────────────────────

/**
 * Derive how many minutes a player row represents.
 *
 * Priority order:
 *   1. fmp_total_duration_s (seconds) → /60
 *   2. total_player_load ÷ player_load_per_minute
 *
 * Returns null if neither can be computed. Callers should treat null as
 * "cannot verify match minutes" and exclude the row when a FULL filter
 * is active (safer than assuming they played full).
 */
function deriveMinutes(row: Record<string, unknown>): number | null {
  const fmpSec = row.fmp_total_duration_s;
  if (typeof fmpSec === "number" && Number.isFinite(fmpSec) && fmpSec > 0) {
    return fmpSec / 60;
  }
  const tpl = row.total_player_load ?? row.player_load;
  const plPm = row.player_load_per_minute;
  if (
    typeof tpl === "number" && Number.isFinite(tpl) && tpl > 0 &&
    typeof plPm === "number" && Number.isFinite(plPm) && plPm > 0
  ) {
    return tpl / plPm;
  }
  return null;
}

type MatchDemandAverageResult = {
  avg: Partial<Record<WeeklyLoadMetricKey, number>>;
  fullMatchRowsUsed: number;
  rowsSkippedPartial: number;
};

async function computeMatchDemandAverage(args: {
  teamId: string;
  matchDates: string[];
  minMinutes: number;
}): Promise<MatchDemandAverageResult> {
  const { teamId, matchDates, minMinutes } = args;
  if (matchDates.length === 0) {
    return { avg: {}, fullMatchRowsUsed: 0, rowsSkippedPartial: 0 };
  }

  const sb = getSupabaseAdmin();
  const { data } = await sb
    .from("player_external_load_daily")
    .select(
      [
        "date",
        "total_distance",
        "total_player_load",
        "player_load",
        "velocity_band5_total_distance",
        "velocity_band6_total_distance",
        "accel_b2_3_tot_effs_gen2",
        "decel_b2_3_tot_effs_gen2",
        "fmp_total_duration_s",
        "player_load_per_minute",
      ].join(", ")
    )
    .eq("team_id", teamId)
    .in("date", matchDates)
    .in("source", ["catapult", "manual"]);

  // Apply the FULL filter row-by-row, then squad-average per match date,
  // then mean across dates.
  const byDate = new Map<string, Map<WeeklyLoadMetricKey, number[]>>();
  let fullMatchRowsUsed = 0;
  let rowsSkippedPartial = 0;

  for (const row of (data ?? []) as unknown as Array<Record<string, unknown>>) {
    const minutes = deriveMinutes(row);
    // Strict FULL filter: if we cannot verify duration OR duration is below
    // threshold, skip the row. The coach can lower the threshold (or set it
    // to 0) to disable the filter entirely.
    if (minMinutes > 0) {
      if (minutes == null || minutes < minMinutes) {
        rowsSkippedPartial += 1;
        continue;
      }
    }
    fullMatchRowsUsed += 1;

    const date = String(row.date ?? "");
    if (!byDate.has(date)) byDate.set(date, new Map());
    const bucket = byDate.get(date)!;
    for (const key of WEEKLY_LOAD_METRICS) {
      const v = metricFromRow(row, key);
      if (v != null) {
        if (!bucket.has(key)) bucket.set(key, []);
        bucket.get(key)!.push(v);
      }
    }
  }

  const perDateAvg: Array<Partial<Record<WeeklyLoadMetricKey, number>>> = [];
  for (const [, bucket] of byDate) {
    const avg: Partial<Record<WeeklyLoadMetricKey, number>> = {};
    for (const key of WEEKLY_LOAD_METRICS) {
      const arr = bucket.get(key);
      if (arr && arr.length) avg[key] = arr.reduce((a, b) => a + b, 0) / arr.length;
    }
    perDateAvg.push(avg);
  }

  const result: Partial<Record<WeeklyLoadMetricKey, number>> = {};
  for (const key of WEEKLY_LOAD_METRICS) {
    const vals = perDateAvg.map((a) => a[key]).filter((v): v is number => v != null);
    if (vals.length) result[key] = vals.reduce((a, b) => a + b, 0) / vals.length;
  }
  return { avg: result, fullMatchRowsUsed, rowsSkippedPartial };
}

// ─── Main: compute target week total ───────────────────────────────────────

export async function computeWeeklyTarget(args: {
  teamId: string;
  referenceDate: string; // typically today, used to bound match-demand lookback
}): Promise<TargetComputation> {
  const { teamId, referenceDate } = args;
  const cfg = await getTeamLoadTargetConfig(teamId);

  const meso = Number(cfg.mesocycle_multiplier || 1.0);

  // ─── baseline ────────────────────────────────────────────────────────────
  if (cfg.mode === "baseline") {
    return {
      mode: "baseline",
      corridor_pct: cfg.corridor_pct,
      mesocycle_phase: cfg.mesocycle_phase,
      mesocycle_multiplier: meso,
      target_week_total: {},
    };
  }

  // ─── coach_weekly ────────────────────────────────────────────────────────
  if (cfg.mode === "coach_weekly") {
    const target: Partial<Record<WeeklyLoadMetricKey, number | null>> = {};
    for (const key of WEEKLY_LOAD_METRICS) {
      const v = cfg.coach_weekly_targets[key];
      target[key] = v != null && Number.isFinite(Number(v)) ? Number(v) * meso : null;
    }
    return {
      mode: "coach_weekly",
      corridor_pct: cfg.corridor_pct,
      mesocycle_phase: cfg.mesocycle_phase,
      mesocycle_multiplier: meso,
      target_week_total: target,
    };
  }

  // ─── match_demand ────────────────────────────────────────────────────────
  // 1. Compute template weekly sum per KPI (sum of percentages across all
  //    MD-days in the template). This is the "number of match-equivalents"
  //    expected in the week, broken down per metric.
  const templateWeekSum: Partial<Record<WeeklyLoadMetricKey, number>> = {};
  for (const dayKey of Object.keys(cfg.match_demand_template)) {
    const dayRow = cfg.match_demand_template[dayKey] ?? {};
    for (const key of WEEKLY_LOAD_METRICS) {
      const pct = Number(dayRow[key] ?? 0);
      if (Number.isFinite(pct)) {
        templateWeekSum[key] = (templateWeekSum[key] ?? 0) + pct;
      }
    }
  }

  // 2. Average match demand per KPI — either coach override, or auto-computed
  //    from recent matches.
  const from = new Date(`${referenceDate}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - cfg.match_demand_lookback_days);
  const fromDate = toDateStr(from);

  const matchDates = await findRecentMatchDates({
    teamId,
    fromDate,
    toDate: referenceDate,
    minTdFallback: cfg.match_day_detection_min_td,
  });

  const matchAvgResult = await computeMatchDemandAverage({
    teamId,
    matchDates,
    minMinutes: cfg.match_demand_min_minutes,
  });
  const autoMatchAvg = matchAvgResult.avg;

  const matchAvg: Partial<Record<WeeklyLoadMetricKey, number>> = {};
  for (const key of WEEKLY_LOAD_METRICS) {
    const override = cfg.match_demand_overrides[key];
    if (override != null && Number.isFinite(Number(override))) {
      matchAvg[key] = Number(override);
    } else if (autoMatchAvg[key] != null) {
      matchAvg[key] = autoMatchAvg[key];
    }
  }

  // 3. target = match_avg × template_week_sum × meso
  const target: Partial<Record<WeeklyLoadMetricKey, number | null>> = {};
  for (const key of WEEKLY_LOAD_METRICS) {
    const avg = matchAvg[key];
    const sum = templateWeekSum[key];
    if (avg != null && sum != null) {
      target[key] = avg * sum * meso;
    } else {
      target[key] = null;
    }
  }

  return {
    mode: "match_demand",
    corridor_pct: cfg.corridor_pct,
    mesocycle_phase: cfg.mesocycle_phase,
    mesocycle_multiplier: meso,
    target_week_total: target,
    match_demand_avg: matchAvg,
    matches_sampled: matchDates.length,
    full_match_rows_used: matchAvgResult.fullMatchRowsUsed,
    rows_skipped_partial: matchAvgResult.rowsSkippedPartial,
    min_minutes_used: cfg.match_demand_min_minutes,
    template_week_sum: templateWeekSum,
  };
}
