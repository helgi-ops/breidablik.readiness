import "server-only";

/**
 * Team-wide reads for the new-feature coach-signal engines (fitness_trend, body_comp, speed_zones).
 * Each returns a lightweight lite[] the pure derive functions grade. Service-role reads (tokenless →
 * cron-safe). Descriptive — nothing here touches the readiness colour or the daily decision.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildFitnessTrends } from "@/lib/micropulse/load/fitnessTrend";
import { resolveMas, resolveMss } from "@/lib/micropulse/load/speedZonesData";
import { loadAthleteProfilesForTeam } from "@/lib/micropulse/playerAnalysis/loadAthleteProfilesForTeam";
import { buildPositionFitnessRequirements } from "@/lib/micropulse/positionFitnessRequirements";
import { computeAnaerobicSpeedReserve } from "@/lib/micropulse/load/criticalSpeed";
import { oneRepMaxesFromLogs } from "@/lib/micropulse/strengthProgramming/oneRmFromLogs";
import { canonicalLift } from "@/lib/client/oneRepMax";
import type { QualityId } from "@/lib/micropulse/playerAnalysis/athleteProfile";
import type { SetLogRow } from "@/lib/client/workingOneRm";
import type { FitnessTrendLite, BodyCompLite, SpeedZonesLite, PositionFitnessLite, Strength1rmLite } from "@/lib/micropulse/coachSignals";

const BODY_COMP_BAND_PCT = 4; // ±%BF estimate error — a change beyond it is beyond noise

async function nameMap(sb: SupabaseClient, teamId: string): Promise<Map<string, string>> {
  const { data } = await sb.from("players").select("id, full_name").eq("team_id", teamId);
  return new Map(((data ?? []) as Array<{ id: string; full_name: string | null }>).map((p) => [p.id, (p.full_name ?? "").trim() || "—"]));
}

/** Per player: his primary within-test fitness trend (MAS/CS/Yo-Yo). Derive flags the `down` ones. */
export async function loadTeamFitnessTrendLite(sb: SupabaseClient, teamId: string): Promise<FitnessTrendLite[]> {
  const names = await nameMap(sb, teamId);
  const { data } = await sb.from("player_fitness_test")
    .select("player_id, test_date, test_type, result_value, result_unit, mas_kmh, vo2max_est")
    .eq("team_id", teamId).order("test_date", { ascending: false }).limit(5000);
  const byPlayer = new Map<string, Array<{ test_date: string; test_type: string; result_value: number | null; result_unit: string | null; mas_kmh: number | null; vo2max_est: number | null }>>();
  for (const r of (data ?? []) as Array<{ player_id: string } & { test_date: string; test_type: string; result_value: number | null; result_unit: string | null; mas_kmh: number | null; vo2max_est: number | null }>) {
    const arr = byPlayer.get(r.player_id) ?? []; arr.push(r); byPlayer.set(r.player_id, arr);
  }
  const out: FitnessTrendLite[] = [];
  for (const [playerId, history] of byPlayer) {
    const { byTestType, masAcross } = buildFitnessTrends(history);
    const primary = byTestType.find((t) => t.dir !== "insufficient") ?? masAcross ?? null;
    if (!primary || primary.dir === "insufficient") continue;
    out.push({ playerId, name: names.get(playerId) ?? "—", dir: primary.dir, metricEn: primary.metricLabel.en, metricIs: primary.metricLabel.is, seasonDeltaPct: primary.seasonDeltaPct, swcPct: primary.swcPct });
  }
  return out;
}

/** Per player: %BF change between his two most recent COMPARABLE measurements (same method). */
export async function loadTeamBodyCompLite(sb: SupabaseClient, teamId: string): Promise<BodyCompLite[]> {
  const names = await nameMap(sb, teamId);
  const { data } = await sb.from("player_body_metrics")
    .select("player_id, measured_on, body_fat_pct, bf_method")
    .eq("team_id", teamId).not("body_fat_pct", "is", null).order("measured_on", { ascending: false });
  const byPlayer = new Map<string, Array<{ body_fat_pct: number; bf_method: string | null }>>();
  for (const r of (data ?? []) as Array<{ player_id: string; body_fat_pct: number; bf_method: string | null }>) {
    const arr = byPlayer.get(r.player_id) ?? []; arr.push({ body_fat_pct: Number(r.body_fat_pct), bf_method: r.bf_method }); byPlayer.set(r.player_id, arr);
  }
  const out: BodyCompLite[] = [];
  for (const [playerId, rows] of byPlayer) {
    if (rows.length < 2) continue;
    const [latest, prev] = rows; // newest-first
    if (latest.bf_method !== prev.bf_method) continue; // method changed → not comparable, skip (noise)
    const deltaPct = Math.round((latest.body_fat_pct - prev.body_fat_pct) * 10) / 10;
    out.push({ playerId, name: names.get(playerId) ?? "—", deltaPct, bandPct: BODY_COMP_BAND_PCT });
  }
  return out;
}

