/**
 * Server reads (I/O) for the individualised speed zones. Resolves each player's MAS and MSS from
 * existing tables — with an explicit provenance ranking so the surface can show which test won and
 * how confident to be — then joins them through the pure `buildSpeedZones`. No new table needed.
 *
 * Descriptive conditioning context only — nothing here reaches the readiness/decision path. The
 * pure maths (ASR, floors, band reclassification, %-of-capacity) lives in `speedZones.ts`.
 */

import { getSupabaseServer } from "@/lib/supabaseServer";
import { fetchAllPages } from "@/lib/supabasePaginate";
import { deriveFitnessTest } from "@/lib/micropulse/load/fitnessTests";
import { MAS_FROM_VIFT } from "@/lib/micropulse/playerAnalysis/fitnessTestSignals";
import {
  buildSpeedZones, classifyBandsToZones, matchHsrVsCapacity,
  type SpeedZones, type MasSource, type MssSource,
} from "@/lib/micropulse/load/speedZones";

// Catapult velocity-band lower edges (km/h) — the fixed, league-comparable thresholds the club's
// band config exports at. Band 5 = the Ju-2022 HSR line; band 6 = the sprint line.
const VEL_BAND5_LOWER_KMH = 19.8;
const VEL_BAND6_LOWER_KMH = 25.2;

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v
  : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v)
  : null;

export interface MasResolved { masKmh: number; source: MasSource; date: string | null }
export interface MssResolved { mssKmh: number; source: MssSource; date: string | null; gpsSessions: number }

/** Map a generic-fitness-test type to its MAS provenance label (direct-MAS tests only). */
function masSourceForType(testType: string | null | undefined): MasSource | null {
  switch (testType) {
    case "mas_vameval": return "vameval";
    case "msft_beep": return "msft";
    case "mas_run_4min": return "run_4min";
    default: return null;
  }
}

/**
 * Freshest MAS per player, provenance-ranked: a direct incremental/field test
 * (VAMEVAL / MSFT / 4-min run, from `player_fitness_test` or `player_running_test`) beats a
 * VIFT-shrunk estimate (30-15 IFT × 0.86). CS-back-calc from the distance curve is a documented
 * lower tier, not wired here (it needs a per-player curve fit) — a null MAS is honest, a guessed
 * one is not.
 */
export async function resolveMas(teamId: string): Promise<Map<string, MasResolved>> {
  const sb = getSupabaseServer();

  const [ftRes, rtRes] = await Promise.all([
    sb.from("player_fitness_test")
      .select("player_id, test_date, test_type, result_value, mas_kmh")
      .eq("team_id", teamId).order("test_date", { ascending: false }).limit(5000),
    sb.from("player_running_test")
      .select("player_id, test_date, distance_m, duration_s, speed_m_per_min")
      .eq("team_id", teamId).order("test_date", { ascending: false }).limit(5000),
  ]);

  type Cand = { masKmh: number; source: MasSource; date: string | null };
  const direct = new Map<string, Cand>(); // tier 1 — freshest wins (rows are newest-first)
  const vift = new Map<string, Cand>();   // tier 2

  for (const r of (ftRes.data ?? []) as Array<{ player_id: string; test_date: string | null; test_type: string | null; result_value: number | null; mas_kmh: number | null }>) {
    const pid = String(r.player_id ?? ""); if (!pid) continue;
    const directSource = masSourceForType(r.test_type);
    if (directSource) {
      const mas = num(r.mas_kmh) ?? deriveFitnessTest(r.test_type ?? "", num(r.result_value)).masKmh;
      if (mas != null && mas > 0 && !direct.has(pid)) direct.set(pid, { masKmh: mas, source: directSource, date: r.test_date });
    } else if (r.test_type === "ift_30_15") {
      const vv = num(r.result_value);
      if (vv != null && vv > 0 && !vift.has(pid)) vift.set(pid, { masKmh: Math.round(vv * MAS_FROM_VIFT * 10) / 10, source: "vift_shrunk", date: r.test_date });
    }
  }

  for (const r of (rtRes.data ?? []) as Array<{ player_id: string; test_date: string | null; distance_m: number | null; duration_s: number | null; speed_m_per_min: number | null }>) {
    const pid = String(r.player_id ?? ""); if (!pid || direct.has(pid)) continue; // fitness-test direct MAS already won
    const spm = num(r.speed_m_per_min);
    const dist = num(r.distance_m), dur = num(r.duration_s);
    const masKmh = spm != null && spm > 0 ? spm * 0.06 : (dist != null && dur != null && dur > 0 ? (dist / dur) * 3.6 : null);
    if (masKmh != null && masKmh > 0) direct.set(pid, { masKmh: Math.round(masKmh * 10) / 10, source: "run_4min", date: r.test_date });
  }

  const out = new Map<string, MasResolved>();
  for (const [pid, c] of direct) out.set(pid, c);
  for (const [pid, c] of vift) if (!out.has(pid)) out.set(pid, c);
  return out;
}

