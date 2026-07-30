/**
 * Shared decision pipeline for both coach and player endpoints.
 *
 * Background: prior to 2026-04-29 the player UI computed its verdict from a
 * sparse subset of inputs (just sleep_quality + muscle_soreness + total_score),
 * while the coach side ran the full engine with ~25 inputs (load, baselines,
 * Catapult signals, VALD snapshots, decel intelligence, etc.). The two sides
 * therefore disagreed on the same player on the same day — coach saw MODIFIED,
 * player saw GREEN.
 *
 * This module exports the per-player fetchers + the engine pipeline so that
 * /api/team/decisions and /api/player/decision both produce identical output
 * for the same (player_id, date) tuple. The team endpoint keeps its batched
 * fetching for performance; the player endpoint calls each fetcher with a
 * single-element playerIds array.
 *
 * Engine pipeline ownership:
 *  - buildExplainableReadinessDecision (lib/micropulse/readiness)
 *  - buildInjuryRiskDecision           (lib/micropulse/injuryRisk)
 *  - buildAthleteDecision              (lib/micropulse/domain/decision)
 * are still in their own modules. This file is the orchestrator that assembles
 * the inputs, runs the pipeline, and returns the CoachCommandPlayerSource.
 */

import { createClient } from "@supabase/supabase-js";
import {
  buildExplainableReadinessDecision,
} from "@/lib/micropulse/readiness";
import { buildInjuryRiskDecision } from "@/lib/micropulse/injuryRisk";
import { fetchAllPages } from "@/lib/supabasePaginate";
import { buildAthleteDecision } from "@/lib/micropulse/domain/decision";
import { buildDailyAthleteSnapshot } from "@/lib/micropulse/domain/snapshot";
import {
  buildCatapultReadinessContextFromRows,
  computeHidTrend,
  computeResidualDecel,
  normalizeCatapultDailyLoadRow,
} from "@/lib/micropulse/externalLoad";
import {
  getValdDailySnapshot,
  getValdInjuryRiskSignals,
  getValdReadinessAdjustment,
} from "@/lib/micropulse/vald";
import {
  computeCompositeLoadConcern,
  computeRpeAcwrFromRows,
  type RpeAcwrInput,
} from "@/lib/micropulse/compositeLoad";
import {
  computeRpeDiscrepancy,
  type RpeDiscrepancyResult,
} from "@/lib/micropulse/rpeDiscrepancy";
import {
  computeVbtReadiness,
  vbtReadinessToScore,
  type VbtReadinessResult,
  type VbtSessionRow,
} from "@/lib/micropulse/vbtReadiness";
import {
  computeMechanicalLoad,
  type MechanicalLoadSourceRow,
} from "@/lib/micropulse/mechanicalLoad";
import {
  computeMetabolicLoad,
  type MetabolicLoadSourceRow,
} from "@/lib/micropulse/metabolicLoad";
import {
  flagAgainstBaseline,
  type AthleteMetricBaseline,
} from "@/lib/micropulse/baselines";
import {
  fetchRecentDecisions,
  recordPlayerDecision,
} from "@/lib/micropulse/domain/decision/history";
import type { RecentDecision } from "@/lib/micropulse/domain/decision/sequence";
import {
  deriveSignalTrend,
  type SignalTrend,
} from "@/lib/micropulse/domain/decision/forecast";
import type { NormalizedMonitoringSnapshot } from "@/lib/integrations/shared/types";
import type { CoachCommandPlayerSource } from "@/lib/micropulse/coachCommand";

// ─── Public types ───────────────────────────────────────────────────────────
export type CoachRow = Record<string, unknown>;

export type TrainingModifierRow = {
  player_id: string;
  training_modifier: unknown;
};

export type AdminClient = ReturnType<typeof createClient>;

