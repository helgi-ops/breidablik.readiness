import "server-only";

/**
 * Off-week plan loader — assembles each player's NEEDS profile from the signals the app already
 * computes, then calls the pure buildOffWeekPlan. Cheap batch reads + a best-effort per-player deficit
 * pull. Descriptive; never touches the readiness colour. Thin data → balanced maintenance (the engine
 * defaults), labelled by the per-player "why".
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadRoster, loadAthleteProfilesForTeam } from "@/lib/micropulse/playerAnalysis/loadAthleteProfilesForTeam";
import { collectDeficits } from "@/lib/micropulse/unifiedDeficits/collect";
import { buildFitnessTrends } from "@/lib/micropulse/load/fitnessTrend";
import { resolveMas, resolveMss } from "@/lib/micropulse/load/speedZonesData";
import { buildPositionFitnessRequirements } from "@/lib/micropulse/positionFitnessRequirements";
import { computeAnaerobicSpeedReserve } from "@/lib/micropulse/load/criticalSpeed";
import { oneRepMaxesFromLogs } from "@/lib/micropulse/strengthProgramming/oneRmFromLogs";
import type { SetLogRow } from "@/lib/client/workingOneRm";
import type { QualityId } from "@/lib/micropulse/playerAnalysis/athleteProfile";
import { buildOffWeekPlan, type GymAccess, type OffWeekPlan, type PlayerNeeds } from "./plan";

/** The off-week engine keys lifts as squat/bench/deadlift/trap_bar_deadlift; the logged-1RM map keys them
 *  by canonicalLift ("back squat", "bench press", "trap-bar deadlift"…). Remap so the kg prescriptions fill. */
function offWeekOneRepMaxes(working: Record<string, { one_rm: number }>): Record<string, number> | null {
  const pick = (...keys: string[]): number | undefined => {
    for (const k of keys) { const v = working[k]?.one_rm; if (v && v > 0) return v; }
    return undefined;
  };
  const out: Record<string, number> = {};
  const squat = pick("back squat", "squat", "front squat");
  const bench = pick("bench press", "bench");
  const deadlift = pick("deadlift");
  const trap = pick("trap-bar deadlift");
  if (squat) out.squat = squat;
  if (bench) out.bench = bench;
  if (deadlift) out.deadlift = deadlift;
  if (trap) out.trap_bar_deadlift = trap;
  return Object.keys(out).length ? out : null;
}

/** unifiedDeficits QualityKey → the emphasis words buildOffWeekPlan matches. */
function qualityToEmphasis(q: string): string | null {
  const k = q.toLowerCase();
  if (k === "eccentric_absorption" || k === "posterior_chain_length") return "eccentric_hamstring";
  if (k === "adductor_capacity") return "adductor";
  if (k === "limb_asymmetry") return "asymmetry";
  return null;
}

export interface OffWeekPlayerPlan {
  playerId: string; name: string; position: string | null;
  needs: PlayerNeeds; plan: OffWeekPlan;
}

