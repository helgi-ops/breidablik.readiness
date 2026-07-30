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
import { getActiveWeeklyLoadMetrics } from "./weeklyLoadTypes";
import { EXCLUDE_PREV_CLUB_OR } from "@/lib/micropulse/load/previousClub";
import { fetchAllPages } from "@/lib/supabasePaginate";

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
  /** Squad-average Player Load threshold used as a match-detection fallback
   *  when the team is in indoor mode (GPS distance is ~0 indoors, so TD
   *  cannot be used). Default 550 — distinguishes a competitive 90-min
   *  match (~550-850 PL) from a typical training session (~250-500 PL). */
  match_day_detection_min_player_load: number;
  /** Minimum minutes played in a match for a player row to be included in
   *  match demand averaging (≈ "FULL" game filter, default 75 min). */
  match_demand_min_minutes: number;
  match_demand_template: Record<string, Partial<Record<WeeklyLoadMetricKey, number>>>;
  match_demand_overrides: Partial<Record<WeeklyLoadMetricKey, number>>;
  /** When true, the baseline "typical week" rolling average excludes detected
   *  match days so the baseline represents a typical *training* week only.
   *  Recommended for indoor teams where a 90-min match significantly skews
   *  weekly totals. Default false preserves historical behavior. */
  baseline_exclude_match_days: boolean;
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
  /** Indoor mode flag — selects FMP/IMA KPI set. */
  indoor?: boolean;
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
  match_day_detection_min_player_load: 550,
  match_demand_min_minutes: 75,
  match_demand_template: {
    // Indoor FMP/IMA keys are merged into the same jsonb template — the
    // compute step iterates over whichever KPI subset is active for the team.
    "MD-5": {
      totalDistance: 1.10, totalPlayerLoad: 1.10, velocityBand5: 0.80, velocityBand6: 0.50, accelB23: 1.00, decelB23: 1.00,
      fmpDynamicHigh: 0.70, fmpDynamicMedium: 0.85, fmpRunningHigh: 0.75, imaTotal: 0.90,
    },
    "MD-4": {
      totalDistance: 1.15, totalPlayerLoad: 1.15, velocityBand5: 1.00, velocityBand6: 0.70, accelB23: 1.10, decelB23: 1.10,
      fmpDynamicHigh: 1.00, fmpDynamicMedium: 1.05, fmpRunningHigh: 1.05, imaTotal: 1.10,
    },
    "MD-3": {
      totalDistance: 1.00, totalPlayerLoad: 1.00, velocityBand5: 0.80, velocityBand6: 0.50, accelB23: 0.90, decelB23: 0.90,
      fmpDynamicHigh: 0.80, fmpDynamicMedium: 0.90, fmpRunningHigh: 0.90, imaTotal: 0.90,
    },
    "MD-2": {
      totalDistance: 0.75, totalPlayerLoad: 0.80, velocityBand5: 0.50, velocityBand6: 0.35, accelB23: 0.60, decelB23: 0.60,
      fmpDynamicHigh: 0.50, fmpDynamicMedium: 0.65, fmpRunningHigh: 0.55, imaTotal: 0.60,
    },
    "MD-1": {
      totalDistance: 0.50, totalPlayerLoad: 0.55, velocityBand5: 0.30, velocityBand6: 0.20, accelB23: 0.40, decelB23: 0.40,
      fmpDynamicHigh: 0.30, fmpDynamicMedium: 0.40, fmpRunningHigh: 0.35, imaTotal: 0.40,
    },
    "MD+1": {
      totalDistance: 0.40, totalPlayerLoad: 0.40, velocityBand5: 0.15, velocityBand6: 0.05, accelB23: 0.30, decelB23: 0.30,
      fmpDynamicHigh: 0.15, fmpDynamicMedium: 0.30, fmpRunningHigh: 0.20, imaTotal: 0.30,
    },
    "MD": {
      totalDistance: 1.00, totalPlayerLoad: 1.00, velocityBand5: 1.00, velocityBand6: 1.00, accelB23: 1.00, decelB23: 1.00,
      fmpDynamicHigh: 1.00, fmpDynamicMedium: 1.00, fmpRunningHigh: 1.00, imaTotal: 1.00,
    },
  },
  match_demand_overrides: {},
  baseline_exclude_match_days: false,
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
    // Outdoor (GPS)
    case "totalDistance":     return get("total_distance");
    case "totalPlayerLoad":   return get("total_player_load") ?? get("player_load");
    case "velocityBand5":     return get("velocity_band5_total_distance");
    case "velocityBand6":     return get("velocity_band6_total_distance");
    case "accelB23":          return get("accel_b2_3_tot_effs_gen2");
    case "decelB23":          return get("decel_b2_3_tot_effs_gen2");
    // Indoor (FMP / IMA)
    case "fmpDynamicHigh":    return get("fmp_dynamic_high_s");
    case "fmpDynamicMedium":  return get("fmp_dynamic_medium_s");
    case "fmpRunningHigh":    return get("fmp_running_high_s");
    case "imaTotal":          return get("ima_total");
    // IMA breakdown (driver)
    case "imaAccel":          return get("ima_accel");
    case "imaDecel":          return get("ima_decel");
    case "imaCod": {
      // Total CoD = sum of the six directional buckets (the aggregate ima_cod
      // column is NULL on our tiers). Null only when all six are null.
      const parts = [
        get("ima_cod_left_high"), get("ima_cod_left_medium"), get("ima_cod_left_low"),
        get("ima_cod_right_high"), get("ima_cod_right_medium"), get("ima_cod_right_low"),
      ];
      return parts.every((v) => v == null) ? null : parts.reduce((s: number, v) => s + (v ?? 0), 0);
    }
    case "imaStrideBand6":    return get("ima_fr_band6_stride_count");
    case "imaStrideBand7":    return get("ima_fr_band7_stride_count");
    case "imaStrideBand8":    return get("ima_fr_band8_stride_count");
  }
}