/**
 * MSS per player = the higher of a measured max-sprint test and the season-best GPS max velocity
 * (both credible measured values); records which won and, for the GPS path, how many sessions back
 * it (exposure → confidence). MSS is NEVER estimated from an endurance test.
 */
export async function resolveMss(teamId: string): Promise<Map<string, MssResolved>> {
  const sb = getSupabaseServer();

  const [sprintRes, dailyRes] = await Promise.all([
    sb.from("player_fitness_test")
      .select("player_id, test_date, result_value")
      .eq("team_id", teamId).eq("test_type", "sprint_max").order("test_date", { ascending: false }).limit(5000),
    fetchAllPages<{ player_id: string; date: string | null; max_velocity: number | null; max_vel: number | null }>((from, to) =>
      sb.from("player_external_load_daily").select("player_id, date, max_velocity, max_vel")
        .eq("team_id", teamId).in("source", ["catapult", "manual"]).range(from, to)),
  ]);

  const sprint = new Map<string, { kmh: number; date: string | null }>();
  for (const r of (sprintRes.data ?? []) as Array<{ player_id: string; test_date: string | null; result_value: number | null }>) {
    const pid = String(r.player_id ?? ""); const v = num(r.result_value);
    if (pid && v != null && v > 0 && !sprint.has(pid)) sprint.set(pid, { kmh: v, date: r.test_date });
  }

  const gps = new Map<string, { kmh: number; date: string | null; sessions: number }>();
  for (const r of dailyRes) {
    const pid = String(r.player_id ?? ""); if (!pid) continue;
    const v = Math.max(num(r.max_velocity) ?? 0, num(r.max_vel) ?? 0);
    if (v <= 0) continue;
    const prev = gps.get(pid);
    if (!prev) gps.set(pid, { kmh: v, date: r.date, sessions: 1 });
    else gps.set(pid, { kmh: Math.max(prev.kmh, v), date: v > prev.kmh ? r.date : prev.date, sessions: prev.sessions + 1 });
  }

  const out = new Map<string, MssResolved>();
  const pids = new Set<string>([...sprint.keys(), ...gps.keys()]);
  for (const pid of pids) {
    const s = sprint.get(pid), g = gps.get(pid);
    if (s && (!g || s.kmh >= g.kmh)) {
      out.set(pid, { mssKmh: s.kmh, source: "sprint_test", date: s.date, gpsSessions: g?.sessions ?? 0 });
    } else if (g) {
      out.set(pid, { mssKmh: g.kmh, source: "gps_season_max", date: g.date, gpsSessions: g.sessions });
    }
  }
  return out;
}

/** Join MAS + MSS → individualised speed zones per player. Skips players missing either input or
 *  with MSS ≤ MAS (the caller shows an honest empty state, never a fabricated zone). */
