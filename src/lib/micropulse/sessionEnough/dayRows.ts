/**
 * One load row → the "Did we do enough?" variables, a session's length, and the squad's medians per day. Pure — shared
 * by the session loader (one date) and the range loader (a week / a block), so both read a row the same way:
 * the same columns, the same "needs a GPS reading" rule, the same full-session filter.
 */

import { hasNoGpsReading } from "@/lib/micropulse/periodization";
import { imaCodTotal } from "@/lib/micropulse/catapultCapability";
import { hasGpsReading, longRunsOf } from "@/lib/micropulse/longRuns";
import type { FmpValues, VarValues } from "./index";
import { MIN_SESSION_PLAYERS, WEEK_KEYS, type ActualDay, type WeekKey } from "./weekEnough";

export const MIN_TRAIN_MIN = 20;       // shorter rows are not a training session
export const PARTIAL_SHARE = 0.6;      // < 60% of the squad's median duration = shortened session
/** Minutes in the last match at/above which a player is a starter (recovers on a top-up day). Same as STARTER_MINUTES. */
const STARTER_MIN = 60;

export const num = (v: unknown): number | null => { if (v == null || v === "") return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
export const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** The variables from one load row. CoD = the six left/right columns (same as post-training/TLYP).
 *  Everything built on GPS (HSR, sprint, long-run distance, match pace) needs a GPS reading: indoors the pod stores
 *  0 or a few metres, which is a missing reading, not a 0 m session. HSR = velocity bands 5+6 and sprint = band 6,
 *  the same columns the periodization match unit reads, so the target and the session are the same measure. */
export function varsOf(r: Record<string, unknown>): VarValues {
  const gpsOk = hasGpsReading(r) && !hasNoGpsReading(num(r.total_player_load), num(r.total_distance));
  const v5 = gpsOk ? num(r.velocity_band5_total_distance) : null, v6 = gpsOk ? num(r.velocity_band6_total_distance) : null;
  return {
    imaAccel: num(r.ima_accel),
    imaDecel: num(r.ima_decel),
    imaCod: imaCodTotal(r),
    hsr: v5 != null || v6 != null ? (v5 ?? 0) + (v6 ?? 0) : null,
    sprint: v6,
    // Of the long runs, those at match pace (stored by the DB trigger; null = pace unknown).
    longRunsMp: gpsOk ? num(r.ima_fr_ge18_mp_event_count) : null,
    frDistance: hasGpsReading(r) ? num(r.ima_fr_band58_total_distance) : null,
    // Strides in runs ≥18 s (config-independent tier, backfilled for all history). Was legacy bands 6–8
    // (≥21 s) before the band edges changed on 9 Nov 2026 — the new config has no 21 s edge.
    strideHi: num(r.ima_fr_ge18_stride_count),
    longRuns: longRunsOf(r).bouts,
  };
}

/**
 * Football Movement Profile seconds from one row (Catapult, inertial, so it exists indoors). No FMP reading on the row
 * (total FMP duration missing or 0) = null in every band; with a reading, 0 s in a band is a real 0. Shown beside the
 * verdict, never judged.
 */
export function fmpOf(r: Record<string, unknown>): FmpValues {
  const ok = (num(r.fmp_total_duration_s) ?? 0) > 0;
  return {
    runHigh: ok ? num(r.fmp_running_high_s) : null,
    dynHigh: ok ? num(r.fmp_dynamic_high_s) : null,
    dynMed: ok ? num(r.fmp_dynamic_medium_s) : null,
  };
}

/** Session minutes: FMP duration (Pro), else Player Load ÷ PL/min, else the pod's session length. */
export function durationMin(r: Record<string, unknown>): number {
  const fmp = num(r.fmp_total_duration_s) ?? 0;
  if (fmp > 0) return fmp / 60;
  const tpl = num(r.total_player_load) ?? 0, plpm = num(r.player_load_per_minute) ?? 0;
  if (tpl > 0 && plpm > 0) return tpl / plpm;
  return num(r.session_duration_minutes) ?? 0;
}

/** The week view's variables from one row (Player Load and distance besides the judged four). */
export function weekVarsOf(r: Record<string, unknown>): Record<WeekKey, number | null> {
  const v = varsOf(r);
  const gpsOk = hasGpsReading(r) && !hasNoGpsReading(num(r.total_player_load), num(r.total_distance));
  const pl = num(r.total_player_load);
  return { imaAccel: v.imaAccel, imaDecel: v.imaDecel, imaCod: v.imaCod, hsr: v.hsr, load: pl != null && pl > 0 ? pl : null, dist: gpsOk ? num(r.total_distance) : null };
}

export type DayRow = Record<string, unknown> & { player_id: string; date: string };

/**
 * The squad's medians per date, players with a full session only (the session card's filter: some movement recorded,
 * ≥20 min when the length is known, not under 60% of the squad's median length). `nonStarters` = players whose last
 * match before the day was under 60 min (or who have no minutes), the ones judged on a top-up day. One row per
 * player and date is expected (oneRowPerPlayerDate).
 */
export function squadDayMedians(o: {
  dates: string[];
  rows: DayRow[];
  matchDates: Set<string>;
  /** `${playerId}|${matchDate}` → minutes (0 = did not play). */
  minutesByKey: Map<string, number>;
}): ActualDay[] {
  const matches = [...o.matchDates].sort();
  const byDate = new Map<string, DayRow[]>();
  for (const r of o.rows) { if (!byDate.has(r.date)) byDate.set(r.date, []); byDate.get(r.date)!.push(r); }
  const minutesOf = (pid: string, m: string): number | null => {
    const key = `${pid}|${m}`;
    if (o.minutesByKey.has(key)) return o.minutesByKey.get(key)!;
    const mr = byDate.get(m)?.find((x) => x.player_id === pid);
    return mr ? Math.round(durationMin(mr)) || null : null;
  };
  const medOf = (rows: Array<Record<WeekKey, number | null>>) => Object.fromEntries(WEEK_KEYS.map((k) => [k, median(rows.map((r) => r[k]).filter((x): x is number => x != null))])) as Record<WeekKey, number | null>;

  return o.dates.map((date) => {
    const isMatch = o.matchDates.has(date);
    const rows = (byDate.get(date) ?? []).filter((r) => { const v = weekVarsOf(r); return WEEK_KEYS.some((k) => (v[k] ?? 0) > 0); });
    const medDur = median(rows.map(durationMin).filter((d) => d > 0));
    const full = rows.filter((r) => {
      const d = durationMin(r);
      if (d > 0 && d < MIN_TRAIN_MIN) return false;
      return !(medDur != null && d > 0 && d < PARTIAL_SHARE * medDur);
    });
    const lastMatch = [...matches].reverse().find((m) => m < date) ?? null;
    const non = full.filter((r) => { const m = lastMatch ? minutesOf(r.player_id, lastMatch) : null; return m == null || m < STARTER_MIN; });
    const vals = full.map(weekVarsOf), nonVals = non.map(weekVarsOf);
    return {
      date, isMatch, players: full.length, med: medOf(vals),
      nonStarters: non.length, medNonStarter: nonVals.length >= MIN_SESSION_PLAYERS ? medOf(nonVals) : medOf([]),
    };
  });
}
