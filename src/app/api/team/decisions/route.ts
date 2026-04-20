import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { buildTeamDecisionResponse, serializeTeamDecisionResponse, type CoachCommandPlayerSource } from "@/lib/micropulse/coachCommand";
import { buildExplainableReadinessDecision } from "@/lib/micropulse/readiness";
import { buildInjuryRiskDecision } from "@/lib/micropulse/injuryRisk";
import { buildAthleteDecision } from "@/lib/micropulse/domain/decision";
import { buildDailyAthleteSnapshot } from "@/lib/micropulse/domain/snapshot";
import { buildCatapultReadinessContextFromRows, computeHidTrend, computeResidualDecel, normalizeCatapultDailyLoadRow } from "@/lib/micropulse/externalLoad";
import { getValdDailySnapshot, getValdInjuryRiskSignals, getValdReadinessAdjustment } from "@/lib/micropulse/vald";
import { computeCompositeLoadConcern, computeRpeAcwrFromRows, type RpeAcwrInput } from "@/lib/micropulse/compositeLoad";
import { computeRpeDiscrepancy, type RpeDiscrepancyResult } from "@/lib/micropulse/rpeDiscrepancy";
import { computeVbtReadiness, vbtReadinessToScore, type VbtReadinessResult, type VbtSessionRow } from "@/lib/micropulse/vbtReadiness";
import { computeMechanicalLoad, type MechanicalLoadSourceRow } from "@/lib/micropulse/mechanicalLoad";
import { computeMetabolicLoad, type MetabolicLoadSourceRow } from "@/lib/micropulse/metabolicLoad";
import type { NormalizedMonitoringSnapshot } from "@/lib/integrations/shared/types";

export const runtime = "nodejs";

type AuthProfile = {
  role: string | null;
  team_id: string | null;
};

type CoachRow = Record<string, unknown>;

type TrainingModifierRow = {
  player_id: string;
  training_modifier: unknown;
};

function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

function getAdminClient() {
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
}

function todayInReykjavik(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Atlantic/Reykjavik" }).format(new Date());
}