export async function loadOffWeekPlans(
  sb: SupabaseClient,
  args: { teamId: string; playerIds?: string[]; days: number; gymAccess: GymAccess },
): Promise<{ players: OffWeekPlayerPlan[] }> {
  const { teamId, days, gymAccess } = args;
  let roster = await loadRoster(teamId);
  if (args.playerIds?.length) { const set = new Set(args.playerIds); roster = roster.filter((r) => set.has(r.id)); }
  const ids = roster.map((r) => r.id);
  if (ids.length === 0) return { players: [] };

  const since = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);

  const [runRes, fitRes, injRes, minRes] = await Promise.all([
    sb.from("player_running_test").select("player_id, test_date, end_speed_kmh, speed_m_per_min").in("player_id", ids).order("test_date", { ascending: false }),
    sb.from("player_fitness_test").select("player_id, test_date, test_type, result_value, result_unit, mas_kmh, vo2max_est").in("player_id", ids).gte("test_date", since(900)).order("test_date", { ascending: true }),
    sb.from("player_injuries").select("player_id, injury_type, body_part, status, injury_date").in("player_id", ids).neq("status", "cleared").order("injury_date", { ascending: false }),
    sb.from("match_player_minutes").select("player_id, minutes_played, match_date").in("player_id", ids).gte("match_date", since(90)).order("match_date", { ascending: false }),
  ]);

  // Latest MAS per player (end_speed_kmh, else speed_m_per_min → km/h).
  const masByPlayer = new Map<string, number>();
  for (const r of (runRes.data ?? []) as Array<{ player_id: string; end_speed_kmh: number | null; speed_m_per_min: number | null }>) {
    if (masByPlayer.has(r.player_id)) continue; // first = latest (ordered desc)
    const kmh = r.end_speed_kmh ?? (r.speed_m_per_min ? (r.speed_m_per_min * 60) / 1000 : null);
    if (kmh && kmh > 0) masByPlayer.set(r.player_id, Math.round(kmh * 10) / 10);
  }

  // Fitness-test history → aerobic trend direction.
  const fitByPlayer = new Map<string, Array<{ test_date: string; test_type: string; result_value: number | null; result_unit: string | null; mas_kmh: number | null; vo2max_est: number | null }>>();
  for (const r of (fitRes.data ?? []) as Array<{ player_id: string } & { test_date: string; test_type: string; result_value: number | null; result_unit: string | null; mas_kmh: number | null; vo2max_est: number | null }>) {
    const arr = fitByPlayer.get(r.player_id) ?? []; arr.push(r); fitByPlayer.set(r.player_id, arr);
  }
  const masTrendByPlayer = new Map<string, "up" | "down" | "stable" | null>();
  for (const [pid, hist] of fitByPlayer) {
    try {
      const t = buildFitnessTrends(hist);
      const dir = (t.masAcross ?? t.byTestType[0])?.dir ?? null;
      masTrendByPlayer.set(pid, dir === "up" || dir === "down" || dir === "stable" ? dir : null);
    } catch { masTrendByPlayer.set(pid, null); }
  }

  // Latest non-cleared injury → RTP track (only when actively on a rehab/RTP track).
  const rtpByPlayer = new Map<string, string>();
  for (const r of (injRes.data ?? []) as Array<{ player_id: string; injury_type: string | null; body_part: string | null; status: string | null }>) {
    if (rtpByPlayer.has(r.player_id)) continue;
    const s = String(r.status ?? "").toLowerCase();
    if (s === "rehabilitation" || s === "rtp_training") {
      const label = [r.body_part, r.injury_type].filter(Boolean).join(" ") || "rehab";
      rtpByPlayer.set(r.player_id, `${label} (${s === "rtp_training" ? "RTP" : "rehab"})`);
    }
  }

  // Recent-minutes average (last up to 6 matches within 90d) → fatigue proxy.
  const minsByPlayer = new Map<string, number[]>();
  for (const r of (minRes.data ?? []) as Array<{ player_id: string; minutes_played: number | null }>) {
    const arr = minsByPlayer.get(r.player_id) ?? []; if (arr.length < 6) arr.push(Number(r.minutes_played ?? 0)); minsByPlayer.set(r.player_id, arr);
  }
  const fatigueByPlayer = new Map<string, boolean>();
  for (const [pid, mins] of minsByPlayer) {
    const avg = mins.length ? mins.reduce((s, v) => s + v, 0) / mins.length : 0;
    fatigueByPlayer.set(pid, avg >= 70); // consistently high match minutes → lighten the off-week
  }

  // Per-player deficit emphases (best-effort).
  const defByPlayer = new Map<string, string[]>();
  await Promise.all(roster.map(async (r) => {
    try {
      const { rows } = await collectDeficits(sb, r.id);
      const emphases = Array.from(new Set((rows ?? []).map((x) => qualityToEmphasis(String((x as { quality?: string }).quality ?? ""))).filter((x): x is string => !!x)));
      if (emphases.length) defByPlayer.set(r.id, emphases);
    } catch { /* thin data → no emphasis */ }
  }));

  // Logged strength → working 1RM per lift (so the gym plan prescribes real kg, not just bodyweight).
  const ormByPlayer = new Map<string, Record<string, number>>();
  try {
    const cutoff = new Date(); cutoff.setUTCDate(cutoff.getUTCDate() - 120);
    const { data: setRows } = await sb.from("player_strength_set_log")
      .select("player_id, session_date, exercise_name, weight_kg, reps, rpe")
      .in("player_id", ids).eq("is_warmup", false).gte("session_date", cutoff.toISOString().slice(0, 10));
    const setsByPlayer = new Map<string, SetLogRow[]>();
    for (const r of (setRows ?? []) as Array<{ player_id: string } & SetLogRow>) {
      const a = setsByPlayer.get(r.player_id) ?? [];
      a.push({ session_date: r.session_date, exercise_name: r.exercise_name, weight_kg: r.weight_kg, reps: r.reps, rpe: r.rpe });
      setsByPlayer.set(r.player_id, a);
    }
    for (const [pid, sets] of setsByPlayer) {
      const orm = offWeekOneRepMaxes(oneRepMaxesFromLogs(sets));
      if (orm) ormByPlayer.set(pid, orm);
    }
  } catch { /* no strength logs → bodyweight prescriptions */ }

  // Below his position's aerobic requirement → the engine adds running volume.
  const belowAeroByPlayer = new Map<string, boolean>();
  try {
    const [{ roster: profRoster, profiles }, masMap, mssMap] = await Promise.all([
      loadAthleteProfilesForTeam(teamId), resolveMas(teamId), resolveMss(teamId),
    ]);
    for (const r of profRoster) {
      const mas = masMap.get(r.id)?.masKmh ?? null;
      const mss = mssMap.get(r.id)?.mssKmh ?? null;
      const fitnessValues: Partial<Record<QualityId, { value: number; unit: string }>> = {};
      if (mas != null) fitnessValues.aerobic_endurance = { value: mas, unit: "km/h" };
      if (mss != null) fitnessValues.speed = { value: mss, unit: "km/h" };
      const asr = computeAnaerobicSpeedReserve({ masKmh: mas, mssKmh: mss });
      const read = buildPositionFitnessRequirements({
        playerId: r.id, name: r.full_name, position: r.position, sport: r.sport,
        profile: profiles.get(r.id) ?? null, fitnessValues, asrKmh: asr?.asrKmh ?? null,
      });
      const aero = read.rows.find((x) => x.quality === "aerobic_endurance");
      if (aero?.band === "below") belowAeroByPlayer.set(r.id, true);
    }
  } catch { /* thin data → no aerobic flag */ }

  const players: OffWeekPlayerPlan[] = roster.map((r) => {
    const needs: PlayerNeeds = {
      deficitEmphases: defByPlayer.get(r.id),
      belowAerobicReq: belowAeroByPlayer.get(r.id) ?? false,
      masTrend: masTrendByPlayer.get(r.id) ?? null,
      rtpTrack: rtpByPlayer.get(r.id) ?? null,
      fatigueFlag: fatigueByPlayer.get(r.id) ?? false,
    };
    const plan = buildOffWeekPlan({ days, masKmh: masByPlayer.get(r.id) ?? null, oneRepMaxes: ormByPlayer.get(r.id) ?? null, gymAccess, needs });
    return { playerId: r.id, name: r.full_name, position: r.position, needs, plan };
  });

  return { players };
}
