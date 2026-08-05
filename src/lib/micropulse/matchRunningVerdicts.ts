/**
 * Shared loader: the matchday-load-vs-match-running verdict per (player, match
 * date) for a team, so every benchmark/averaging surface applies the SAME
 * exclusion and every display surface shows the SAME label — one source, no
 * drift. See matchMinutes.ts for the classification itself.
 *
 * Inputs it assembles per (player, date):
 *   pod window   — sum of player_drill_load period durations (the stadium-clock
 *                  window the pod recorded); "1st half" row ⇒ the player started.
 *   minutes      — coach-entered on-pitch minutes from match_player_minutes
 *                  (no row ⇒ null ⇒ verdict "unknown").
 *   distance/HSR — from player_external_load_daily (manual overrides catapult).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyMatchLoad, type MatchLoadVerdict } from "./matchMinutes";
import { classifyHalf } from "@/lib/micropulse/matchIntensityHalves";
import { oneRowPerPlayerDate } from "@/lib/micropulse/load/oneRowPerDate";

export type MatchVerdictMap = Map<string, MatchLoadVerdict>; // key: `${playerId}|${date}`

export const verdictKey = (playerId: string, date: string) => `${playerId}|${date}`;

/**
 * TRUE only when a row's match-running numbers are KNOWN to be wrong and must be
 * dropped from any match benchmark: a substitute's touchline warm-up, an unused
 * bench player, or an impossible rate. Crucially this does NOT drop "unknown"
 * (minutes not entered) — excluding those would empty the benchmark for every
 * team that never enters minutes. Matchday LOAD (ACWR/weekly totals) must keep
 * using the full number regardless; this gate is for MATCH-RUNNING benchmarks
 * only.
 */
export function isContaminatedForBenchmark(v: MatchLoadVerdict | undefined | null): boolean {
  if (!v) return false;
  return v.implausible || v.context === "bench_contaminated" || v.context === "unused";
}

interface PeriodRow { player_id: string; session_date: string; period_name: string | null; duration_min: number | null }
interface LoadRow { player_id?: string | null; date: string; source?: string | null; total_distance?: number | null; high_speed_distance?: number | null }
interface MinRow { player_id: string; match_date: string; minutes_played: number | null; is_dnp: boolean | null }

const num = (v: unknown): number | null => (v == null ? null : Number.isFinite(Number(v)) ? Number(v) : null);

export async function loadMatchVerdicts(
  supabase: SupabaseClient, teamId: string, dates: string[],
): Promise<MatchVerdictMap> {
  const out: MatchVerdictMap = new Map();
  const uniq = Array.from(new Set(dates.filter(Boolean)));
  if (!uniq.length) return out;

  const [periodsRes, loadRes, minsRes] = await Promise.all([
    supabase.from("player_drill_load")
      .select("player_id, session_date, period_name, duration_min")
      .eq("team_id", teamId).in("session_date", uniq),
    supabase.from("player_external_load_daily")
      .select("player_id, date, source, total_distance, high_speed_distance")
      .eq("team_id", teamId).in("date", uniq).in("source", ["catapult", "manual"]).limit(10000),
    supabase.from("match_player_minutes")
      .select("player_id, match_date, minutes_played, is_dnp")
      .eq("team_id", teamId).in("match_date", uniq),
  ]);

  // Pod window + started, per player|date.
  const pod = new Map<string, { minutes: number; started: boolean }>();
  for (const r of (periodsRes.data ?? []) as PeriodRow[]) {
    const k = verdictKey(String(r.player_id), r.session_date);
    const cur = pod.get(k) ?? { minutes: 0, started: false };
    cur.minutes += Number(r.duration_min) || 0;
    // A starter has a FIRST-HALF period row. Detect it with the canonical
    // classifier so non-English Catapult naming counts too — Breiðablik's periods
    // are "Fyrri hálfleikur", which `.includes("1st")` misses, mislabelling every
    // starter as a substitute and false-flagging his match as bench-contaminated.
    if (classifyHalf(r.period_name) === 1) cur.started = true;
    pod.set(k, cur);
  }

  // One effective load row per player|date (manual overrides catapult), keyed.
  const load = new Map<string, LoadRow>();
  for (const r of oneRowPerPlayerDate((loadRes.data ?? []) as LoadRow[])) {
    load.set(verdictKey(String(r.player_id), r.date), r);
  }

  // Coach-entered on-pitch minutes (a DNP row is 0 min).
  const mins = new Map<string, number>();
  for (const m of (minsRes.data ?? []) as MinRow[]) {
    mins.set(verdictKey(String(m.player_id), m.match_date), m.is_dnp ? 0 : Number(m.minutes_played) || 0);
  }

  // Classify every (player, date) we have any signal for.
  const keys = new Set<string>([...pod.keys(), ...load.keys(), ...mins.keys()]);
  for (const k of keys) {
    const p = pod.get(k);
    const l = load.get(k);
    out.set(k, classifyMatchLoad({
      podMinutes: p ? Math.round(p.minutes * 10) / 10 : null,
      minutesPlayed: mins.has(k) ? mins.get(k)! : null,
      distanceM: num(l?.total_distance),
      highSpeedM: num(l?.high_speed_distance),
      startedMatch: p ? p.started : null,
    }));
  }
  return out;
}
