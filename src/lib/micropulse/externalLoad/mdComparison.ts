/**
 * MD-Context Session Comparison (server-only computation)
 *
 * Compares a training session's Catapult metrics against the historical rolling
 * average of sessions with the same Match Day designation (e.g. all MD-2 sessions).
 *
 * Output: Z-score and STEN (1-10) per metric per player.
 *
 * STEN interpretation:
 *   1-3  → significantly below MD norm (low load)
 *   4-7  → within normal range (appropriate)
 *   8-10 → significantly above MD norm (high load / overload risk)
 */

import { getSupabaseAdmin } from "@/lib/supabase-admin";

// Re-export types from the shared (client-safe) module
export type { MdDay, MdMetricKey, MdMetricScore, PlayerMdComparison, MdComparisonResult, MdPlanningMetric, MdPlanningResult } from "./mdComparisonTypes";
export { MD_COMPARISON_METRICS, MD_METRIC_LABELS } from "./mdComparisonTypes";

import { MD_COMPARISON_METRICS, MD_METRIC_LABELS, type MdDay, type MdMetricKey, type MdMetricScore, type PlayerMdComparison, type MdComparisonResult, type MdPlanningMetric, type MdPlanningResult } from "./mdComparisonTypes";

// ─── MD Day Resolution ───────────────────────────────────────────────────────

/** Parse all match dates from coach_week_setup for a team (all weeks) */
async function fetchTeamMatchDates(teamId: string): Promise<string[]> {
  const sb = getSupabaseAdmin();
  const { data } = await sb
    .from("coach_week_setup")
    .select("matches")
    .eq("team_id", teamId);

  const dates: string[] = [];
  for (const row of data ?? []) {
    const matches = (row as any).matches;
    if (Array.isArray(matches)) {
      for (const m of matches) {
        if (m?.date && typeof m.date === "string" && m.date.length === 10) {
          dates.push(m.date);
        }
      }
    }
  }
  return [...new Set(dates)].sort();
}

/** Compute the MD designation for a given date relative to match dates */
export function computeMdDay(date: string, matchDates: string[]): MdDay {
  if (matchDates.includes(date)) return "MD";

  // Find nearest future match
  const nextMatch = matchDates.find((m) => m > date) ?? null;
  // Find nearest past match
  let prevMatch: string | null = null;
  for (let i = matchDates.length - 1; i >= 0; i--) {
    if (matchDates[i] < date) { prevMatch = matchDates[i]; break; }
  }

  const daysBetween = (a: string, b: string) => {
    const da = new Date(a);
    const db = new Date(b);
    return Math.round((db.getTime() - da.getTime()) / 86400000);
  };

  // Pre-match takes priority
  if (nextMatch) {
    const daysUntil = daysBetween(date, nextMatch);
    if (daysUntil >= 1 && daysUntil <= 5) return `MD-${daysUntil}` as MdDay;
  }

  // Post-match
  if (prevMatch) {
    const daysSince = daysBetween(prevMatch, date);
    if (daysSince >= 1 && daysSince <= 3) return `MD+${daysSince}` as MdDay;
  }

  return "TRAIN";
}

// ─── DB Query Helpers ────────────────────────────────────────────────────────

type RawLoadRow = {
  player_id: string;
  date: string;
  total_distance: number | null;
  hir_dist: number | null;
  total_player_load: number | null;
  player_load: number | null;
  player_load_per_minute: number | null;
  velocity_band5_total_distance: number | null;
  velocity_band6_total_distance: number | null;
  accel_b2_3_tot_effs_gen2: number | null;
  decel_b2_3_tot_effs_gen2: number | null;
  max_velocity: number | null;
  max_vel: number | null;
  sprint_distance: number | null;
  ima_accel: number | null;
  ima_decel: number | null;
  jumps: number | null;
  fmp_dynamic_high_s: number | null;
  ima_cod_left_high: number | null;
  ima_cod_left_medium: number | null;
  ima_cod_left_low: number | null;
  ima_cod_right_high: number | null;
  ima_cod_right_medium: number | null;
  ima_cod_right_low: number | null;
};

const codSum = (r: RawLoadRow): number | null => {
  const v = (r.ima_cod_left_high ?? 0) + (r.ima_cod_left_medium ?? 0) + (r.ima_cod_left_low ?? 0) +
    (r.ima_cod_right_high ?? 0) + (r.ima_cod_right_medium ?? 0) + (r.ima_cod_right_low ?? 0);
  return v > 0 ? v : null;
};