function ydayOf(date: string): string {
  const base = new Date(`${date}T00:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() - 1);
  return base.toISOString().slice(0, 10);
}

function normalizeTrainingModifier(value: unknown): Record<string, unknown> | null {
  if (value == null) return null;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  return typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function toFinite(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toInt(value: unknown): number | null {
  const parsed = toFinite(value);
  return parsed == null ? null : Math.round(parsed);
}

function extractZ(tmRaw: unknown): number | null {
  const tm = normalizeTrainingModifier(tmRaw);
  return toFinite(tm?.pi && typeof tm.pi === "object" ? (tm.pi as Record<string, unknown>).z : null)
    ?? toFinite(tm?.pi && typeof tm.pi === "object" ? (tm.pi as Record<string, unknown>).z_today : null)
    ?? toFinite(tm?.baseline_z)
    ?? null;
}

function extractYesterdayZ(tmRaw: unknown): number | null {
  const tm = normalizeTrainingModifier(tmRaw);
  const pi = tm?.pi && typeof tm.pi === "object" ? (tm.pi as Record<string, unknown>) : null;
  const explicit = toFinite(pi?.yesterday_z);
  if (explicit != null) return explicit;
  const z = toFinite(pi?.z);
  const delta = toFinite(pi?.delta_z);
  return z != null && delta != null ? z - delta : null;
}

function zToSten(z: number | null): number | null {
  if (typeof z !== "number" || !Number.isFinite(z)) return null;
  return Math.max(1, Math.min(10, Math.round(z * 2 + 5.5)));
}

function deriveLightAteState(row: CoachRow): "GREEN" | "YELLOW" | "RED" | "GRAY" {
  const raw = String(row.final_flag ?? row.final_color ?? "").toUpperCase();
  if (raw === "RED") return "RED";
  if (raw === "YELLOW") return "YELLOW";
  if (raw === "GREEN" || raw === "GREEN_PLUS") return "GREEN";
  return "GRAY";
}

async function requireCoachContext(req: Request): Promise<{ teamId: string }> {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) throw new Error("Unauthorized");

  const sb = getAdminClient();
  const { data: userRes, error: userErr } = await sb.auth.getUser(token);
  if (userErr || !userRes?.user?.id) throw new Error("Unauthorized");

  const { data: prof, error: profErr } = await sb
    .from("profiles")
    .select("role, team_id")
    .eq("id", userRes.user.id)
    .maybeSingle();
  if (profErr) throw new Error(profErr.message);

  const profile = prof as AuthProfile | null;
  const role = String(profile?.role ?? "").toUpperCase();
  if (!(role === "COACH" || role === "ADMIN" || role === "STAFF")) throw new Error("Forbidden");
  if (!profile?.team_id) throw new Error("No team context");
  return { teamId: profile.team_id };
}

async function fetchCoachRows(sb: ReturnType<typeof getAdminClient>, teamId: string, date: string): Promise<CoachRow[]> {
  const query = sb
    .from("v_coach_readiness_today_v8")
    .select("*")
    .eq("entry_date", date)
    .eq("team_id", teamId)
    .order("total_score", { ascending: true })
    .order("full_name", { ascending: true });

  const { data, error } = await query;
  if (!error) return (data ?? []) as CoachRow[];

  const fallback = await sb.from("v_coach_readiness_today_v8").select("*").eq("entry_date", date).order("total_score", { ascending: true }).order("full_name", { ascending: true });
  if (fallback.error) throw fallback.error;
  return ((fallback.data ?? []) as CoachRow[]).filter((row) => String(row.team_id ?? "") === teamId);
}

async function fetchTrainingModifiers(
  sb: ReturnType<typeof getAdminClient>,
  playerIds: string[],
  date: string
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
    ])
  );
}

async function fetchCatapultRows(
  sb: ReturnType<typeof getAdminClient>,
  playerIds: string[],
  date: string
): Promise<{
  normalized: Map<string, ReturnType<typeof normalizeCatapultDailyLoadRow>[]>;
  raw: Map<string, Array<Record<string, unknown>>>;
}> {
  if (!playerIds.length) return { normalized: new Map(), raw: new Map() };
  const start = new Date(`${date}T00:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() - 28);
  const startDate = start.toISOString().slice(0, 10);
  const { data, error } = await sb
    .from("player_external_load_daily")
    .select("*")
    .in("source", ["catapult", "manual"])
    .in("player_id", playerIds)
    .gte("date", startDate)
    .lte("date", date)
    .order("date", { ascending: true });
  if (error) throw error;

  const normalizedByPlayer = new Map<string, ReturnType<typeof normalizeCatapultDailyLoadRow>[]>();
  const rawByPlayer = new Map<string, Array<Record<string, unknown>>>();
  for (const rawRow of (data ?? []) as Array<Record<string, unknown>>) {
    const pid = String(rawRow.player_id ?? "");
    if (!pid) continue;

    // Store raw row for MLI/Metabolic computation
    const rawList = rawByPlayer.get(pid) ?? [];
    rawList.push(rawRow);
    rawByPlayer.set(pid, rawList);

    // Store normalized row for existing GPS pipeline
    const normalized = normalizeCatapultDailyLoadRow(rawRow);
    if (!normalized) continue;
    const list = normalizedByPlayer.get(normalized.playerId) ?? [];
    list.push(normalized);
    normalizedByPlayer.set(normalized.playerId, list);
  }
  return { normalized: normalizedByPlayer, raw: rawByPlayer };
}