/** Columns we need to select from `player_external_load_daily` for match
 *  demand averaging — union of outdoor + indoor columns. */
const MATCH_DEMAND_SELECT_COLS = [
  "date",
  // Outdoor
  "total_distance",
  "total_player_load",
  "player_load",
  "velocity_band5_total_distance",
  "velocity_band6_total_distance",
  "accel_b2_3_tot_effs_gen2",
  "decel_b2_3_tot_effs_gen2",
  // Indoor (FMP + IMA)
  "fmp_dynamic_high_s",
  "fmp_dynamic_medium_s",
  "fmp_running_high_s",
  "ima_total", "ima_accel", "ima_decel",
  "ima_cod_left_high", "ima_cod_left_medium", "ima_cod_left_low",
  "ima_cod_right_high", "ima_cod_right_medium", "ima_cod_right_low",
  "ima_fr_band6_stride_count", "ima_fr_band7_stride_count", "ima_fr_band8_stride_count",
  // FULL-game filter duration sources
  "fmp_total_duration_s",
  "player_load_per_minute",
].join(", ");

// ─── Load the team's config (with defaults) ────────────────────────────────

/**
 * Merge saved template with defaults per-day-per-KPI so existing teams that
 * were seeded with outdoor-only keys still get indoor defaults filled in
 * without requiring a schema change on every upgrade.
 */
function mergeTemplateWithDefaults(
  saved: LoadTargetConfig["match_demand_template"] | null | undefined,
): LoadTargetConfig["match_demand_template"] {
  if (!saved || typeof saved !== "object") return DEFAULT_CONFIG.match_demand_template;
  const merged: LoadTargetConfig["match_demand_template"] = {};
  const allDays = new Set<string>([
    ...Object.keys(DEFAULT_CONFIG.match_demand_template),
    ...Object.keys(saved),
  ]);
  for (const day of allDays) {
    const defRow = DEFAULT_CONFIG.match_demand_template[day] ?? {};
    const savedRow = (saved as Record<string, Partial<Record<WeeklyLoadMetricKey, number>>>)[day] ?? {};
    merged[day] = { ...defRow, ...savedRow };
  }
  return merged;
}

/** Fetch `team_settings.indoor_mode` (with sport_type=basketball override). */
export async function getTeamIndoorMode(teamId: string): Promise<boolean> {
  const sb = getSupabaseAdmin();
  try {
    const { data } = await sb
      .from("team_settings")
      .select("indoor_mode, sport_type")
      .eq("team_id", teamId)
      .maybeSingle();
    if (!data) return false;
    // Basketball is always indoor regardless of toggle
    if ((data as { sport_type?: string }).sport_type === "basketball") return true;
    return (data as { indoor_mode?: boolean }).indoor_mode === true;
  } catch {
    return false;
  }
}

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
    match_day_detection_min_player_load: Number(
      row.match_day_detection_min_player_load ?? DEFAULT_CONFIG.match_day_detection_min_player_load,
    ),
    match_demand_min_minutes: Number(row.match_demand_min_minutes ?? DEFAULT_CONFIG.match_demand_min_minutes),
    match_demand_template: mergeTemplateWithDefaults(
      row.match_demand_template as LoadTargetConfig["match_demand_template"] | null,
    ),
    match_demand_overrides: (row.match_demand_overrides as LoadTargetConfig["match_demand_overrides"]) ?? {},
    baseline_exclude_match_days: Boolean(row.baseline_exclude_match_days ?? DEFAULT_CONFIG.baseline_exclude_match_days),
    updated_at: String(row.updated_at ?? new Date().toISOString()),
  };
}