function extractMetric(row: RawLoadRow, key: MdMetricKey): number | null {
  switch (key) {
    case "duration":            return null; // handled separately from training_session_context
    case "totalDistance":        return row.total_distance;
    case "hirDist":             return row.hir_dist;
    case "totalPlayerLoad":     return row.total_player_load ?? row.player_load;
    case "playerLoadPerMinute": return row.player_load_per_minute;
    case "velocityBand5":       return row.velocity_band5_total_distance;
    case "velocityBand6":       return row.velocity_band6_total_distance;
    case "accelB23":            return row.accel_b2_3_tot_effs_gen2;
    case "decelB23":            return row.decel_b2_3_tot_effs_gen2;
    case "maxVelocity":         return row.max_velocity ?? row.max_vel;
    case "sprintDistance":      return row.sprint_distance;
    case "imaAccel":            return row.ima_accel;
    case "imaDecel":            return row.ima_decel;
    case "imaCod":              return codSum(row);
    case "jumps":               return row.jumps;
    case "fmpDynamicHigh":      return row.fmp_dynamic_high_s;
  }
}

// ─── Statistics ──────────────────────────────────────────────────────────────

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdDev(values: number[], avg: number): number {
  if (values.length < 2) return 0;
  const variance = values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function zScore(value: number, avg: number, sd: number): number | null {
  if (sd < 0.001) return null; // can't compute z with no variance
  return (value - avg) / sd;
}

/** STEN = 5.5 + 2×z, clamped to [1, 10] */
function toSten(z: number | null): number | null {
  if (z == null) return null;
  return Math.min(10, Math.max(1, Math.round(5.5 + 2 * z)));
}

// ─── Main Computation ────────────────────────────────────────────────────────

const SELECT_COLS = [
  "player_id", "date",
  "total_distance", "hir_dist",
  "total_player_load", "player_load", "player_load_per_minute",
  "velocity_band5_total_distance", "velocity_band6_total_distance",
  "accel_b2_3_tot_effs_gen2", "decel_b2_3_tot_effs_gen2",
  "max_velocity", "max_vel", "sprint_distance",
  "ima_accel", "ima_decel", "jumps", "fmp_dynamic_high_s",
  "ima_cod_left_high", "ima_cod_left_medium", "ima_cod_left_low",
  "ima_cod_right_high", "ima_cod_right_medium", "ima_cod_right_low",
].join(", ");

export async function computeMdComparison(args: {
  teamId: string;
  date: string;
  /** Optional: override the MD day (e.g. coach manually selects "MD-2") */
  mdDayOverride?: MdDay;
  /** Min historical sessions needed for comparison (default 3) */
  minSessions?: number;
  /** Max historical sessions lookback window in days (default 120) */
  lookbackDays?: number;
}): Promise<MdComparisonResult> {
  const { teamId, date, minSessions = 3, lookbackDays = 120 } = args;
  const sb = getSupabaseAdmin();

  // 1. Resolve all match dates for this team
  const matchDates = await fetchTeamMatchDates(teamId);

  // 2. Determine today's MD day
  const mdDay = args.mdDayOverride ?? computeMdDay(date, matchDates);

  // 3. Find all dates within lookback window that share the same MD day
  const lookbackStart = new Date(date);
  lookbackStart.setDate(lookbackStart.getDate() - lookbackDays);
  const lookbackStartStr = lookbackStart.toISOString().slice(0, 10);

  // Build candidate dates from match dates
  const candidateDates: string[] = [];
  const allDates = generateDateRange(lookbackStartStr, date);
  for (const d of allDates) {
    if (d === date) continue; // exclude today
    const dMd = computeMdDay(d, matchDates);
    if (dMd === mdDay) candidateDates.push(d);
  }

  // 4. Fetch today's data for all team players
  const { data: todayRows } = await sb
    .from("player_external_load_daily")
    .select(SELECT_COLS)
    .eq("team_id", teamId)
    .eq("date", date)
    .in("source", ["catapult", "manual"]);

  // 5. Fetch historical data for the same MD days
  let historicalRows: RawLoadRow[] = [];
  if (candidateDates.length > 0) {
    const { data } = await sb
      .from("player_external_load_daily")
      .select(SELECT_COLS)
      .eq("team_id", teamId)
      .in("date", candidateDates)
      .in("source", ["catapult", "manual"]);
    historicalRows = (data ?? []) as unknown as RawLoadRow[];
  }

  // 6. Get player names
  const { data: playersData } = await sb
    .from("players")
    .select("id, full_name")
    .eq("team_id", teamId);
  const playerNames = new Map<string, string>();
  for (const p of playersData ?? []) {
    playerNames.set(p.id, p.full_name ?? "Unknown");
  }

  // 7. Group historical data by player
  const histByPlayer = new Map<string, RawLoadRow[]>();
  for (const row of historicalRows) {
    const pid = row.player_id;
    if (!histByPlayer.has(pid)) histByPlayer.set(pid, []);
    histByPlayer.get(pid)!.push(row);
  }

  // 8. Compute per-player comparisons
  const players: PlayerMdComparison[] = [];
  for (const todayRow of (todayRows ?? []) as unknown as RawLoadRow[]) {
    const pid = todayRow.player_id;
    const hist = histByPlayer.get(pid) ?? [];
    const histDates = new Set(hist.map((r) => r.date));
    const sampleSize = histDates.size;

    const dataQuality: PlayerMdComparison["dataQuality"] =
      sampleSize >= 6 ? "good" : sampleSize >= minSessions ? "limited" : "insufficient";

    const metrics: MdMetricScore[] = MD_COMPARISON_METRICS.map((key) => {
      const value = extractMetric(todayRow, key);
      const histValues = hist.map((r) => extractMetric(r, key)).filter((v): v is number => v != null);
      const histMean = mean(histValues);
      const histSd = stdDev(histValues, histMean);

      const z = value != null && histValues.length >= minSessions ? zScore(value, histMean, histSd) : null;
      const sten = toSten(z);

      return {
        metric: key,
        value,
        mdMean: histMean,
        mdStdDev: histSd,
        zScore: z,
        sten,
        sampleSize: histValues.length,
      };
    });

    // Weighted overall STEN — heavier weight on HIR, Decel, Player Load
    const weights: Partial<Record<MdMetricKey, number>> = {
      totalDistance: 0.08,
      hirDist: 0.18,
      totalPlayerLoad: 0.15,
      playerLoadPerMinute: 0.12,
      velocityBand5: 0.08,
      velocityBand6: 0.06,
      accelB23: 0.10,
      decelB23: 0.13,
      maxVelocity: 0.06,
      sprintDistance: 0.04,
      // IMA / FMP (inertial — indoor-relevant). Decel + dynamic-high lead,
      // mirroring the mechanical-load emphasis (McBurnie 2022).
      imaDecel: 0.10,
      imaAccel: 0.06,
      imaCod: 0.08,
      jumps: 0.04,
      fmpDynamicHigh: 0.10,
    };
    let wSum = 0, wTotal = 0;
    for (const m of metrics) {
      if (m.sten != null) {
        const w = weights[m.metric] ?? 0.05;
        wSum += m.sten * w;
        wTotal += w;
      }
    }
    const overallSten = wTotal > 0 ? Math.round(wSum / wTotal) : null;

    players.push({
      playerId: pid,
      playerName: playerNames.get(pid) ?? "Unknown",
      mdDay,
      date,
      metrics,
      overallSten,
      dataQuality,
    });
  }

  // Sort by name
  players.sort((a, b) => a.playerName.localeCompare(b.playerName));

  // Capability gate: the sprint-distance + genuine IMA/FMP metrics are dead on
  // Lite (sprint_distance ~0; IMA/FMP absent) and must NOT be kept alive by a
  // single stray Pro-pod row. Require them on >= 25% of rows; the other metrics
  // (distance, HSR, velocity bands, B2-3, etc.) are near-universal on both tiers.
  const STRICT = new Set<MdMetricKey>(["sprintDistance", "imaAccel", "imaDecel", "imaCod", "jumps", "fmpDynamicHigh"]);
  const share = (k: MdMetricKey) => (historicalRows.length ? historicalRows.filter((r) => { const v = extractMetric(r, k); return v != null && v > 0; }).length / historicalRows.length : 0);
  const availableMetrics = MD_COMPARISON_METRICS.filter((k) => !STRICT.has(k) || share(k) >= 0.25);

  return {
    date,
    mdDay,
    teamId,
    players,
    historicalSessionCount: candidateDates.length,
    availableMetrics,
  };
}

// ─── Planning Mode ──────────────────────────────────────────────────────────

/**
 * Compute historical team-level averages for a given MD context.
 * No session date required — this is for pre-session planning.
 *
 * Returns mean, stdDev, min, max, and ±1σ band for each metric,
 * aggregated across all players (team-level view).
 */
export async function computeMdPlanning(args: {
  teamId: string;
  mdDay: MdDay;
  /** Max historical lookback in days (default 120) */
  lookbackDays?: number;
}): Promise<MdPlanningResult> {
  const { teamId, mdDay, lookbackDays = 120 } = args;
  const sb = getSupabaseAdmin();

  // 1. Resolve all match dates
  const matchDates = await fetchTeamMatchDates(teamId);

  // 2. Find all historical dates with the same MD designation
  const today = new Date().toISOString().slice(0, 10);
  const lookbackStart = new Date(today);
  lookbackStart.setDate(lookbackStart.getDate() - lookbackDays);
  const lookbackStartStr = lookbackStart.toISOString().slice(0, 10);

  const candidateDates: string[] = [];
  const allDates = generateDateRange(lookbackStartStr, today);
  for (const d of allDates) {
    const dMd = computeMdDay(d, matchDates);
    if (dMd === mdDay) candidateDates.push(d);
  }

  // 3. Fetch all historical data for those dates
  let historicalRows: RawLoadRow[] = [];
  if (candidateDates.length > 0) {
    const { data } = await sb
      .from("player_external_load_daily")
      .select(SELECT_COLS)
      .eq("team_id", teamId)
      .in("date", candidateDates)
      .in("source", ["catapult", "manual"]);
    historicalRows = (data ?? []) as unknown as RawLoadRow[];
  }

  // 3b. Fetch duration data from training_session_context for the same candidate dates
  let durationByDate = new Map<string, number>();
  if (candidateDates.length > 0) {
    const { data: ctxRows } = await sb
      .from("training_session_context")
      .select("session_date, duration_min")
      .eq("team_id", teamId)
      .in("session_date", candidateDates);
    for (const row of ctxRows ?? []) {
      const dur = Number((row as any).duration_min);
      if (dur > 0) {
        durationByDate.set(String((row as any).session_date), dur);
      }
    }
  }

  // 4. Aggregate per metric across all players (team-level)
  const metrics: MdPlanningMetric[] = MD_COMPARISON_METRICS.map((key) => {
    // Duration is a team-level metric (one value per session date, not per player)
    if (key === "duration") {
      const sessionDurations = [...durationByDate.values()];
      const m = mean(sessionDurations);
      const sd = stdDev(sessionDurations, m);
      const label = MD_METRIC_LABELS[key];
      return {
        metric: key,
        mean: m,
        stdDev: sd,
        min: sessionDurations.length > 0 ? Math.min(...sessionDurations) : 0,
        max: sessionDurations.length > 0 ? Math.max(...sessionDurations) : 0,
        low: m - sd,
        high: m + sd,
        sampleSize: sessionDurations.length,
        unit: label.unit,
      };
    }

    // Collect all non-null values for this metric across all players and dates
    const values: number[] = [];
    for (const row of historicalRows) {
      const v = extractMetric(row, key);
      if (v != null) values.push(v);
    }

    // Compute per-session averages (average across players per date, then stats across dates)
    const byDate = new Map<string, number[]>();
    for (const row of historicalRows) {
      const v = extractMetric(row, key);
      if (v != null) {
        if (!byDate.has(row.date)) byDate.set(row.date, []);
        byDate.get(row.date)!.push(v);
      }
    }
    // Team average per session date
    const sessionAvgs: number[] = [];
    for (const vals of byDate.values()) {
      sessionAvgs.push(vals.reduce((a, b) => a + b, 0) / vals.length);
    }

    const m = mean(sessionAvgs);
    const sd = stdDev(sessionAvgs, m);
    const label = MD_METRIC_LABELS[key];

    return {
      metric: key,
      mean: m,
      stdDev: sd,
      min: sessionAvgs.length > 0 ? Math.min(...sessionAvgs) : 0,
      max: sessionAvgs.length > 0 ? Math.max(...sessionAvgs) : 0,
      low: m - sd,
      high: m + sd,
      sampleSize: sessionAvgs.length,
      unit: label.unit,
    };
  });

  // Count unique players
  const playerIds = new Set(historicalRows.map((r) => r.player_id));

  return {
    mdDay,
    teamId,
    metrics,
    sessionCount: candidateDates.length,
    playerCount: playerIds.size,
    lookbackFrom: lookbackStartStr,
    lookbackTo: today,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateDateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const d = new Date(start);
  const endD = new Date(end);
  while (d <= endD) {
    dates.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return dates;
}