/** Per player: has MAS, and whether he has individualised zones (a measured MSS > MAS). */
export async function loadTeamSpeedZonesLite(sb: SupabaseClient, teamId: string): Promise<SpeedZonesLite[]> {
  const [names, masMap, mssMap] = await Promise.all([nameMap(sb, teamId), resolveMas(teamId), resolveMss(teamId)]);
  const out: SpeedZonesLite[] = [];
  for (const [playerId, mas] of masMap) {
    const mss = mssMap.get(playerId);
    const hasZones = mss != null && mss.mssKmh > mas.masKmh;
    out.push({ playerId, name: names.get(playerId) ?? "—", hasMas: true, hasZones });
  }
  return out;
}

// ── position_fitness + strength_1rm (new-feature engines, batch 2) ──

/** Per player: is he BELOW the squad-relative floor on his position's TOP demanded quality? */
export async function loadTeamPositionFitnessLite(_sb: SupabaseClient, teamId: string): Promise<PositionFitnessLite[]> {
  const [{ roster, profiles }, masMap, mssMap] = await Promise.all([
    loadAthleteProfilesForTeam(teamId), resolveMas(teamId), resolveMss(teamId),
  ]);
  const out: PositionFitnessLite[] = [];
  for (const r of roster) {
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
    if (!read.scored || !read.rows.length) continue;
    const belowTop = read.rows[0].band === "below";
    if (!belowTop) continue;
    const weakest = read.rows.filter((x) => x.band === "below").sort((a, b) => (a.playerPctl ?? 0) - (b.playerPctl ?? 0))[0] ?? read.rows[0];
    out.push({ playerId: r.id, name: r.full_name, belowTop, weakestEn: weakest.label.en, weakestIs: weakest.label.is, roleEn: read.roleLabel.en, roleIs: read.roleLabel.is });
  }
  return out;
}

/** Per player: main lifts he has logged that have no corroborated working 1RM yet (→ %1RM can't → kg). */
export async function loadTeamStrength1rmLite(sb: SupabaseClient, teamId: string): Promise<Strength1rmLite[]> {
  const names = await nameMap(sb, teamId);
  const cutoff = new Date(); cutoff.setUTCDate(cutoff.getUTCDate() - 120);
  const { data } = await sb.from("player_strength_set_log")
    .select("player_id, session_date, exercise_name, weight_kg, reps, rpe, is_warmup")
    .eq("team_id", teamId).eq("is_warmup", false).gte("session_date", cutoff.toISOString().slice(0, 10));
  const byPlayer = new Map<string, SetLogRow[]>();
  for (const r of (data ?? []) as Array<{ player_id: string; session_date: string; exercise_name: string; weight_kg: number | null; reps: number | null; rpe: number | null }>) {
    const arr = byPlayer.get(r.player_id) ?? []; arr.push({ session_date: r.session_date, exercise_name: r.exercise_name, weight_kg: r.weight_kg, reps: r.reps, rpe: r.rpe }); byPlayer.set(r.player_id, arr);
  }
  const out: Strength1rmLite[] = [];
  for (const [playerId, sets] of byPlayer) {
    const working = oneRepMaxesFromLogs(sets);
    const loggedLifts = new Set<string>();
    for (const s of sets) { const c = canonicalLift(s.exercise_name); if (c) loggedLifts.add(c); }
    const needing = [...loggedLifts].filter((lift) => !(lift in working));
    if (needing.length) out.push({ playerId, name: names.get(playerId) ?? "—", liftsNeedingOneRm: needing });
  }
  return out;
}
