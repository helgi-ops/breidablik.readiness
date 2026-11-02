/**
 * Merged VBT set source + dashboard computation.
 *
 * A player's velocity sets can come from TWO sources:
 *   1. GymAware hardware sync  → `gymaware_vbt_sessions`
 *   2. Manual entry (no hardware) → `player_strength_set_log` rows that carry a
 *      hand-entered `mean_velocity` (see migration 20261102140000).
 *
 * `fetchVbtSets()` unions both into one `VbtMergedSet[]`, so every existing VBT
 * analytic (PBs, today-vs-PB, load breakdowns, velocity-loss) works unchanged on
 * manual data. Shared by `/api/player/vbt` and `/api/trainer/vbt`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeExercisePBs,
  computeTodayVsPB,
  computeLoadBreakdowns,
  type VbtSetRow,
} from "./personalBest";
import { detectVelocityLoss, type VbtSessionSet, type VbtVelocityLossFlag } from "./velocityLoss";

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/** A VBT set from either source, with the fields all analytics need. */
export type VbtMergedSet = VbtSetRow & {
  player_id: string;
  /** Source ("gymaware" | "manual") for labelling / debugging. */
  source: "gymaware" | "manual";
  /** Stable within-session ordering key (GymAware id, or session+set_index). */
  order_key: string;
};

/** Fetch and merge a player's VBT sets from GymAware + manual logs. */
export async function fetchVbtSets(
  sb: SupabaseClient,
  playerId: string,
): Promise<VbtMergedSet[]> {
  const [g, m] = await Promise.all([
    sb
      .from("gymaware_vbt_sessions")
      .select(
        "session_date, exercise_name, load_kg, reps, mean_velocity, peak_velocity, mean_power, peak_power, gymaware_set_id",
      )
      .eq("player_id", playerId)
      .order("session_date", { ascending: false }),
    sb
      .from("player_strength_set_log")
      .select("session_date, exercise_name, weight_kg, reps, mean_velocity, peak_velocity, set_index, is_warmup")
      .eq("player_id", playerId)
      .not("mean_velocity", "is", null)
      .order("session_date", { ascending: false }),
  ]);

  const out: VbtMergedSet[] = [];
  for (const r of (g.data ?? []) as Record<string, unknown>[]) {
    out.push({
      player_id: playerId,
      source: "gymaware",
      session_date: String(r.session_date ?? ""),
      exercise_name: String(r.exercise_name ?? ""),
      load_kg: num(r.load_kg),
      reps: num(r.reps),
      mean_velocity: num(r.mean_velocity),
      peak_velocity: num(r.peak_velocity),
      mean_power: num(r.mean_power),
      peak_power: num(r.peak_power),
      order_key: `g:${String(r.gymaware_set_id ?? "")}`,
    });
  }
  for (const r of (m.data ?? []) as Record<string, unknown>[]) {
    if (r.is_warmup === true) continue;
    const setIndex = String(num(r.set_index) ?? 0).padStart(3, "0");
    out.push({
      player_id: playerId,
      source: "manual",
      session_date: String(r.session_date ?? ""),
      exercise_name: String(r.exercise_name ?? ""),
      load_kg: num(r.weight_kg),
      reps: num(r.reps),
      mean_velocity: num(r.mean_velocity),
      peak_velocity: num(r.peak_velocity),
      mean_power: null,
      peak_power: null,
      order_key: `m:${String(r.session_date ?? "")}:${setIndex}`,
    });
  }
  return out;
}

/** Map a merged set to the within-session velocity-loss shape. */
export function toVbtSessionSet(m: VbtMergedSet): VbtSessionSet {
  return {
    player_id: m.player_id,
    session_date: m.session_date,
    exercise_name: m.exercise_name,
    load_kg: m.load_kg,
    mean_velocity: m.mean_velocity,
    gymaware_set_id: m.order_key,
  };
}

export type VbtDashboard = {
  date: string;
  exercises: ReturnType<typeof computeExercisePBs>;
  todayComparisons: ReturnType<typeof computeTodayVsPB>;
  loadBreakdowns: ReturnType<typeof computeLoadBreakdowns>;
  recentHistory: Array<{
    date: string;
    sets: Array<{
      exerciseName: string;
      meanVelocity: number;
      loadKg: number | null;
      peakPower: number | null;
      reps: number | null;
      pbVelocityAtLoad: number | null;
      pbDiffPct: number | null;
      isPB: boolean;
    }>;
  }>;
  chartData: Record<string, Array<{ load: number; velocity: number; date: string }>>;
  velocityTrend: Record<string, Array<{ date: string; velocity: number; loadKg: number | null }>>;
  /** Within-session velocity-loss flags for `date` (fatigue signal). */
  velocityLoss: VbtVelocityLossFlag[];
  totalSets: number;
};

