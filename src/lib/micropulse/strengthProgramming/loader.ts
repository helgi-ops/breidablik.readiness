/**
 * Strength Programming — Loader
 *
 * Pulls all player-level signals consumed by the strength engine and shapes
 * them into a single PlayerStrengthSnapshot. Reuses the existing per-signal
 * loaders so we have one source of truth per metric.
 *
 * Each fetch is wrapped in try/catch so a missing table or null row
 * degrades gracefully — the snapshot just has null fields and the
 * adaptation engine handles partial data.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MdContext, PlayerStrengthSnapshot } from "./types";
import type { CoachOverride } from "./index";
import { loadSprintExposure } from "@/lib/micropulse/sprintExposure/loader";
import { parseWellnessNote, mergeNoteIntoSoreAreas } from "./noteParser";

/** Load coach manual exercise overrides for one player on one date. */
export async function loadCoachOverrides(
  sb: SupabaseClient,
  args: { playerId: string; dateIso: string },
): Promise<CoachOverride[]> {
  try {
    const { data } = await sb
      .from("strength_session_overrides")
      .select("block_id, position, override_exercise_id, notes")
      .eq("player_id", args.playerId)
      .eq("override_date", args.dateIso);
    return ((data ?? []) as Array<{
      block_id: string; position: number;
      override_exercise_id: string; notes: string | null;
    }>).map((r) => ({
      blockId: r.block_id,
      position: r.position,
      overrideExerciseId: r.override_exercise_id,
      notes: r.notes,
    }));
  } catch {
    return [];
  }
}

const SPRINT_SPEED_DROP_WINDOW = 28; // days
const COD_WINDOW = 14;               // days
const DECEL_BURDEN_HISTORY = 7;      // days to scan for HIGH streak
const FOSTER_WINDOW = 7;             // days

