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
  classifyFatigueType,
  getMetabolicRecommendationCode,
  getMetabolicRecommendationHints,
  type MetabolicLoadBand,
  type MetabolicLoadConfidence,
  type CompositeFatigueType,
  type MetabolicRecommendationCode,
  type MetabolicLoadSourceRow,
} from "@/lib/micropulse/metabolicLoad";

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
    .eq("source", "catapult")
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
    .eq("source", "catapult")
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

// ─── Handler ────────────────────────────────────────────────────────────────

export async function GET(req: Request): Promise<NextResponse<ResponsePayload>> {
  try {
    const sb = getSupabaseAdmin();
    const url = new URL(req.url);
    const requestedTeamId = (url.searchParams.get("teamId") || "").trim() || null;
    const { teamId } = await requireCoachAccessForTeam(sb, req, requestedTeamId);

    const timeZone = getOperationalTimezone();
    const dateKey = validDateKey(url.searchParams.get("date")) ?? getDateKeyInTimezone(new Date(), timeZone);
    const startDate = dateMinusDays(dateKey, 32); // extra 2-day buffer beyond 30-day baseline window

    // Roster
    let rosterQuery = sb.from("players").select("id, full_name, team_id, user_id").not("user_id", "is", null);
    if (teamId) rosterQuery = rosterQuery.eq("team_id", teamId);
    const { data: rosterData, error: rosterErr } = await rosterQuery;
    if (rosterErr) return NextResponse.json({ ok: false, error: rosterErr.message }, { status: 500 });
    const roster = (rosterData ?? []) as PlayerRow[];
    const rosterById = new Map(roster.map((p) => [p.id, p]));

    // External load rows (metabolic columns)
    const dbRows = await fetchMetabolicRows(sb, teamId, startDate, dateKey);

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
      const result = computeMetabolicLoad(sourceRows, dateKey);
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
