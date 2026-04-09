/**
 * GET /api/coach/player-load/metabolic
 *
 * Returns per-player Metabolic Load Score for a given date.
 * Mirrors the pattern of /api/coach/player-load/mli/route.ts.
 *
 * Query params:
 *   teamId  – optional team filter
 *   date    – YYYY-MM-DD (defaults to today in operational timezone)
 */

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getDateKeyInTimezone, getOperationalTimezone } from "@/lib/notifications/schedule";
import { requireCoachAccessForTeam } from "@/lib/session-rpe/server";
import {
  computeMetabolicLoad,
  getMetabolicRecommendationHints,
  type MetabolicLoadBand,
  type MetabolicLoadConfidence,
  type CompositeFatigueType,
  type MetabolicRecommendationCode,
  type MetabolicLoadSourceRow,
  type RpeSourceRow,
} from "@/lib/micropulse/metabolicLoad";
import {
  computeMechanicalLoad,
  type MechanicalLoadSourceRow,
} from "@/lib/micropulse/mechanicalLoad";

export const runtime = "nodejs";

// ─── Types ─────────────────────────────────────────────────────────────────

type PlayerRow = {
  id: string;
  full_name: string | null;
  team_id: string | null;
  user_id: string | null;
};

type DBExternalLoadRow = {
  player_id: string;
  date: string;
  metabolic_power: number | null;
  metabolic_power_peak: number | null;
  high_metabolic_load_distance_m: number | null;
  time_above_hml_threshold_s: number | null;
  metabolic_data_valid: boolean;
  metabolic_power_gen: string | null;
  source: string | null;
};

type ResponseRow = {
  player_id: string;
  player_name: string;
  date: string;
  metabolic_load_score: number | null;
  metabolic_load_band: MetabolicLoadBand | null;
  metabolic_flag: string;
  fatigue_type: CompositeFatigueType;
  recommendation_code: MetabolicRecommendationCode;
  recommendation_hints: string[];
  avg_power_w_kg: number | null;
  peak_power_w_kg: number | null;
  hml_distance_m: number | null;
  time_above_threshold_s: number | null;
  metabolic_data_valid: boolean;
  metabolic_power_gen: string | null;
  confidence: MetabolicLoadConfidence;
  data_confidence: number;
  /** RPE z-score on this date vs. athlete's 28-day rolling baseline. */
  rpe_z: number | null;
  /** Score today minus score ~5 days ago. Positive = rising, negative = recovering. */
  delta_score: number | null;
  /** Std deviation of metabolic scores over the last 7 days. High = volatile load. */
  volatility7d: number | null;
  /** Session type from the RPE submission on this date (match / team_training / etc). */
  session_type: string | null;
};