function startOfDayIso(daysBack: number, todayIso: string): string {
  const d = new Date(`${todayIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - daysBack);
  return d.toISOString().slice(0, 10);
}

/** Compute Sprint Speed Drop % from player_external_load_daily rows. */
async function fetchSprintSpeedDrop(
  sb: SupabaseClient,
  playerId: string,
  todayIso: string,
): Promise<number | null> {
  try {
    const startIso = startOfDayIso(SPRINT_SPEED_DROP_WINDOW - 1, todayIso);
    const { data } = await sb
      .from("player_external_load_daily")
      .select("date, max_velocity, max_vel, high_speed_distance")
      .eq("player_id", playerId)
      .eq("source", "catapult")
      .gte("date", startIso)
      .lte("date", todayIso);
    if (!data || data.length === 0) return null;
    const HSR_FLOOR = 200;
    const sessions: Array<{ date: string; mv: number }> = [];
    for (const r of data as Array<{
      date: string; max_velocity: number | null; max_vel: number | null;
      high_speed_distance: number | null;
    }>) {
      const a = typeof r.max_velocity === "number" && Number.isFinite(r.max_velocity) ? r.max_velocity : null;
      const b = typeof r.max_vel === "number" && Number.isFinite(r.max_vel) ? r.max_vel : null;
      const mv = a != null && b != null ? Math.max(a, b) : (a ?? b);
      const hsr = typeof r.high_speed_distance === "number" ? r.high_speed_distance : null;
      if (mv == null || hsr == null || mv <= 0 || hsr < HSR_FLOOR) continue;
      sessions.push({ date: r.date, mv });
    }
    const todayRow = sessions.find((s) => s.date === todayIso);
    if (!todayRow) return null;
    const ref = sessions.filter((s) => s.date !== todayIso).map((s) => s.mv).sort((a, b) => b - a);
    if (ref.length < 4) return null;
    const top3 = ref.slice(0, 3);
    const refMean = top3.reduce((s, v) => s + v, 0) / top3.length;
    return Number((((refMean - todayRow.mv) / refMean) * 100).toFixed(1));
  } catch {
    return null;
  }
}

/** Compute high-tier CoD L/R asymmetry % over 14d. Returns {pct, weakerSide}. */
async function fetchCodAsymmetry(
  sb: SupabaseClient,
  playerId: string,
  todayIso: string,
): Promise<{ pct: number | null; weakerSide: "L" | "R" | null }> {
  try {
    const startIso = startOfDayIso(COD_WINDOW - 1, todayIso);
    const { data } = await sb
      .from("player_external_load_daily")
      .select("ima_cod_left_high, ima_cod_right_high")
      .eq("player_id", playerId)
      .eq("source", "catapult")
      .gte("date", startIso)
      .lte("date", todayIso);
    if (!data || data.length === 0) return { pct: null, weakerSide: null };
    let left = 0;
    let right = 0;
    for (const r of data as Array<{ ima_cod_left_high: number | null; ima_cod_right_high: number | null }>) {
      left += Number(r.ima_cod_left_high ?? 0) || 0;
      right += Number(r.ima_cod_right_high ?? 0) || 0;
    }
    const max = Math.max(left, right);
    if (max <= 0) return { pct: null, weakerSide: null };
    const pct = Number(((Math.abs(left - right) / max) * 100).toFixed(1));
    const weakerSide = left < right ? "L" : (right < left ? "R" : null);
    return { pct, weakerSide };
  } catch {
    return { pct: null, weakerSide: null };
  }
}

/** Read latest decel burden band + count of consecutive HIGH days in last 7d. */
async function fetchDecelBurden(
  sb: SupabaseClient,
  playerId: string,
  todayIso: string,
): Promise<{ band: PlayerStrengthSnapshot["decelBurdenBand"]; highStreak: number }> {
  try {
    const startIso = startOfDayIso(DECEL_BURDEN_HISTORY - 1, todayIso);
    const { data } = await sb
      .from("player_external_load_daily")
      .select("date, decel_burden_band")
      .eq("player_id", playerId)
      .gte("date", startIso)
      .lte("date", todayIso)
      .order("date", { ascending: false });
    if (!data || data.length === 0) return { band: null, highStreak: 0 };
    const rows = data as Array<{ date: string; decel_burden_band: string | null }>;
    const latest = rows[0]?.decel_burden_band;
    let band: PlayerStrengthSnapshot["decelBurdenBand"] = null;
    if (latest === "low" || latest === "moderate" || latest === "elevated" || latest === "high") {
      band = latest;
    }
    // Count consecutive HIGH days from most recent backward
    let streak = 0;
    for (const r of rows) {
      if (r.decel_burden_band === "high") streak++;
      else break;
    }
    return { band, highStreak: streak };
  } catch {
    return { band: null, highStreak: 0 };
  }
}

/** Read latest readiness entry — wellness sub-scores + sore-areas array.
 *  Now also parses the free-text `notes` column with the bilingual
 *  keyword matcher (noteParser.ts) and merges any detected
 *  contraindications into the sore_areas array so the existing
 *  adaptation rules pick them up automatically — no AI required. */
async function fetchWellness(
  sb: SupabaseClient,
  playerId: string,
  todayIso: string,
): Promise<PlayerStrengthSnapshot["wellness"]> {
  const empty: PlayerStrengthSnapshot["wellness"] = {
    sleepQuality: null, muscleSoreness: null, fatigueEnergy: null, stressMood: null, soreAreas: [],
  };
  try {
    const startIso = startOfDayIso(2, todayIso); // today + 2 prior days fallback
    const { data } = await sb
      .from("readiness_entries")
      .select("entry_date, sleep_quality, muscle_soreness, fatigue_energy, stress_mood, sore_areas, notes")
      .eq("player_id", playerId)
      .gte("entry_date", startIso)
      .lte("entry_date", todayIso)
      .order("entry_date", { ascending: false })
      .limit(1);
    if (!data || data.length === 0) return empty;
    const r = data[0] as {
      sleep_quality: number | null; muscle_soreness: number | null;
      fatigue_energy: number | null; stress_mood: number | null;
      sore_areas: string[] | null;
      notes: string | null;
    };
    const checkboxAreas = Array.isArray(r.sore_areas) ? r.sore_areas : [];
    const parsedFromNote = parseWellnessNote(r.notes);
    const mergedSoreAreas = mergeNoteIntoSoreAreas(checkboxAreas, parsedFromNote);
    return {
      sleepQuality: r.sleep_quality,
      muscleSoreness: r.muscle_soreness,
      fatigueEnergy: r.fatigue_energy,
      stressMood: r.stress_mood,
      soreAreas: mergedSoreAreas,
    };
  } catch {
    return empty;
  }
}

/** Latest verdict from athlete_decision_history. */
async function fetchVerdict(
  sb: SupabaseClient,
  playerId: string,
  todayIso: string,
): Promise<PlayerStrengthSnapshot["verdict"]> {
  try {
    const { data } = await sb
      .from("athlete_decision_history")
      .select("verdict_action, decision_date")
      .eq("player_id", playerId)
      .lte("decision_date", todayIso)
      .order("decision_date", { ascending: false })
      .limit(1);
    if (!data || data.length === 0) return null;
    const v = String((data[0] as { verdict_action: string }).verdict_action ?? "").toUpperCase();
    if (v === "FULL" || v === "MODIFIED" || v === "REDUCED" || v === "RECOVERY" || v === "HOLD") return v;
    return null;
  } catch {
    return null;
  }
}

/** Active injury status. */
async function fetchInjury(
  sb: SupabaseClient,
  playerId: string,
): Promise<PlayerStrengthSnapshot["injuryStatus"]> {
  try {
    const { data } = await sb
      .from("player_injuries")
      .select("status")
      .eq("player_id", playerId)
      .order("updated_at", { ascending: false })
      .limit(1);
    if (!data || data.length === 0) return null;
    const s = String((data[0] as { status: string }).status ?? "").toLowerCase();
    if (s === "injured" || s === "rehabilitation" || s === "rtp_training" || s === "cleared") return s;
    return null;
  } catch {
    return null;
  }
}

/** Latest VBT velocity decrement from GymAware. */
async function fetchVbtDecrement(
  _sb: SupabaseClient,
  _playerId: string,
  _todayIso: string,
): Promise<number | null> {
  // VBT readiness has a more involved lookup (reference exercise + load
  // matching). Stage 1 leaves this null until we wire the existing
  // vbtReadiness module into the loader properly. Engine handles null
  // gracefully — VBT rule simply doesn't fire.
  return null;
}

/** Foster Monotony + Strain from session_rpe_entries last 7 days. */
async function fetchFoster(
  sb: SupabaseClient,
  playerId: string,
  todayIso: string,
): Promise<{ monotony: number | null; strain: number | null }> {
  try {
    const startIso = startOfDayIso(FOSTER_WINDOW - 1, todayIso);
    const { data } = await sb
      .from("session_rpe_entries")
      .select("session_load")
      .eq("player_id", playerId)
      .gte("session_date", startIso)
      .lte("session_date", todayIso)
      .gt("session_load", 0);
    if (!data || data.length < 3) return { monotony: null, strain: null };
    const loads = (data as Array<{ session_load: number }>).map((r) => r.session_load);
    const mean = loads.reduce((s, v) => s + v, 0) / loads.length;
    const variance = loads.reduce((s, v) => s + (v - mean) ** 2, 0) / loads.length;
    const sd = Math.sqrt(variance);
    if (sd <= 0) return { monotony: null, strain: null };
    const monotony = mean / sd;
    const weeklyLoad = loads.reduce((s, v) => s + v, 0);
    const strain = weeklyLoad * monotony;
    return { monotony, strain };
  } catch {
    return { monotony: null, strain: null };
  }
}

/** Is this a congested week? ≥2 matches in last/next 7 days. */
async function fetchCongestion(
  sb: SupabaseClient,
  playerId: string,
  todayIso: string,
): Promise<boolean> {
  try {
    const start = startOfDayIso(7, todayIso);
    const endDate = new Date(`${todayIso}T00:00:00Z`);
    endDate.setUTCDate(endDate.getUTCDate() + 7);
    const endIso = endDate.toISOString().slice(0, 10);
    const { data } = await sb
      .from("match_player_minutes")
      .select("match_date, minutes_played")
      .eq("player_id", playerId)
      .gte("match_date", start)
      .lte("match_date", endIso)
      .gte("minutes_played", 60);
    return (data?.length ?? 0) >= 2;
  } catch {
    return false;
  }
}

/** MD context from week_plans (or coach-supplied override). */
async function fetchMdContext(
  sb: SupabaseClient,
  teamId: string | null,
  todayIso: string,
  override: MdContext | null,
): Promise<MdContext> {
  if (override) return override;
  if (!teamId) return "MD-3"; // safest default
  try {
    // Find next match in the next 5 days
    const endDate = new Date(`${todayIso}T00:00:00Z`);
    endDate.setUTCDate(endDate.getUTCDate() + 5);
    const endIso = endDate.toISOString().slice(0, 10);
    const { data } = await sb
      .from("week_plans")
      .select("plan_date, day_type")
      .eq("team_id", teamId)
      .gte("plan_date", todayIso)
      .lte("plan_date", endIso)
      .order("plan_date", { ascending: true });
    const rows = (data ?? []) as Array<{ plan_date: string; day_type: string | null }>;
    const game = rows.find((r) => String(r.day_type ?? "").toUpperCase() === "GAME");
    if (!game) return "MD-3";
    const today = new Date(`${todayIso}T00:00:00Z`).getTime();
    const gameTs = new Date(`${game.plan_date}T00:00:00Z`).getTime();
    const days = Math.round((gameTs - today) / (1000 * 60 * 60 * 24));
    if (days === 1) return "MD-1";
    if (days === 2) return "MD-2";
    if (days === 3) return "MD-3";
    if (days === 4) return "MD-4";
    if (days === 0) return "OFF"; // matchday — no strength
    return "MD-3";
  } catch {
    return "MD-3";
  }
}

/** Main loader — builds the full snapshot for one player. */
export async function loadPlayerStrengthSnapshot(
  sb: SupabaseClient,
  args: {
    playerId: string;
    playerName?: string;
    teamId: string | null;
    todayIso: string;
    /** Coach manual override of MD-context — bypasses week_plans lookup. */
    mdContextOverride?: MdContext | null;
  },
): Promise<PlayerStrengthSnapshot> {
  const { playerId, playerName, teamId, todayIso } = args;

  // Run all reads in parallel — they don't depend on each other.
  const [
    sprintSpeedDropPct,
    sprintExposurePayload,
    cod,
    decel,
    wellness,
    verdict,
    injuryStatus,
    vbtDecrement,
    foster,
    isCongestedWeek,
    mdContext,
  ] = await Promise.all([
    fetchSprintSpeedDrop(sb, playerId, todayIso),
    loadSprintExposure(sb, { playerId, todayIso, teamId: teamId ?? undefined }),
    fetchCodAsymmetry(sb, playerId, todayIso),
    fetchDecelBurden(sb, playerId, todayIso),
    fetchWellness(sb, playerId, todayIso),
    fetchVerdict(sb, playerId, todayIso),
    fetchInjury(sb, playerId),
    fetchVbtDecrement(sb, playerId, todayIso),
    fetchFoster(sb, playerId, todayIso),
    fetchCongestion(sb, playerId, todayIso),
    fetchMdContext(sb, teamId, todayIso, args.mdContextOverride ?? null),
  ]);

  return {
    playerId,
    playerName,
    todayIso,
    mdContext,
    verdict,
    sprintSpeedDropPct,
    sprintExposureBand: sprintExposurePayload.band,
    codAsymmetryPct: cod.pct,
    codWeakerSide: cod.weakerSide,
    decelBurdenBand: decel.band,
    decelBurdenHighStreakDays: decel.highStreak,
    wellness,
    vbtDecrement,
    injuryStatus,
    fosterMonotony: foster.monotony,
    fosterStrain: foster.strain,
    isCongestedWeek,
  };
}