// ─── Pure helpers ───────────────────────────────────────────────────────────
export function toFinite(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function toInt(value: unknown): number | null {
  const parsed = toFinite(value);
  return parsed == null ? null : Math.round(parsed);
}

export function normalizeTrainingModifier(
  value: unknown,
): Record<string, unknown> | null {
  if (value == null) return null;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object"
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  return typeof value === "object" ? (value as Record<string, unknown>) : null;
}

export function extractZ(tmRaw: unknown): number | null {
  const tm = normalizeTrainingModifier(tmRaw);
  return (
    toFinite(tm?.pi && typeof tm.pi === "object" ? (tm.pi as Record<string, unknown>).z : null) ??
    toFinite(tm?.pi && typeof tm.pi === "object" ? (tm.pi as Record<string, unknown>).z_today : null) ??
    toFinite(tm?.baseline_z) ??
    null
  );
}

export function extractYesterdayZ(tmRaw: unknown): number | null {
  const tm = normalizeTrainingModifier(tmRaw);
  const pi = tm?.pi && typeof tm.pi === "object" ? (tm.pi as Record<string, unknown>) : null;
  const explicit = toFinite(pi?.yesterday_z);
  if (explicit != null) return explicit;
  const z = toFinite(pi?.z);
  const delta = toFinite(pi?.delta_z);
  return z != null && delta != null ? z - delta : null;
}

export function deriveLightAteState(
  row: CoachRow,
): "GREEN" | "YELLOW" | "RED" | "GRAY" {
  const raw = String(row.final_flag ?? row.final_color ?? "").toUpperCase();
  if (raw === "RED") return "RED";
  if (raw === "YELLOW") return "YELLOW";
  if (raw === "GREEN" || raw === "GREEN_PLUS") return "GREEN";
  return "GRAY";
}

export function toMechanicalLoadSourceRows(
  rawRows: Array<Record<string, unknown>>,
): MechanicalLoadSourceRow[] {
  return rawRows.map((r) => ({
    date: String(r.date ?? ""),
    high_decels: r.decel_b2_3_tot_effs_gen2 as number | null,
    total_decels: (r.tot_ds ?? r.decelerations) as number | null,
    ima_decel: r.ima_decel as number | null,
    high_accels: r.accel_b2_3_tot_effs_gen2 as number | null,
    total_accels: (r.tot_as ?? r.accelerations) as number | null,
    ima_accel: r.ima_accel as number | null,
    cod_events: r.cod_events as number | null,
    ima_cod: r.ima_cod as number | null,
    ima_total: r.ima_total as number | null,
    playerload_per_min: r.player_load_per_minute as number | null,
    impacts: r.impacts as number | null,
  }));
}

export function toMetabolicLoadSourceRows(
  rawRows: Array<Record<string, unknown>>,
): MetabolicLoadSourceRow[] {
  return rawRows.map((r) => ({
    date: String(r.date ?? ""),
    metabolic_power: r.metabolic_power as number | null,
    metabolic_power_peak: r.metabolic_power_peak as number | null,
    high_metabolic_load_distance_m: r.high_metabolic_load_distance_m as number | null,
    time_above_hml_threshold_s: r.time_above_hml_threshold_s as number | null,
    metabolic_data_valid: (r.metabolic_data_valid as boolean | null) ?? false,
  }));
}

// ─── Per-player fetchers (work for batch via [playerIds] or single via [playerId]) ──

export async function fetchCoachRowsForPlayers(
  sb: AdminClient,
  teamId: string,
  date: string,
  playerIds?: string[],
): Promise<CoachRow[]> {
  let q = sb
    .from("v_coach_readiness_today_v8")
    .select("*")
    .eq("entry_date", date)
    .eq("team_id", teamId);
  if (playerIds && playerIds.length > 0) q = q.in("player_id", playerIds);
  const { data, error } = await q
    .order("total_score", { ascending: true })
    .order("full_name", { ascending: true });

  if (!error && data && data.length > 0) return data as CoachRow[];

  // Fallback: view column may be "team" instead of "team_id"
  let qf = sb
    .from("v_coach_readiness_today_v8")
    .select("*")
    .eq("entry_date", date);
  if (playerIds && playerIds.length > 0) qf = qf.in("player_id", playerIds);
  const fallback = await qf
    .order("total_score", { ascending: true })
    .order("full_name", { ascending: true });
  if (fallback.error) throw fallback.error;
  return ((fallback.data ?? []) as CoachRow[]).filter(
    (row) =>
      String(row.team_id ?? (row as Record<string, unknown>).team ?? "") === teamId,
  );
}

export async function fetchScoreTrendByPlayer(
  sb: AdminClient,
  playerIds: string[],
  date: string,
): Promise<Map<string, SignalTrend>> {
  if (!playerIds.length) return new Map();
  const start = new Date(`${date}T00:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() - 4);
  const startDate = start.toISOString().slice(0, 10);
  const { data, error } = await sb
    .from("readiness_entries")
    .select("player_id, entry_date, total_score")
    .in("player_id", playerIds)
    .gte("entry_date", startDate)
    .lte("entry_date", date)
    .order("entry_date", { ascending: true });
  if (error) {
    console.warn("fetchScoreTrendByPlayer error:", error.message);
    return new Map();
  }
  const byPlayer = new Map<string, Array<{ date: string; score: number | null }>>();
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const pid = String(row.player_id);
    const score = typeof row.total_score === "number" ? row.total_score : null;
    if (!byPlayer.has(pid)) byPlayer.set(pid, []);
    byPlayer.get(pid)!.push({ date: String(row.entry_date), score });
  }
  const out = new Map<string, SignalTrend>();
  for (const [pid, rows] of byPlayer.entries()) {
    out.set(pid, deriveSignalTrend(rows.map((r) => r.score)));
  }
  return out;
}

export async function fetchTrainingModifiers(
  sb: AdminClient,
  playerIds: string[],
  date: string,
): Promise<Map<string, TrainingModifierRow>> {
  if (!playerIds.length) return new Map();
  const { data, error } = await sb
    .from("readiness_entries")
    .select("player_id, training_modifier")
    .eq("entry_date", date)
    .in("player_id", playerIds);
  if (error) throw error;
  return new Map(
    ((data ?? []) as Array<Record<string, unknown>>).map((row) => [
      String(row.player_id),
      { player_id: String(row.player_id), training_modifier: row.training_modifier },
    ]),
  );
}

export async function fetchCatapultRows(
  sb: AdminClient,
  playerIds: string[],
  date: string,
): Promise<{
  normalized: Map<string, ReturnType<typeof normalizeCatapultDailyLoadRow>[]>;
  raw: Map<string, Array<Record<string, unknown>>>;
}> {
  if (!playerIds.length) return { normalized: new Map(), raw: new Map() };
  const start = new Date(`${date}T00:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() - 28);
  const startDate = start.toISOString().slice(0, 10);
  // Team-wide 28d × dual source → page past the 1000-row cap.
  const data = await fetchAllPages<Record<string, unknown>>((from, to) =>
    sb.from("player_external_load_daily")
      .select("*")
      .in("source", ["catapult", "manual"])
      .in("player_id", playerIds)
      .gte("date", startDate)
      .lte("date", date)
      .order("date", { ascending: true })
      .range(from, to) as unknown as PromiseLike<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>,
  );

  const normalizedByPlayer = new Map<string, ReturnType<typeof normalizeCatapultDailyLoadRow>[]>();
  const rawByPlayer = new Map<string, Array<Record<string, unknown>>>();
  for (const rawRow of (data ?? []) as Array<Record<string, unknown>>) {
    const pid = String(rawRow.player_id ?? "");
    if (!pid) continue;
    const rawList = rawByPlayer.get(pid) ?? [];
    rawList.push(rawRow);
    rawByPlayer.set(pid, rawList);
    const normalized = normalizeCatapultDailyLoadRow(rawRow);
    if (!normalized) continue;
    const list = normalizedByPlayer.get(normalized.playerId) ?? [];
    list.push(normalized);
    normalizedByPlayer.set(normalized.playerId, list);
  }
  return { normalized: normalizedByPlayer, raw: rawByPlayer };
}

export async function fetchRpeAcwrForPlayers(
  sb: AdminClient,
  playerIds: string[],
  date: string,
): Promise<Map<string, RpeAcwrInput | null>> {
  if (!playerIds.length) return new Map();
  const start = new Date(`${date}T00:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() - 27);
  const startDate = start.toISOString().slice(0, 10);
  const { data, error } = await sb
    .from("session_rpe_entries")
    .select("player_id, session_date, session_load, is_imputed")
    .in("player_id", playerIds)
    .gte("session_date", startDate)
    .lte("session_date", date)
    .order("session_date", { ascending: true });
  if (error) return new Map();

  const rowsByPlayer = new Map<string, Array<{ session_date: string; session_load: number | null; is_imputed?: boolean | null }>>();
  for (const raw of (data ?? []) as Array<Record<string, unknown>>) {
    const pid = String(raw.player_id ?? "");
    const list = rowsByPlayer.get(pid) ?? [];
    list.push({
      session_date: String(raw.session_date ?? ""),
      session_load: raw.session_load != null ? Number(raw.session_load) : null,
      is_imputed: raw.is_imputed as boolean | null | undefined,
    });
    rowsByPlayer.set(pid, list);
  }

  const result = new Map<string, RpeAcwrInput | null>();
  for (const pid of playerIds) {
    const rows = rowsByPlayer.get(pid) ?? [];
    result.set(pid, computeRpeAcwrFromRows(rows, date));
  }
  return result;
}

export async function fetchTeamRpeForDate(
  sb: AdminClient,
  playerIds: string[],
  date: string,
): Promise<Map<string, number>> {
  if (!playerIds.length) return new Map();
  const { data, error } = await sb
    .from("session_rpe_entries")
    .select("player_id, session_load, is_imputed")
    .eq("session_date", date)
    .in("player_id", playerIds)
    .or("is_imputed.is.null,is_imputed.eq.false");
  if (error) return new Map();
  const out = new Map<string, number>();
  for (const raw of (data ?? []) as Array<Record<string, unknown>>) {
    const pid = String(raw.player_id ?? "");
    const v = raw.session_load != null ? Number(raw.session_load) : null;
    if (pid && Number.isFinite(v)) out.set(pid, v as number);
  }
  return out;
}

export async function fetchYesterdayContext(
  sb: AdminClient,
  teamId: string,
  date: string,
): Promise<Record<string, unknown> | null> {
  const yday = (() => {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  })();
  const { data } = await sb
    .from("v_team_session_context")
    .select("*")
    .eq("team_id", teamId)
    .eq("session_date", yday)
    .maybeSingle();
  return (data as Record<string, unknown> | null) ?? null;
}

export async function fetchMdContext(
  sb: AdminClient,
  teamId: string,
  date: string,
): Promise<string | null> {
  const { data } = await sb
    .from("v_player_session_today_v2")
    .select("md_day_resolved")
    .eq("team_id", teamId)
    .eq("day_date", date)
    .limit(1)
    .maybeSingle();
  const md = (data as { md_day_resolved?: string | null } | null)?.md_day_resolved;
  return md ? String(md) : null;
}

export async function fetchWhoopSnapshots(
  sb: AdminClient,
  playerIds: string[],
): Promise<Map<string, NormalizedMonitoringSnapshot | null>> {
  if (!playerIds.length) return new Map();
  // The Whoop snapshot helper currently expects a per-player call. Map in
  // parallel with a small concurrency cap.
  const out = new Map<string, NormalizedMonitoringSnapshot | null>();
  await Promise.all(
    playerIds.map(async (pid) => {
      try {
        const { data } = await sb
          .from("monitoring_snapshots_normalized")
          .select("*")
          .eq("player_id", pid)
          .eq("provider", "WHOOP")
          .order("date", { ascending: false })
          .limit(1)
          .maybeSingle();
        out.set(pid, (data as NormalizedMonitoringSnapshot | null) ?? null);
      } catch {
        out.set(pid, null);
      }
    }),
  );
  return out;
}

export async function fetchVbtDataForPlayers(
  sb: AdminClient,
  playerIds: string[],
  date: string,
  teamId: string,
): Promise<Map<string, { today: VbtSessionRow[]; history: VbtSessionRow[]; referenceExercise: string } | null>> {
  if (!playerIds.length) return new Map();
  const start = new Date(`${date}T00:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() - 28);
  const startDate = start.toISOString().slice(0, 10);
  // Reference exercise lookup at the team level (single query)
  const { data: refRow } = await sb
    .from("team_settings")
    .select("vbt_reference_exercise")
    .eq("team_id", teamId)
    .maybeSingle();
  const referenceExercise =
    (refRow as { vbt_reference_exercise?: string | null } | null)?.vbt_reference_exercise || "back_squat";

  const { data } = await sb
    .from("vbt_sessions")
    .select("*")
    .in("player_id", playerIds)
    .gte("session_date", startDate)
    .lte("session_date", date);

  const out = new Map<string, { today: VbtSessionRow[]; history: VbtSessionRow[]; referenceExercise: string } | null>();
  const byPlayer = new Map<string, VbtSessionRow[]>();
  for (const row of (data ?? []) as VbtSessionRow[]) {
    const pid = String((row as unknown as { player_id: string }).player_id);
    const list = byPlayer.get(pid) ?? [];
    list.push(row);
    byPlayer.set(pid, list);
  }
  for (const pid of playerIds) {
    const rows = byPlayer.get(pid) ?? [];
    const today = rows.filter((r) => String((r as unknown as { session_date: string }).session_date) === date);
    const history = rows.filter((r) => String((r as unknown as { session_date: string }).session_date) < date);
    out.set(pid, today.length > 0 ? { today, history, referenceExercise } : null);
  }
  return out;
}

export async function fetchWellnessBaselines(
  sb: AdminClient,
  playerIds: string[],
): Promise<Map<string, Map<string, AthleteMetricBaseline>>> {
  const out = new Map<string, Map<string, AthleteMetricBaseline>>();
  if (!playerIds.length) return out;
  const { data } = await sb
    .from("athlete_metric_baselines")
    .select("player_id, metric_key, n_observations, mean, sd, cv, median, window_days, status, computed_at")
    .in("player_id", playerIds)
    .in("metric_key", ["wellness.sleep_quality", "wellness.muscle_soreness"]);
  for (const row of (data ?? []) as AthleteMetricBaseline[]) {
    const pid = String(row.player_id);
    if (!out.has(pid)) out.set(pid, new Map());
    out.get(pid)!.set(row.metric_key, row);
  }
  return out;
}

// ─── Engine pipeline (per-player) ───────────────────────────────────────────

export async function buildPlayerSource(args: {
  row: CoachRow;
  date: string;
  teamId: string;
  tmRaw: unknown;
  catapultRows: ReturnType<typeof normalizeCatapultDailyLoadRow>[];
  rawCatapultRows: Array<Record<string, unknown>>;
  rpeAcwr: RpeAcwrInput | null;
  teamRpeValues: number[];
  ydayContext: Record<string, unknown> | null;
  mdDay: string | null;
  whoopSnapshot?: NormalizedMonitoringSnapshot | null;
  vbtData?: { today: VbtSessionRow[]; history: VbtSessionRow[]; referenceExercise: string } | null;
  indoorMode?: boolean;
  sportType?: "football" | "basketball";
  wellnessBaselines?: Map<string, AthleteMetricBaseline> | null;
  recentDecisions?: RecentDecision[] | null;
  signalTrend?: SignalTrend | null;
}): Promise<CoachCommandPlayerSource & { rpeDiscrepancy: RpeDiscrepancyResult; vbtReadiness: VbtReadinessResult | null }> {
  const tm = normalizeTrainingModifier(args.tmRaw);
  const zToday = extractZ(tm);
  const yZ = extractYesterdayZ(tm);
  const dz = zToday != null && yZ != null ? zToday - yZ : null;
  const catapultContext = buildCatapultReadinessContextFromRows({
    rows: args.catapultRows.filter((row): row is NonNullable<typeof row> => row != null),
    date: args.date,
    indoorMode: args.indoorMode,
    sportType: args.sportType,
  });
  const externalToday = catapultContext.today;

  const catRows = args.catapultRows.filter((row): row is NonNullable<typeof row> => row != null);
  const yesterdayDate = (() => { const d = new Date(`${args.date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); })();
  const twoDaysAgoDate = (() => { const d = new Date(`${args.date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 2); return d.toISOString().slice(0, 10); })();
  const ydayCtx = buildCatapultReadinessContextFromRows({ rows: catRows, date: yesterdayDate, indoorMode: args.indoorMode, sportType: args.sportType });
  const twoDayCtx = buildCatapultReadinessContextFromRows({ rows: catRows, date: twoDaysAgoDate, indoorMode: args.indoorMode, sportType: args.sportType });
  const residualDecelResult = computeResidualDecel(
    catapultContext.signals.decelBurdenScore,
    ydayCtx.signals.decelBurdenScore,
    twoDayCtx.signals.decelBurdenScore,
  );

  const todayGpsRow = catapultContext.today;
  const recentHidRows = catRows.filter((row) => row.date < args.date).slice(-7);
  const hidTrendResult = computeHidTrend(recentHidRows, todayGpsRow);

  const acwrValue = toFinite((tm?.acwr as unknown) ?? ((tm?.load as Record<string, unknown> | undefined)?.acwr as unknown));
  const volatilityValue = toFinite((tm?.pi as Record<string, unknown> | undefined)?.volatility);
  const hrvValue = toFinite(tm?.hrv);
  const hrvChangePctValue = toFinite(tm?.hrv_change_pct);
  const lightAteState = deriveLightAteState(args.row);

  const snapshot = buildDailyAthleteSnapshot({
    athleteId: String(args.row.player_id),
    date: args.date,
    manual: {
      id: typeof args.row.readiness_entry_id === "string" ? args.row.readiness_entry_id : null,
      totalScore: toFinite(args.row.total_score),
      soreness: toFinite(args.row.muscle_soreness),
      stress: toFinite(args.row.stress_mood),
      mood: toFinite(args.row.stress_mood),
      sleepQuality: toFinite(args.row.sleep_quality),
      motivation: toFinite(args.row.fatigue_energy),
      completed: toFinite(args.row.total_score) != null,
      sourceDate: args.date,
    },
    load: {
      zScore: zToday,
      deltaZ: dz,
      acuteLoad: toInt(args.ydayContext?.hsr_m),
      acwr: acwrValue,
      sessionRpeLoad: toFinite(tm?.session_load),
      volatility5d: volatilityValue,
      sourceDate: args.date,
    },
    context: {
      weekSetupLabel: typeof args.row.md_day === "string" ? args.row.md_day : args.mdDay,
      expectedSessionType: typeof args.row.planned_day_type === "string" ? args.row.planned_day_type : null,
      rehab: false,
      returnToPlay: false,
      sourceDate: args.date,
    },
    externalLoad: {
      totalDistance: externalToday?.totalDistance ?? null,
      highSpeedDistance: externalToday?.hirDist ?? null,
      sprintDistance: externalToday?.velocityBand6TotalDistance ?? null,
      accelerations: externalToday?.accelerations ?? externalToday?.totalAccelerations ?? null,
      decelerations: externalToday?.decelerations ?? externalToday?.totalDecelerations ?? null,
      playerLoad: externalToday?.playerLoad ?? null,
      maxVelocity: externalToday?.maxVelocity ?? null,
      playerLoad7DayAverage: catapultContext.baseline.acute7d.playerLoad / 7,
      sprintDistance7DayAverage: catapultContext.baseline.chronic28dAvg.band6Distance,
      source: externalToday ? "catapult" : null,
      sourceDate: args.date,
    },
    whoop: args.whoopSnapshot ? {
      snapshot: args.whoopSnapshot,
      connected: true,
      lastSyncAt: args.whoopSnapshot.date ?? null,
      sourceDate: args.whoopSnapshot.date ?? args.date,
    } : undefined,
  });

  const [valdReadinessAdjustment, valdDailySnapshot, valdInjurySignals] = await Promise.all([
    getValdReadinessAdjustment(args.teamId, String(args.row.player_id), args.date).catch(() => null),
    getValdDailySnapshot(args.teamId, String(args.row.player_id), args.date).catch(() => null),
    getValdInjuryRiskSignals(args.teamId, String(args.row.player_id), args.date).catch(() => null),
  ]);

  const readinessDecision = buildExplainableReadinessDecision({
    playerId: String(args.row.player_id),
    playerName: String(args.row.full_name ?? ""),
    date: args.date,
    dailySnapshot: snapshot,
    readinessScore: toFinite(args.row.total_score) ?? undefined,
    checkinScore: toFinite(args.row.total_score) ?? undefined,
    zScore: zToday ?? undefined,
    deltaZ: dz ?? undefined,
    volatility: volatilityValue ?? undefined,
    sleepScore: toFinite(args.row.sleep_quality) ?? undefined,
    hrvScore: hrvValue ?? undefined,
    hrvChangePct: hrvChangePctValue ?? undefined,
    acuteLoad: toInt(args.ydayContext?.hsr_m) ?? undefined,
    acwr: acwrValue ?? undefined,
    durationMinutes: toFinite(args.ydayContext?.duration_min) ?? undefined,
    sorenessScore: toFinite(args.row.muscle_soreness) ?? undefined,
    sorenessFlag: typeof toFinite(args.row.muscle_soreness) === "number" ? (toFinite(args.row.muscle_soreness) ?? 4) <= 2 : undefined,
    highSpeedRunning: toInt(args.ydayContext?.hsr_m) ?? undefined,
    maxVelocityPct: toFinite(args.ydayContext?.max_velocity_pct) ?? undefined,
    gpsSpike:
      String(args.ydayContext?.intensity ?? "").toUpperCase() !== "OFF" &&
      (toInt(args.ydayContext?.hsr_m) ?? 0) >= 1000,
    recentYellowDays: toFinite(tm?.recent_yellow_days) ?? undefined,
    recentRedDays: toFinite(tm?.recent_red_days) ?? undefined,
    lightAteState,
    catapultDailyLoad: externalToday ?? undefined,
    catapultBaseline: catapultContext.baseline,
    catapultSignals: catapultContext.signals,
    externalLoadState: catapultContext.signals.externalLoadState,
    catapultReadinessModifier: catapultContext.modifier,
    valdDailySnapshot,
    valdReadinessAdjustment,
  });

  const mliSourceRowsEarly = toMechanicalLoadSourceRows(args.rawCatapultRows);
  const mliResultEarly = mliSourceRowsEarly.length > 0 ? computeMechanicalLoad(mliSourceRowsEarly, args.date) : null;
  const metaSourceRowsEarly = toMetabolicLoadSourceRows(args.rawCatapultRows);
  const metaResultEarly = metaSourceRowsEarly.length > 0
    ? computeMetabolicLoad(metaSourceRowsEarly, args.date, mliResultEarly?.mli ?? null)
    : null;

  const globalFatigueFlag =
    (mliResultEarly?.mli != null && mliResultEarly.mli >= 65) &&
    (metaResultEarly?.metabolicLoadScore != null && metaResultEarly.metabolicLoadScore >= 65);

  const sleepValue = toFinite(args.row.sleep_quality);
  const sorenessValue = toFinite(args.row.muscle_soreness);
  const sleepBaseline = args.wellnessBaselines?.get("wellness.sleep_quality") ?? null;
  const sorenessBaseline = args.wellnessBaselines?.get("wellness.muscle_soreness") ?? null;
  const sleepFlag = sleepValue != null
    ? flagAgainstBaseline(sleepValue, sleepBaseline, "wellness.sleep_quality")
    : null;
  const sorenessFlagPersonal = sorenessValue != null
    ? flagAgainstBaseline(sorenessValue, sorenessBaseline, "wellness.muscle_soreness")
    : null;
  const sleepZ = sleepFlag?.z ?? null;
  const sorenessZ = sorenessFlagPersonal?.z ?? null;
  const sleepChronicLow = !!sleepBaseline && sleepBaseline.status !== "insufficient_data" && sleepBaseline.mean <= 2.5;
  const sorenessChronicLow = !!sorenessBaseline && sorenessBaseline.status !== "insufficient_data" && sorenessBaseline.mean <= 2.5;

  const injuryRiskDecision = buildInjuryRiskDecision(
    {
      acwr: acwrValue ?? undefined,
      zScore: zToday ?? undefined,
      deltaZ: dz ?? undefined,
      volatility: volatilityValue ?? undefined,
      recentYellowDays: toFinite(tm?.recent_yellow_days) ?? undefined,
      recentRedDays: toFinite(tm?.recent_red_days) ?? undefined,
      highSpeedRunning: toInt(args.ydayContext?.hsr_m) ?? undefined,
      maxVelocityPct: toFinite(args.ydayContext?.max_velocity_pct) ?? undefined,
      sleepScore: sleepValue ?? undefined,
      hrvChangePct: hrvChangePctValue ?? undefined,
      sorenessScore: sorenessValue ?? undefined,
      sorenessFlag: typeof sorenessValue === "number" ? (sorenessValue ?? 4) <= 2 : undefined,
      sleepZ: sleepZ ?? undefined,
      sorenessZ: sorenessZ ?? undefined,
      sleepChronicLow,
      sorenessChronicLow,
      painFlag: false,
      gpsSpike:
        String(args.ydayContext?.intensity ?? "").toUpperCase() !== "OFF" &&
        (toInt(args.ydayContext?.hsr_m) ?? 0) >= 1000,
      valdHamstringRiskFlag: valdInjurySignals?.hamstringRiskFlag ?? false,
      valdGroinRiskFlag: valdInjurySignals?.groinRiskFlag ?? false,
      valdNeuromuscularRiskFlag: valdInjurySignals?.neuromuscularRiskFlag ?? false,
      valdReasons: valdInjurySignals?.reasons ?? [],
      globalFatigueFlag,
      residualMliBand: mliResultEarly?.residualBand ?? undefined,
      decelBurdenScore: catapultContext.signals.decelBurdenScore ?? undefined,
      residualDecelBand: residualDecelResult.residualDecelBand ?? undefined,
      accelDecelRatio: catapultContext.signals.accelDecelRatio ?? undefined,
      hidDeclinePct: hidTrendResult.hidDeclinePct ?? undefined,
      hidFatigueFlag: hidTrendResult.hidFatigueFlag,
    },
    readinessDecision,
  );

  const compositeLoad = computeCompositeLoadConcern({
    rpeAcwr: args.rpeAcwr,
    neuromuscularBurdenScore: catapultContext.signals.neuromuscularBurdenScore,
    externalLoadState: catapultContext.signals.externalLoadState,
    residualMli: mliResultEarly?.residualMli ?? null,
    metabolicLoadScore: metaResultEarly?.metabolicLoadScore ?? null,
    metabolicConfidence: metaResultEarly?.confidence ?? null,
    decelBurdenScore: catapultContext.signals.decelBurdenScore ?? null,
    residualDecel: residualDecelResult.residualDecel,
    accelDecelRatio: catapultContext.signals.accelDecelRatio ?? null,
    hidFatigueFlag: hidTrendResult.hidFatigueFlag,
    hidDeclinePct: hidTrendResult.hidDeclinePct,
  });

  const playerRpeToday = toFinite(tm?.rpe) ?? toFinite(tm?.session_rpe) ?? null;
  const rpeDiscrepancy = computeRpeDiscrepancy({
    playerRpe: playerRpeToday,
    teamRpeValues: args.teamRpeValues,
    neuromuscularBurdenScore: catapultContext.signals.neuromuscularBurdenScore ?? null,
    externalLoadState: catapultContext.signals.externalLoadState ?? "unknown",
  });

  const vbtReadiness: VbtReadinessResult | null = args.vbtData?.today.length
    ? computeVbtReadiness(args.vbtData.today, args.vbtData.history, args.vbtData.referenceExercise)
    : null;

  const loadSummaryParts = [compositeLoad.summary];
  if (compositeLoad.escalationReasons.length > 0) {
    loadSummaryParts.push(...compositeLoad.escalationReasons);
  }

  const athleteDecision = buildAthleteDecision({
    snapshot,
    readinessDecision,
    injuryDecision: injuryRiskDecision,
    neural: null,
    load: {
      concernLevel: compositeLoad.concernLevel,
      summary: loadSummaryParts.join(" | "),
    },
    hardBlock: false,
    recentDecisions: args.recentDecisions ?? null,
    signalTrend: args.signalTrend ?? null,
  });

  // Persist verdict to athlete_decision_history (fire-and-forget).
  void recordPlayerDecision({
    decision: athleteDecision,
    teamId: args.teamId ?? null,
    inputSignals: {
      readinessSten: readinessDecision?.supportingMetrics?.zScore != null
        ? Math.max(1, Math.min(10, Math.round(2 * readinessDecision.supportingMetrics.zScore + 5.5)))
        : null,
      readinessZ: zToday,
      deltaZ: dz,
      acwr: acwrValue,
      sleepZ,
      sorenessZ,
      sleepChronicLow,
      sorenessChronicLow,
      indoorBand: null,
      decelOverallFlag: null,
      compositeConcern: compositeLoad.concernLevel,
      injuryRisk: injuryRiskDecision?.injuryRiskLevel ?? null,
    },
  });

  const isProtocolDay = args.mdDay === "MD-2" || args.mdDay === "MD+1";
  const neuromuscularConcern =
    valdDailySnapshot?.neuromuscularFlag === "yellow" ||
    valdDailySnapshot?.neuromuscularFlag === "red";
  const cmjStaleOrMissing =
    !valdDailySnapshot ||
    valdDailySnapshot.cmjFreshnessStatus === "stale" ||
    valdDailySnapshot.cmjFreshnessStatus === "missing";
  const cmjRequired = isProtocolDay || neuromuscularConcern || cmjStaleOrMissing;

  return {
    athleteId: String(args.row.player_id),
    athleteName: String(args.row.full_name ?? ""),
    readinessScore: toFinite(args.row.total_score),
    cmjRequired,
    loadAlerts: compositeLoad.escalationReasons,
    fatigueType: compositeLoad.fatigueType,
    rpeDiscrepancy,
    vbtReadiness,
    recommendation:
      athleteDecision.trainingRecommendation ??
      {
        state: athleteDecision.athleteState,
        sessionMode: athleteDecision.sessionMode,
        loadAdjustment: null,
        constraints: [],
        focus: [],
        riskFlags: [],
        explanationFactors: [],
        confidence: {
          score: athleteDecision.decisionConfidence,
          band: athleteDecision.decisionConfidence >= 0.8 ? "high" : athleteDecision.decisionConfidence >= 0.6 ? "medium" : "low",
        },
        coachSummary: athleteDecision.explanationLines[0] ?? "Decision available.",
        dataQuality: {
          requiresManualReview: athleteDecision.flags.lowDataConfidence,
        },
      },
    counterfactuals: athleteDecision.counterfactuals ?? [],
    streakContext: athleteDecision.streakContext ?? null,
    forecast: athleteDecision.forecast ?? null,
  };
}

// ─── High-level convenience: assemble inputs + run engine for one player ────

/**
 * One-shot per-player decision builder. Fetches all the same inputs as the
 * coach team-decisions endpoint but for a single playerId, then runs the
 * shared engine. This is what /api/player/decision calls; both ends receive
 * the same recommendation.recommendation, athleteDecision verdict, etc.
 */
export async function buildOnePlayerDecision(args: {
  sb: AdminClient;
  teamId: string;
  playerId: string;
  date: string;
}): Promise<(CoachCommandPlayerSource & { rpeDiscrepancy: RpeDiscrepancyResult; vbtReadiness: VbtReadinessResult | null }) | null> {
  const { sb, teamId, playerId, date } = args;

  // Team settings (indoor mode + sport type)
  const { data: teamSettingsRow } = await sb
    .from("team_settings")
    .select("indoor_mode, sport_type")
    .eq("team_id", teamId)
    .maybeSingle();
  const indoorMode = (teamSettingsRow as { indoor_mode?: boolean | null } | null)?.indoor_mode === true;
  const sportType = ((teamSettingsRow as { sport_type?: string | null } | null)?.sport_type === "basketball" ? "basketball" : "football") as "football" | "basketball";
  const effectiveIndoorMode = sportType === "basketball" ? true : indoorMode;

  const playerIds = [playerId];

  const [
    rows,
    catapultData,
    tmByPlayer,
    rpeAcwrByPlayer,
    teamRpeMap,
    ydayContext,
    mdDay,
    whoopByPlayer,
    vbtByPlayer,
    wellnessBaselinesByPlayer,
    recentDecisionsByPlayer,
    signalTrendByPlayer,
  ] = await Promise.all([
    fetchCoachRowsForPlayers(sb, teamId, date, playerIds),
    fetchCatapultRows(sb, playerIds, date),
    fetchTrainingModifiers(sb, playerIds, date),
    fetchRpeAcwrForPlayers(sb, playerIds, date),
    // Use the FULL team RPE for the rpeDiscrepancy denominator — otherwise we
    // can't compare a player to the squad mean.
    (async () => {
      const { data: roster } = await sb
        .from("players")
        .select("id")
        .eq("team_id", teamId);
      const ids = ((roster ?? []) as Array<{ id: string }>).map((r) => r.id);
      return fetchTeamRpeForDate(sb, ids, date);
    })(),
    fetchYesterdayContext(sb, teamId, date),
    fetchMdContext(sb, teamId, date),
    fetchWhoopSnapshots(sb, playerIds),
    fetchVbtDataForPlayers(sb, playerIds, date, teamId),
    fetchWellnessBaselines(sb, playerIds),
    fetchRecentDecisions(playerIds, 7),
    fetchScoreTrendByPlayer(sb, playerIds, date),
  ]);

  if (!rows.length) return null;
  const row = rows[0];

  return await buildPlayerSource({
    row,
    date,
    teamId,
    tmRaw: tmByPlayer.get(playerId)?.training_modifier ?? null,
    catapultRows: (catapultData.normalized.get(playerId) ?? []).filter(Boolean),
    rawCatapultRows: catapultData.raw.get(playerId) ?? [],
    rpeAcwr: rpeAcwrByPlayer.get(playerId) ?? null,
    // Exclude the player themselves from teamRpeValues so the discrepancy
    // metric reflects "this player vs the rest" not "this player vs everyone".
    teamRpeValues: Array.from(teamRpeMap.entries())
      .filter(([pid]) => pid !== playerId)
      .map(([, rpe]) => rpe),
    ydayContext,
    mdDay,
    whoopSnapshot: whoopByPlayer.get(playerId) ?? null,
    vbtData: vbtByPlayer.get(playerId) ?? null,
    indoorMode: effectiveIndoorMode,
    sportType,
    wellnessBaselines: wellnessBaselinesByPlayer.get(playerId) ?? null,
    recentDecisions: recentDecisionsByPlayer.get(playerId) ?? null,
    signalTrend: signalTrendByPlayer.get(playerId) ?? null,
  });
}