// ─── Match-day discovery ───────────────────────────────────────────────────

/**
 * Public wrapper around match-date discovery for other server modules
 * (e.g. the weekly load tracker's baseline-exclusion logic).
 *
 * Given a team and a date range, returns the dates on which the team played a
 * match, using the same priority chain as the match_demand mode:
 *   1. team_schedule_events.event_type = 'match'
 *   2. week_plans.day_type = 'GAME'
 *   3. Squad-average TD (outdoor) / Player Load (indoor) threshold fallback
 *
 * Reads thresholds + indoor flag from the team's saved `team_load_targets`
 * config so behavior matches what coaches see in the modal.
 */
export async function findTeamMatchDates(args: {
  teamId: string;
  fromDate: string;
  toDate: string;
  /** Override auto-detected indoor mode. Falls back to team_settings. */
  indoor?: boolean;
}): Promise<string[]> {
  const { teamId, fromDate, toDate } = args;
  const cfg = await getTeamLoadTargetConfig(teamId);
  const indoor = args.indoor ?? (await getTeamIndoorMode(teamId));
  return findRecentMatchDates({
    teamId,
    fromDate,
    toDate,
    minTdFallback: cfg.match_day_detection_min_td,
    minPlayerLoadFallback: cfg.match_day_detection_min_player_load,
    indoor,
  });
}