/**
 * Build the VBT dashboard payload for one player. Pure: takes already-fetched
 * merged sets so it can be reused by the player and trainer routes.
 */
export function computeVbtDashboard(
  merged: VbtMergedSet[],
  date: string,
  playerId: string,
): VbtDashboard {
  const allSets: VbtSetRow[] = merged;
  const todaySets = allSets.filter((s) => s.session_date === date);
  const historySets = allSets.filter((s) => s.session_date !== date);
  const exercises = computeExercisePBs(allSets);
  const todayComparisons = computeTodayVsPB(todaySets, historySets);

  // PB lookup: per exercise + load → best mean velocity.
  const pbByExerciseLoad = new Map<string, number>();
  for (const s of allSets) {
    const key = s.exercise_name.trim();
    if (!key || s.load_kg == null || s.mean_velocity == null) continue;
    const mapKey = `${key}|${s.load_kg}`;
    const existing = pbByExerciseLoad.get(mapKey) ?? 0;
    if (s.mean_velocity > existing) pbByExerciseLoad.set(mapKey, s.mean_velocity);
  }

  const sessionDates = [...new Set(allSets.map((s) => s.session_date))].slice(0, 10);
  const recentHistory = sessionDates.map((d) => {
    const daySets = allSets.filter((s) => s.session_date === d);
    const sets = daySets
      .filter((s) => s.exercise_name.trim() && s.mean_velocity != null)
      .map((s) => {
        const exerciseName = s.exercise_name.trim();
        const loadKey = `${exerciseName}|${s.load_kg}`;
        const pbVelocity = pbByExerciseLoad.get(loadKey) ?? null;
        let pbDiffPct: number | null = null;
        let isPB = false;
        if (pbVelocity != null && s.mean_velocity != null && pbVelocity > 0) {
          pbDiffPct = ((s.mean_velocity - pbVelocity) / pbVelocity) * 100;
          isPB = s.mean_velocity >= pbVelocity;
        }
        return {
          exerciseName,
          meanVelocity: s.mean_velocity!,
          loadKg: s.load_kg,
          peakPower: s.peak_power,
          reps: s.reps,
          pbVelocityAtLoad: pbVelocity,
          pbDiffPct,
          isPB,
        };
      });
    return { date: d, sets };
  });

  const loadBreakdowns = computeLoadBreakdowns(allSets);

  const chartData: Record<string, Array<{ load: number; velocity: number; date: string }>> = {};
  for (const s of allSets) {
    const key = s.exercise_name.trim();
    if (!key || s.load_kg == null || s.mean_velocity == null || s.load_kg <= 0) continue;
    (chartData[key] ??= []).push({ load: s.load_kg, velocity: s.mean_velocity, date: s.session_date });
  }

  const velocityTrend: Record<string, Array<{ date: string; velocity: number; loadKg: number | null }>> = {};
  for (const s of allSets) {
    const key = s.exercise_name.trim();
    if (!key || s.mean_velocity == null) continue;
    (velocityTrend[key] ??= []).push({ date: s.session_date, velocity: s.mean_velocity, loadKg: s.load_kg });
  }
  for (const key of Object.keys(velocityTrend)) {
    const byDate = new Map<string, { velocity: number; loadKg: number | null }>();
    for (const p of velocityTrend[key]) {
      const existing = byDate.get(p.date);
      if (!existing || p.velocity > existing.velocity) byDate.set(p.date, { velocity: p.velocity, loadKg: p.loadKg });
    }
    velocityTrend[key] = Array.from(byDate.entries())
      .map(([d, v]) => ({ date: d, velocity: v.velocity, loadKg: v.loadKg }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  // Within-session velocity-loss (fatigue) for the requested date.
  const todaySession = merged.filter((s) => s.session_date === date).map(toVbtSessionSet);
  const vlResult = detectVelocityLoss(todaySession).find((r) => r.playerId === playerId);
  const velocityLoss = vlResult?.flags ?? [];

  return {
    date,
    exercises,
    todayComparisons,
    loadBreakdowns,
    recentHistory,
    chartData,
    velocityTrend,
    velocityLoss,
    totalSets: allSets.length,
  };
}