async function fetchRpeAcwrForPlayers(
  sb: ReturnType<typeof getAdminClient>,
  playerIds: string[],
  date: string
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

  // Group rows by player
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

/**
 * Fetch all real (non-imputed) RPE submissions for a team on a given date.
 * Returns a map of playerId → rpe value, used to compute team median for
 * discrepancy analysis.
 */
async function fetchTeamRpeForDate(
  sb: ReturnType<typeof getAdminClient>,
  playerIds: string[],
  date: string
): Promise<Map<string, number>> {
  if (!playerIds.length) return new Map();
  const { data, error } = await sb
    .from("session_rpe_entries")
    .select("player_id, rpe, is_imputed")
    .in("player_id", playerIds)
    .eq("session_date", date)
    .eq("is_imputed", false);
  if (error) return new Map();

  const result = new Map<string, number>();
  for (const raw of (data ?? []) as Array<Record<string, unknown>>) {
    const pid = String(raw.player_id ?? "");
    const rpe = raw.rpe != null ? Number(raw.rpe) : null;
    if (rpe != null && Number.isFinite(rpe) && !result.has(pid)) {
      result.set(pid, rpe);
    }
  }
  return result;
}

async function fetchYesterdayContext(
  sb: ReturnType<typeof getAdminClient>,
  teamId: string,
  date: string
): Promise<Record<string, unknown> | null> {
  const { data, error } = await sb
    .from("training_session_context")
    .select("hsr_m, acc_total, dec_total, total_distance_m, max_velocity_pct, intensity, duration_min")
    .eq("team_id", teamId)
    .eq("session_date", ydayOf(date))
    .maybeSingle();
  if (error) return null;
  return (data as Record<string, unknown> | null) ?? null;
}

async function fetchMdContext(
  sb: ReturnType<typeof getAdminClient>,
  teamId: string,
  date: string
): Promise<string | null> {
  const { data, error } = await sb
    .from("v_training_day_context_team")
    .select("md_day")
    .eq("team_id", teamId)
    .eq("date", date)
    .maybeSingle();
  if (error) return null;
  return (data as { md_day?: string | null } | null)?.md_day ?? null;
}

async function fetchWhoopSnapshots(
  sb: ReturnType<typeof getAdminClient>,
  playerIds: string[]
): Promise<Map<string, NormalizedMonitoringSnapshot>> {
  if (!playerIds.length) return new Map();
  try {
    const { data, error } = await sb
      .from("athlete_monitoring_snapshots")
      .select("athlete_id, date, recovery_score, hrv, resting_hr, respiratory_rate, sleep_performance, sleep_consistency, sleep_efficiency, total_sleep_millis, workout_strain, average_hr, max_hr, raw_payload_json")
      .eq("source", "whoop")
      .in("athlete_id", playerIds)
      .order("date", { ascending: false });

    if (error || !data) return new Map();

    // Keep only the most recent snapshot per player
    const map = new Map<string, NormalizedMonitoringSnapshot>();
    for (const row of data as Array<Record<string, unknown>>) {
      const athleteId = String(row.athlete_id ?? "");
      if (!map.has(athleteId)) {
        map.set(athleteId, {
          athleteId,
          source: "whoop",
          date: String(row.date ?? ""),
          recoveryScore: (row.recovery_score as number | null) ?? undefined,
          hrv: (row.hrv as number | null) ?? undefined,
          restingHr: (row.resting_hr as number | null) ?? undefined,
          respiratoryRate: (row.respiratory_rate as number | null) ?? undefined,
          sleepPerformance: (row.sleep_performance as number | null) ?? undefined,
          sleepConsistency: (row.sleep_consistency as number | null) ?? undefined,
          sleepEfficiency: (row.sleep_efficiency as number | null) ?? undefined,
          totalSleepMillis: (row.total_sleep_millis as number | null) ?? undefined,
          workoutStrain: (row.workout_strain as number | null) ?? undefined,
          averageHr: (row.average_hr as number | null) ?? undefined,
          maxHr: (row.max_hr as number | null) ?? undefined,
          raw: row.raw_payload_json,
        });
      }
    }
    return map;
  } catch {
    return new Map();
  }
}

/**
 * Fetch GymAware VBT sessions for a list of players: today + 28-day history.
 * Returns per-player: { today: VbtSessionRow[], history: VbtSessionRow[] }
 */
async function fetchVbtDataForPlayers(
  sb: ReturnType<typeof getAdminClient>,
  playerIds: string[],
  date: string,
  teamId: string,
): Promise<Map<string, { today: VbtSessionRow[]; history: VbtSessionRow[]; referenceExercise: string }>> {
  const result = new Map<string, { today: VbtSessionRow[]; history: VbtSessionRow[]; referenceExercise: string }>();
  if (!playerIds.length) return result;

  // Check if GymAware is configured for this team
  const { data: settings } = await sb
    .from("gymaware_settings")
    .select("reference_exercise, sync_enabled")
    .eq("team_id", teamId)
    .eq("sync_enabled", true)
    .maybeSingle();

  if (!settings) return result;

  const refExercise = settings.reference_exercise ?? "Trap Bar Deadlift";

  // Compute 28 days back from date
  const dateObj = new Date(`${date}T00:00:00Z`);
  const historyStart = new Date(dateObj);
  historyStart.setUTCDate(historyStart.getUTCDate() - 28);
  const historyStartStr = historyStart.toISOString().slice(0, 10);

  const { data: rows, error } = await sb
    .from("gymaware_vbt_sessions")
    .select("player_id, session_date, exercise_name, load_kg, mean_velocity, peak_velocity")
    .in("player_id", playerIds)
    .gte("session_date", historyStartStr)
    .lte("session_date", date);

  if (error || !rows) return result;

  for (const row of rows as Array<Record<string, unknown>>) {
    const pid = String(row.player_id ?? "");
    if (!pid) continue;

    if (!result.has(pid)) {
      result.set(pid, { today: [], history: [], referenceExercise: refExercise });
    }
    const entry = result.get(pid)!;
    const sessionRow: VbtSessionRow = {
      session_date: String(row.session_date ?? ""),
      exercise_name: String(row.exercise_name ?? ""),
      load_kg: typeof row.load_kg === "number" ? row.load_kg : null,
      mean_velocity: typeof row.mean_velocity === "number" ? row.mean_velocity : null,
      peak_velocity: typeof row.peak_velocity === "number" ? row.peak_velocity : null,
    };

    if (sessionRow.session_date === date) {
      entry.today.push(sessionRow);
    } else {
      entry.history.push(sessionRow);
    }
  }

  return result;
}

/**
 * Convert raw player_external_load_daily rows into MechanicalLoadSourceRow format.
 * Uses the same field mappings as the MLI API endpoint.
 */
function toMechanicalLoadSourceRows(rawRows: Array<Record<string, unknown>>): MechanicalLoadSourceRow[] {
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

/**
 * Convert raw player_external_load_daily rows into MetabolicLoadSourceRow format.
 * Uses the same field mappings as the Metabolic API endpoint.
 */
function toMetabolicLoadSourceRows(rawRows: Array<Record<string, unknown>>): MetabolicLoadSourceRow[] {
  return rawRows.map((r) => ({
    date: String(r.date ?? ""),
    metabolic_power: r.metabolic_power as number | null,
    metabolic_power_peak: r.metabolic_power_peak as number | null,
    high_metabolic_load_distance_m: r.high_metabolic_load_distance_m as number | null,
    time_above_hml_threshold_s: r.time_above_hml_threshold_s as number | null,
    metabolic_data_valid: (r.metabolic_data_valid as boolean | null) ?? false,
  }));
}

async function buildPlayerSource(args: {
  row: CoachRow;
  date: string;
  teamId: string;
  tmRaw: unknown;
  catapultRows: ReturnType<typeof normalizeCatapultDailyLoadRow>[];
  /** Raw DB rows for MLI/Metabolic computation (same source, different field extraction) */
  rawCatapultRows: Array<Record<string, unknown>>;
  rpeAcwr: RpeAcwrInput | null;
  /** RPE values from all OTHER players on the team today (non-imputed) */
  teamRpeValues: number[];
  ydayContext: Record<string, unknown> | null;
  mdDay: string | null;
  whoopSnapshot?: NormalizedMonitoringSnapshot | null;
  vbtData?: { today: VbtSessionRow[]; history: VbtSessionRow[]; referenceExercise: string } | null;
  indoorMode?: boolean;
  sportType?: "football" | "basketball";
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

  // ── Residual Decel Index (3-day weighted deceleration accumulation) ──
  // Compute decel burden for yesterday and 2 days ago from the same catapult rows
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

  // ── HID% Fatigue Trend (Harper et al. 2019) ──
  // Compare today's HID% against 7-day rolling average from catapult history.
  // Filter recent rows to exclude today so we compare against prior days.
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
    readinessScore: toFinite(args.row.readiness) ?? undefined,
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

  // ── Pre-compute MLI/Metabolic for injury risk (computed before compositeLoad) ──
  const mliSourceRowsEarly = toMechanicalLoadSourceRows(args.rawCatapultRows);
  const mliResultEarly = mliSourceRowsEarly.length > 0 ? computeMechanicalLoad(mliSourceRowsEarly, args.date) : null;
  const metaSourceRowsEarly = toMetabolicLoadSourceRows(args.rawCatapultRows);
  const metaResultEarly = metaSourceRowsEarly.length > 0
    ? computeMetabolicLoad(metaSourceRowsEarly, args.date, mliResultEarly?.mli ?? null)
    : null;

  // Global fatigue: both MLI ≥ 65 AND Metabolic ≥ 65
  const globalFatigueFlag =
    (mliResultEarly?.mli != null && mliResultEarly.mli >= 65) &&
    (metaResultEarly?.metabolicLoadScore != null && metaResultEarly.metabolicLoadScore >= 65);

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
      sleepScore: toFinite(args.row.sleep_quality) ?? undefined,
      hrvChangePct: hrvChangePctValue ?? undefined,
      sorenessScore: toFinite(args.row.muscle_soreness) ?? undefined,
      sorenessFlag: typeof toFinite(args.row.muscle_soreness) === "number" ? (toFinite(args.row.muscle_soreness) ?? 4) <= 2 : undefined,
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
      // Deceleration-specific (McBurnie et al. 2022)
      decelBurdenScore: catapultContext.signals.decelBurdenScore ?? undefined,
      residualDecelBand: residualDecelResult.residualDecelBand ?? undefined,
      accelDecelRatio: catapultContext.signals.accelDecelRatio ?? undefined,
      // HID% fatigue trend (Harper et al. 2019)
      hidDeclinePct: hidTrendResult.hidDeclinePct ?? undefined,
      hidFatigueFlag: hidTrendResult.hidFatigueFlag,
    },
    readinessDecision
  );

  // Reuse MLI/Metabolic already computed for injury risk
  const compositeLoad = computeCompositeLoadConcern({
    rpeAcwr: args.rpeAcwr,
    neuromuscularBurdenScore: catapultContext.signals.neuromuscularBurdenScore,
    externalLoadState: catapultContext.signals.externalLoadState,
    residualMli: mliResultEarly?.residualMli ?? null,
    metabolicLoadScore: metaResultEarly?.metabolicLoadScore ?? null,
    metabolicConfidence: metaResultEarly?.confidence ?? null,
    // Deceleration-specific inputs (McBurnie et al. 2022)
    decelBurdenScore: catapultContext.signals.decelBurdenScore ?? null,
    residualDecel: residualDecelResult.residualDecel,
    accelDecelRatio: catapultContext.signals.accelDecelRatio ?? null,
    // HID% fatigue trend (Harper et al. 2019)
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

  // VBT readiness from GymAware
  const vbtReadiness: VbtReadinessResult | null = args.vbtData?.today.length
    ? computeVbtReadiness(args.vbtData.today, args.vbtData.history, args.vbtData.referenceExercise)
    : null;

  // Build load summary with coach-facing escalation reasons
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
  });

  // CMJ required today if:
  // 1. Today is a high-load protocol day (MD-2 or MD+1)
  // 2. OR neuromuscular flag is yellow/red (reactive trigger)
  // 3. OR CMJ data is stale/missing (baseline maintenance, >7 days since last test)
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
    readinessScore: toFinite(args.row.readiness) ?? toFinite(args.row.total_score),
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
  };
}