type ResponsePayload = {
  ok: boolean;
  error?: string;
  summary?: {
    avgMetabolicScore: number | null;
    highCount: number;
    validCount: number;
    missingCount: number;
  };
  rows?: ResponseRow[];
  missingPlayers?: Array<{ player_id: string; player_name: string; status: "NO_CATAPULT_DATA" }>;
  rosterCount?: number;
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function validDateKey(input: string | null): string | null {
  if (!input) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(input) ? input : null;
}

function dateMinusDays(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function roundNumber(value: number | null, decimals = 1): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function mapDBRowToSourceRow(row: DBExternalLoadRow): MetabolicLoadSourceRow {
  return {
    date: row.date,
    metabolic_power: row.metabolic_power,
    metabolic_power_peak: row.metabolic_power_peak,
    high_metabolic_load_distance_m: row.high_metabolic_load_distance_m,
    time_above_hml_threshold_s: row.time_above_hml_threshold_s,
    metabolic_data_valid: row.metabolic_data_valid ?? false,
  };
}

async function fetchMetabolicRows(
  sb: ReturnType<typeof getSupabaseAdmin>,
  teamId: string | null,
  startDate: string,
  endDate: string,
): Promise<DBExternalLoadRow[]> {
  const SELECT =
    "player_id, date, metabolic_power, metabolic_power_peak, high_metabolic_load_distance_m, time_above_hml_threshold_s, metabolic_data_valid, metabolic_power_gen, source";

  let query = sb
    .from("player_external_load_daily")
    .select(SELECT)
    .in("source", ["catapult", "manual"])
    .gte("date", startDate)
    .lte("date", endDate)
    .order("date", { ascending: true });

  if (teamId) query = query.eq("team_id", teamId);

  const { data, error } = await query;

  if (!error) {
    return ((data ?? []) as unknown as DBExternalLoadRow[]).map((row) => ({
      ...row,
      metabolic_data_valid: row.metabolic_data_valid ?? false,
    }));
  }

  // Graceful fallback: new columns may not exist yet on older DB instances
  const isMissingColumn =
    error.message.includes("column player_external_load_daily.metabolic_power_peak") ||
    error.message.includes("column player_external_load_daily.high_metabolic_load_distance_m") ||
    error.message.includes("column player_external_load_daily.time_above_hml_threshold_s") ||
    error.message.includes("column player_external_load_daily.metabolic_data_valid");

  if (!isMissingColumn) throw new Error(error.message);

  // Fallback: fetch only metabolic_power (legacy column)
  const FALLBACK_SELECT = "player_id, date, metabolic_power, source";
  let fallbackQuery = sb
    .from("player_external_load_daily")
    .select(FALLBACK_SELECT)
    .in("source", ["catapult", "manual"])
    .gte("date", startDate)
    .lte("date", endDate)
    .order("date", { ascending: true });
  if (teamId) fallbackQuery = fallbackQuery.eq("team_id", teamId);
  const { data: fallbackData, error: fallbackError } = await fallbackQuery;
  if (fallbackError) throw new Error(fallbackError.message);

  return ((fallbackData ?? []) as unknown as Array<Record<string, unknown>>).map((row) => ({
    player_id: String(row.player_id),
    date: String(row.date),
    metabolic_power: (row.metabolic_power as number | null) ?? null,
    metabolic_power_peak: null,
    high_metabolic_load_distance_m: null,
    time_above_hml_threshold_s: null,
    metabolic_data_valid: false,
    metabolic_power_gen: null,
    source: (row.source as string | null) ?? null,
  }));
}

/**
 * Fetch RPE entries (including session_type) for all players over a date window.
 * Falls back to empty map on error — RPE is additive, never blocks GPS response.
 */
async function fetchRpeRows(
  sb: ReturnType<typeof getSupabaseAdmin>,
  teamId: string | null,
  startDate: string,
  endDate: string,
): Promise<Map<string, RpeSourceRow[]>> {
  const result = new Map<string, RpeSourceRow[]>();
  try {
    let query = sb
      .from("session_rpe")
      .select("player_id, session_date, rpe, session_type")
      .gte("session_date", startDate)
      .lte("session_date", endDate)
      .order("session_date", { ascending: true });

    if (teamId) query = query.eq("team_id", teamId);

    const { data, error } = await query;
    if (error || !data) return result;

    for (const row of data as Array<{ player_id: string; session_date: string; rpe: number; session_type: string | null }>) {
      const existing = result.get(row.player_id) ?? [];
      existing.push({ date: row.session_date, rpe: row.rpe, session_type: row.session_type });
      result.set(row.player_id, existing);
    }
  } catch {
    // RPE is additive — never block the main response on RPE fetch failure
  }
  return result;
}

/**
 * Fetch mechanical load rows for MLI computation.
 * Mirrors the query in /api/coach/player-load/mli/route.ts.
 * Falls back to empty map on error — mechanical is additive.
 */
async function fetchMechanicalRows(
  sb: ReturnType<typeof getSupabaseAdmin>,
  teamId: string | null,
  startDate: string,
  endDate: string,
): Promise<Map<string, MechanicalLoadSourceRow[]>> {
  const result = new Map<string, MechanicalLoadSourceRow[]>();
  try {
    const SELECT =
      "player_id, date, decel_b2_3_tot_effs_gen2, tot_ds, decelerations, ima_decel, accel_b2_3_tot_effs_gen2, tot_as, accelerations, ima_accel, cod_events, ima_cod, ima_total, player_load_per_minute, impacts, source";

    let query = sb
      .from("player_external_load_daily")
      .select(SELECT)
      .in("source", ["catapult", "manual"])
      .gte("date", startDate)
      .lte("date", endDate)
      .order("date", { ascending: true });

    if (teamId) query = query.eq("team_id", teamId);

    const { data, error } = await query;
    if (error || !data) return result;

    for (const row of data as Array<Record<string, unknown>>) {
      const playerId = String(row.player_id);
      const existing = result.get(playerId) ?? [];
      existing.push({
        date: String(row.date),
        high_decels: (row.decel_b2_3_tot_effs_gen2 as number | null) ?? null,
        total_decels: ((row.tot_ds ?? row.decelerations) as number | null) ?? null,
        ima_decel: (row.ima_decel as number | null) ?? null,
        high_accels: (row.accel_b2_3_tot_effs_gen2 as number | null) ?? null,
        total_accels: ((row.tot_as ?? row.accelerations) as number | null) ?? null,
        ima_accel: (row.ima_accel as number | null) ?? null,
        cod_events: (row.cod_events as number | null) ?? null,
        ima_cod: (row.ima_cod as number | null) ?? null,
        ima_total: (row.ima_total as number | null) ?? null,
        playerload_per_min: (row.player_load_per_minute as number | null) ?? null,
        impacts: (row.impacts as number | null) ?? null,
      });
      result.set(playerId, existing);
    }
  } catch {
    // Mechanical is additive — never block the response
  }
  return result;
}

// ─── Handler ────────────────────────────────────────────────────────────────

export async function GET(req: Request): Promise<NextResponse<ResponsePayload>> {
  try {
    const sb = getSupabaseAdmin();
    const url = new URL(req.url);
    const requestedTeamId = (url.searchParams.get("teamId") || "").trim() || null;
    const { teamId } = await requireCoachAccessForTeam(sb, req, requestedTeamId);

    const timeZone = getOperationalTimezone();
    const dateKey = validDateKey(url.searchParams.get("date")) ?? getDateKeyInTimezone(new Date(), timeZone);
    // 42 days: 28-day baseline + 7-day volatility window + 7-day buffer
    const startDate = dateMinusDays(dateKey, 42);

    // Roster
    let rosterQuery = sb.from("players").select("id, full_name, team_id, user_id").not("user_id", "is", null);
    if (teamId) rosterQuery = rosterQuery.eq("team_id", teamId);
    const { data: rosterData, error: rosterErr } = await rosterQuery;
    if (rosterErr) return NextResponse.json({ ok: false, error: rosterErr.message }, { status: 500 });
    const roster = (rosterData ?? []) as PlayerRow[];
    const rosterById = new Map(roster.map((p) => [p.id, p]));

    // Fetch GPS, RPE and mechanical in parallel
    const [dbRows, rpeByPlayer, mechByPlayer] = await Promise.all([
      fetchMetabolicRows(sb, teamId, startDate, dateKey),
      fetchRpeRows(sb, teamId, startDate, dateKey),
      fetchMechanicalRows(sb, teamId, startDate, dateKey),
    ]);

    // Group by player
    const grouped = new Map<string, DBExternalLoadRow[]>();
    for (const row of dbRows) {
      const list = grouped.get(row.player_id) ?? [];
      list.push(row);
      grouped.set(row.player_id, list);
    }

    // Compute metabolic load per player
    const computedRows: ResponseRow[] = [];

    for (const [playerId, playerRows] of grouped.entries()) {
      const sourceRows = playerRows.map(mapDBRowToSourceRow);
      const playerRpeRows = rpeByPlayer.get(playerId) ?? [];

      // Compute MLI for this player so classifyFatigueType can detect global_fatigue
      const playerMechRows = mechByPlayer.get(playerId) ?? [];
      const mechResult = playerMechRows.length > 0
        ? computeMechanicalLoad(playerMechRows, dateKey)
        : null;
      const mechanicalLoadScore = mechResult?.mli ?? null;

      const result = computeMetabolicLoad(sourceRows, dateKey, mechanicalLoadScore, playerRpeRows);
      if (!result) continue;

      const todayRow = playerRows.find((r) => r.date === dateKey);
      if (!todayRow) continue;

      computedRows.push({
        player_id: playerId,
        player_name: rosterById.get(playerId)?.full_name ?? "Unknown player",
        date: dateKey,
        metabolic_load_score: result.metabolicLoadScore,
        metabolic_load_band: result.metabolicLoadBand,
        metabolic_flag: result.metabolicFlag,
        fatigue_type: result.fatigueType,
        recommendation_code: result.recommendationCode,
        recommendation_hints: getMetabolicRecommendationHints(result.fatigueType),
        avg_power_w_kg: todayRow.metabolic_power,
        peak_power_w_kg: todayRow.metabolic_power_peak,
        hml_distance_m: todayRow.high_metabolic_load_distance_m,
        time_above_threshold_s: todayRow.time_above_hml_threshold_s,
        metabolic_data_valid: todayRow.metabolic_data_valid,
        metabolic_power_gen: todayRow.metabolic_power_gen,
        confidence: result.confidence,
        data_confidence: result.dataConfidenceMetabolic,
        rpe_z: result.rpeZScore,
        delta_score: result.deltaScore,
        volatility7d: result.volatility7d,
        session_type: playerRpeRows.find((r) => r.date === dateKey)?.session_type ?? null,
      });
    }

    computedRows.sort((a, b) => (b.metabolic_load_score ?? -1) - (a.metabolic_load_score ?? -1) || a.player_name.localeCompare(b.player_name));

    const scoreValues = computedRows
      .map((r) => r.metabolic_load_score)
      .filter((v): v is number => typeof v === "number");
    const avgMetabolicScore = scoreValues.length
      ? roundNumber(scoreValues.reduce((s, v) => s + v, 0) / scoreValues.length, 1)
      : null;
    const highCount = computedRows.filter((r) => r.metabolic_load_band === "high" || r.metabolic_load_band === "very_high").length;
    const validCount = computedRows.filter((r) => r.metabolic_data_valid).length;

    const rowSet = new Set(computedRows.map((r) => r.player_id));
    const missingPlayers = roster
      .filter((p) => !rowSet.has(p.id))
      .map((p) => ({
        player_id: p.id,
        player_name: p.full_name ?? "Unknown player",
        status: "NO_CATAPULT_DATA" as const,
      }));

    return NextResponse.json({
      ok: true,
      summary: {
        avgMetabolicScore,
        highCount,
        validCount,
        missingCount: missingPlayers.length,
      },
      rows: computedRows,
      missingPlayers,
      rosterCount: roster.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