export async function loadSpeedZones(teamId: string): Promise<Map<string, SpeedZones>> {
  const [masMap, mssMap] = await Promise.all([resolveMas(teamId), resolveMss(teamId)]);

  const squadAsr: Array<number | null> = [];
  for (const [pid, mas] of masMap) {
    const mss = mssMap.get(pid);
    if (mss && mss.mssKmh > mas.masKmh) squadAsr.push(mss.mssKmh - mas.masKmh);
  }

  const out = new Map<string, SpeedZones>();
  for (const [pid, mas] of masMap) {
    const mss = mssMap.get(pid); if (!mss) continue;
    const z = buildSpeedZones({
      masKmh: mas.masKmh, masSource: mas.source,
      mssKmh: mss.mssKmh, mssSource: mss.source,
      squadAsr: squadAsr.length >= 2 ? squadAsr : undefined,
      mssSessions: mss.source === "gps_season_max" ? mss.gpsSessions : undefined,
    });
    if (z) out.set(pid, z);
  }
  return out;
}

export interface HsrCapacity {
  seasonBestHsrM: number | null;   // his own observed ceiling (max individualised HSR across sessions)
  lastMatchHsrM: number | null;    // individualised HSR in his most recent match
  lastMatchDate: string | null;
  pct: number | null;              // last match as a share of his ceiling
}

/**
 * A player's match HSR as a share of his own individualised HSR ceiling. Reclassifies each
 * session's exported velocity bands (V5 ≥ 19.8, V6 ≥ 25.2 km/h) into HIS zones, takes his observed
 * season-best as the ceiling, and the latest match day (from `match_player_minutes`) as the match.
 * Honest empty (`null`) when there is no band data or no match on record.
 */
export async function loadHsrCapacity(teamId: string, playerId: string, zones: SpeedZones): Promise<HsrCapacity> {
  const sb = getSupabaseServer();

  const [dailyRes, minRes] = await Promise.all([
    fetchAllPages<{ date: string | null; velocity_band5_total_distance: number | null; velocity_band6_total_distance: number | null }>((from, to) =>
      sb.from("player_external_load_daily")
        .select("date, velocity_band5_total_distance, velocity_band6_total_distance")
        .eq("team_id", teamId).eq("player_id", playerId).in("source", ["catapult", "manual"]).range(from, to)),
    sb.from("match_player_minutes").select("match_date, minutes_played")
      .eq("team_id", teamId).eq("player_id", playerId).order("match_date", { ascending: false }).limit(200),
  ]);

  const hsrByDate = new Map<string, number>();
  let seasonBest: number | null = null;
  for (const r of dailyRes) {
    const b5 = num(r.velocity_band5_total_distance) ?? 0;
    const b6 = num(r.velocity_band6_total_distance) ?? 0;
    if (b5 <= 0 && b6 <= 0) continue;
    const { individualisedHsrM } = classifyBandsToZones(
      [{ lowerEdgeKmh: VEL_BAND5_LOWER_KMH, distanceM: b5 }, { lowerEdgeKmh: VEL_BAND6_LOWER_KMH, distanceM: b6 }],
      zones,
    );
    if (r.date) hsrByDate.set(r.date, individualisedHsrM);
    if (seasonBest === null || individualisedHsrM > seasonBest) seasonBest = individualisedHsrM;
  }

  // Most recent match day that also has GPS band data.
  let lastMatchHsrM: number | null = null, lastMatchDate: string | null = null;
  for (const m of (minRes.data ?? []) as Array<{ match_date: string | null; minutes_played: number | null }>) {
    const d = m.match_date; if (!d) continue;
    if (hsrByDate.has(d)) { lastMatchDate = d; lastMatchHsrM = hsrByDate.get(d) ?? null; break; }
  }

  const { pct } = matchHsrVsCapacity({ matchHsrM: lastMatchHsrM, seasonBestHsrM: seasonBest });
  return { seasonBestHsrM: seasonBest, lastMatchHsrM, lastMatchDate, pct };
}