export async function GET(req: Request) {
  try {
    const { teamId } = await requireCoachContext(req);
    const sb = getAdminClient();
    const url = new URL(req.url);
    const date = url.searchParams.get("date") || todayInReykjavik();

    const rows = await fetchCoachRows(sb, teamId, date);
    if (!rows.length) {
      return NextResponse.json(
        serializeTeamDecisionResponse(
          buildTeamDecisionResponse({
            date,
            players: [],
          })
        )
      );
    }

    const playerIds = rows.map((row) => String(row.player_id));

    // Fetch team settings (indoor_mode flag + sport_type)
    const { data: teamSettingsRow } = await sb
      .from("team_settings")
      .select("indoor_mode, sport_type")
      .eq("team_id", teamId)
      .maybeSingle();
    const indoorMode = teamSettingsRow?.indoor_mode === true;
    const sportType = (teamSettingsRow?.sport_type === "basketball" ? "basketball" : "football") as "football" | "basketball";
    // Basketball teams are always indoor regardless of toggle
    const effectiveIndoorMode = sportType === "basketball" ? true : indoorMode;

    const [catapultData, tmByPlayer, rpeAcwrByPlayer, teamRpeMap, ydayContext, mdDay, whoopByPlayer, vbtByPlayer] = await Promise.all([
      fetchCatapultRows(sb, playerIds, date),
      fetchTrainingModifiers(sb, playerIds, date),
      fetchRpeAcwrForPlayers(sb, playerIds, date),
      fetchTeamRpeForDate(sb, playerIds, date),
      fetchYesterdayContext(sb, teamId, date),
      fetchMdContext(sb, teamId, date),
      fetchWhoopSnapshots(sb, playerIds),
      fetchVbtDataForPlayers(sb, playerIds, date, teamId),
    ]);

    const players: CoachCommandPlayerSource[] = [];
    for (const row of rows) {
      try {
        players.push(
          await buildPlayerSource({
            row,
            date,
            teamId,
            tmRaw: tmByPlayer.get(String(row.player_id))?.training_modifier ?? null,
            catapultRows: (catapultData.normalized.get(String(row.player_id)) ?? []).filter(Boolean),
            rawCatapultRows: catapultData.raw.get(String(row.player_id)) ?? [],
            rpeAcwr: rpeAcwrByPlayer.get(String(row.player_id)) ?? null,
            teamRpeValues: Array.from(teamRpeMap.entries())
              .filter(([pid]) => pid !== String(row.player_id))
              .map(([, rpe]) => rpe),
            ydayContext,
            mdDay,
            whoopSnapshot: whoopByPlayer.get(String(row.player_id)) ?? null,
            vbtData: vbtByPlayer.get(String(row.player_id)) ?? null,
            indoorMode: effectiveIndoorMode,
            sportType,
          })
        );
      } catch {
        players.push({
          athleteId: String(row.player_id),
          athleteName: String(row.full_name ?? "Unknown athlete"),
          readinessScore: toFinite(row.readiness) ?? toFinite(row.total_score),
          cmjRequired: false,
          loadAlerts: [],
          fatigueType: null,
          recommendation: {
            state: "GRAY",
            sessionMode: "pending",
            loadAdjustment: null,
            constraints: ["technique_only"],
            focus: ["monitor_closely"],
            riskFlags: ["manual_review"],
            explanationFactors: [],
            confidence: { score: 0.35, band: "low" },
            coachSummary: "Manual review required. This athlete could not be fully processed.",
            dataQuality: { requiresManualReview: true },
          },
        });
      }
    }

    return NextResponse.json(
      serializeTeamDecisionResponse(
        buildTeamDecisionResponse({
          date,
          players,
        })
      )
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to build team decisions.";
    const status =
      message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : message === "No team context" ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