async function findRecentMatchDates(args: {
  teamId: string;
  fromDate: string;
  toDate: string;
  minTdFallback: number;
  /** Squad-average Player Load threshold used as fallback when indoor. */
  minPlayerLoadFallback: number;
  /** Indoor teams cannot rely on Total Distance (GPS); switch to PL-based fallback. */
  indoor: boolean;
}): Promise<string[]> {
  const { teamId, fromDate, toDate, minTdFallback, minPlayerLoadFallback, indoor } = args;
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

  // 2. week_plans.day_type = 'GAME' — column is `day_date` (NOT `plan_date`)
  try {
    const { data: plans } = await sb
      .from("week_plans")
      .select("day_date, day_type")
      .eq("team_id", teamId)
      .gte("day_date", fromDate)
      .lte("day_date", toDate)
      .ilike("day_type", "game");
    for (const r of (plans ?? []) as Array<{ day_date: string }>) {
      if (r.day_date) dateSet.add(r.day_date);
    }
  } catch {
    /* continue */
  }

  // 3. Fallback — days where squad-average load metric exceeds a threshold
  //    (catches matches even if schedule metadata is missing).
  //    Indoor teams have no GPS, so TD is ~0; use Player Load instead.
  if (dateSet.size === 0) {
    const fallbackCol = indoor ? "total_player_load" : "total_distance";
    const plFallbackCol = "player_load"; // fallback when total_player_load is null
    const threshold = indoor ? minPlayerLoadFallback : minTdFallback;

    // Team-wide over a long lookback (default 120d) → page past the 1000-row cap.
    // Cast: the dynamic template `.select()` defeats supabase-js's type-level
    // select parser (a compile-time-only ParserError), so pin the awaited shape.
    const loadRows = await fetchAllPages<Record<string, unknown>>((from, to) =>
      sb
        .from("player_external_load_daily")
        .select(`date, ${fallbackCol}${indoor ? `, ${plFallbackCol}` : ""}`)
        .eq("team_id", teamId)
        .or(EXCLUDE_PREV_CLUB_OR) // per-date squad avg (match-date detection) — exclude pre-transfer rows
        .gte("date", fromDate)
        .lte("date", toDate)
        .in("source", ["catapult", "manual"])
        .order("date", { ascending: true })
        .range(from, to) as unknown as PromiseLike<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>,
    );

    const perDay = new Map<string, number[]>();
    for (const row of (loadRows ?? []) as unknown as Array<Record<string, unknown>>) {
      const date = String(row.date ?? "");
      if (!date) continue;
      // Prefer total_player_load, fall back to player_load when indoor.
      let v: number | null = null;
      const primary = row[fallbackCol];
      if (typeof primary === "number" && Number.isFinite(primary)) {
        v = primary;
      } else if (indoor) {
        const alt = row[plFallbackCol];
        if (typeof alt === "number" && Number.isFinite(alt)) v = alt;
      }
      if (v == null) continue;
      if (!perDay.has(date)) perDay.set(date, []);
      perDay.get(date)!.push(v);
    }
    for (const [date, vals] of perDay) {
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      if (avg >= threshold) dateSet.add(date);
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
  activeMetrics: readonly WeeklyLoadMetricKey[];
}): Promise<MatchDemandAverageResult> {
  const { teamId, matchDates, minMinutes, activeMetrics } = args;
  if (matchDates.length === 0) {
    return { avg: {}, fullMatchRowsUsed: 0, rowsSkippedPartial: 0 };
  }

  const sb = getSupabaseAdmin();
  const { data } = await sb
    .from("player_external_load_daily")
    .select(MATCH_DEMAND_SELECT_COLS)
    .eq("team_id", teamId)
    .or(EXCLUDE_PREV_CLUB_OR) // per-date squad avg (team match demand) — exclude pre-transfer rows
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
    for (const key of activeMetrics) {
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
    for (const key of activeMetrics) {
      const arr = bucket.get(key);
      if (arr && arr.length) avg[key] = arr.reduce((a, b) => a + b, 0) / arr.length;
    }
    perDateAvg.push(avg);
  }

  const result: Partial<Record<WeeklyLoadMetricKey, number>> = {};
  for (const key of activeMetrics) {
    const vals = perDateAvg.map((a) => a[key]).filter((v): v is number => v != null);
    if (vals.length) result[key] = vals.reduce((a, b) => a + b, 0) / vals.length;
  }
  return { avg: result, fullMatchRowsUsed, rowsSkippedPartial };
}

// ─── Main: compute target week total ───────────────────────────────────────

export async function computeWeeklyTarget(args: {
  teamId: string;
  referenceDate: string; // typically today, used to bound match-demand lookback
  /** Override auto-detected indoor mode. Falls back to team_settings. */
  indoor?: boolean;
}): Promise<TargetComputation> {
  const { teamId, referenceDate } = args;
  const cfg = await getTeamLoadTargetConfig(teamId);
  const indoor = args.indoor ?? (await getTeamIndoorMode(teamId));
  const activeMetrics = getActiveWeeklyLoadMetrics(indoor);

  const meso = Number(cfg.mesocycle_multiplier || 1.0);

  // ─── baseline ────────────────────────────────────────────────────────────
  if (cfg.mode === "baseline") {
    return {
      mode: "baseline",
      corridor_pct: cfg.corridor_pct,
      mesocycle_phase: cfg.mesocycle_phase,
      mesocycle_multiplier: meso,
      target_week_total: {},
      indoor,
    };
  }

  // ─── coach_weekly ────────────────────────────────────────────────────────
  if (cfg.mode === "coach_weekly") {
    const target: Partial<Record<WeeklyLoadMetricKey, number | null>> = {};
    for (const key of activeMetrics) {
      const v = cfg.coach_weekly_targets[key];
      target[key] = v != null && Number.isFinite(Number(v)) ? Number(v) * meso : null;
    }
    return {
      mode: "coach_weekly",
      corridor_pct: cfg.corridor_pct,
      mesocycle_phase: cfg.mesocycle_phase,
      mesocycle_multiplier: meso,
      target_week_total: target,
      indoor,
    };
  }

  // ─── match_demand ────────────────────────────────────────────────────────
  // 1. Compute template weekly sum per KPI (sum of percentages across all
  //    MD-days in the template). This is the "number of match-equivalents"
  //    expected in the week, broken down per metric.
  const templateWeekSum: Partial<Record<WeeklyLoadMetricKey, number>> = {};
  for (const dayKey of Object.keys(cfg.match_demand_template)) {
    const dayRow = cfg.match_demand_template[dayKey] ?? {};
    for (const key of activeMetrics) {
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
    minPlayerLoadFallback: cfg.match_day_detection_min_player_load,
    indoor,
  });

  const matchAvgResult = await computeMatchDemandAverage({
    teamId,
    matchDates,
    minMinutes: cfg.match_demand_min_minutes,
    activeMetrics,
  });
  const autoMatchAvg = matchAvgResult.avg;

  const matchAvg: Partial<Record<WeeklyLoadMetricKey, number>> = {};
  for (const key of activeMetrics) {
    const override = cfg.match_demand_overrides[key];
    if (override != null && Number.isFinite(Number(override))) {
      matchAvg[key] = Number(override);
    } else if (autoMatchAvg[key] != null) {
      matchAvg[key] = autoMatchAvg[key];
    }
  }

  // 3. target = match_avg × template_week_sum × meso
  const target: Partial<Record<WeeklyLoadMetricKey, number | null>> = {};
  for (const key of activeMetrics) {
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
    indoor,
  };
}
