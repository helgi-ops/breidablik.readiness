import "server-only";

/**
 * Off-week plan loader — assembles each player's NEEDS profile from the signals the app already
 * computes, then calls the pure buildOffWeekPlan. Cheap batch reads + a best-effort per-player deficit
 * pull. Descriptive; never touches the readiness colour. Thin data → balanced maintenance (the engine
 * defaults), labelled by the per-player "why".
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadRoster } from "@/lib/micropulse/playerAnalysis/loadAthleteProfilesForTeam";
import { collectDeficits } from "@/lib/micropulse/unifiedDeficits/collect";
import { buildFitnessTrends } from "@/lib/micropulse/load/fitnessTrend";
import { buildOffWeekPlan, type GymAccess, type OffWeekPlan, type PlayerNeeds } from "./plan";

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

  const players: OffWeekPlayerPlan[] = roster.map((r) => {
    const needs: PlayerNeeds = {
      deficitEmphases: defByPlayer.get(r.id),
      masTrend: masTrendByPlayer.get(r.id) ?? null,
      rtpTrack: rtpByPlayer.get(r.id) ?? null,
      fatigueFlag: fatigueByPlayer.get(r.id) ?? false,
    };
    const plan = buildOffWeekPlan({ days, masKmh: masByPlayer.get(r.id) ?? null, oneRepMaxes: null, gymAccess, needs });
    return { playerId: r.id, name: r.full_name, position: r.position, needs, plan };
  });

  return { players };
}
