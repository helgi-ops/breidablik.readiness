/**
 * Near-top-speed exposure — "how long since this player last ran at 90% of their own top speed?"
 *
 * Pure and client-safe. The coach's question (Nov 2026): flag a player who has not reached 90% of max speed
 * for a while. Reaching near top speed regularly is associated with fewer lower-limb / hamstring injuries,
 * and both too little and a sudden jump raise risk:
 *   - Malone S et al. 2017, J Sci Med Sport 20:250–254 (elite Gaelic football): players who produced >95% of
 *     max velocity at least once in training had lower injury risk than those below 85%; under- AND
 *     over-exposure raised risk (U-shape). Weekly unit.
 *   - Buchheit M, Settembre M, Hader K, McHugh D. 2023, Biol Sport (627 players, 96 match hamstring
 *     injuries): no match hamstring injuries when >95% exposures happened at D-2. Observational, not causal.
 *   - Edouard P et al. 2019, Sport Perform Sci Rep 48 — sprinting as a "vaccine" for hamstring injury.
 * None of them gives a day count. The two marks below are MicroPulse's, chosen by the coach on Breiðablik's
 * 2026 season (23 players, 627 days at ≥90%): median gap between such days 5 d, 75% of gaps ≤ 9 d; replayed
 * with the real loader, a typical in-season day has 4.2 players past 10 d, 1.5 of them past 21 d.
 *
 * Top speed (the coach's choice) = the THIRD-fastest measured GPS day in the last 12 months, so one GPS spike
 * can't set it (median best day 32.4 km/h vs third-best 31.2); a measured sprint test wins when it is higher.
 *
 * Descriptive only — a signal BESIDE the readiness colour, never it; never a load target or decision.
 */

/** Share of the player's own top speed that counts as a near-top-speed run. */
export const NEAR_MAX_PCT = 0.9;
/** More than this many days since the last such run → "due". */
export const DUE_DAYS = 10;
/** More than this many days → "long gap" (build back in steps, not straight to a flat-out sprint). */
export const LONG_GAP_DAYS = 21;
/** Measured GPS days needed before the third-fastest day is trusted as top speed. */
export const MIN_REF_DAYS = 10;
/** Days at/above which the top speed is called well-founded (confidence "high"). */
export const HIGH_CONF_REF_DAYS = 30;
/** A player with no measured GPS day in this window is not flagged (injured, away, off-season, indoors only). */
export const ACTIVE_WINDOW_DAYS = 10;
/** How far back top speed and the last near-top-speed run are read. */
export const LOOKBACK_DAYS = 365;
/** Plausible top-speed window (km/h). The ingest clamp is 38 (`clampMaxVelocityKmh`). */
export const MIN_VALID_KMH = 10;
export const MAX_VALID_KMH = 38;
/** Same idea as `hasNoGpsReading` (periodization): load but under 200 m = no satellite lock (indoors). */
const NO_GPS_MAX_M = 200;

/** One GPS row as stored (several rows can share a date). Speeds are km/h. */
export type SpeedRow = {
  date: string;
  maxVelocity: number | null;
  maxVel: number | null;
  playerLoad: number | null;
  totalDistance: number | null;
};

/** One player-day with a real top-speed reading (indoor / empty days are dropped, never read as 0). */
export type SpeedDay = { date: string; kmh: number };

export type NearMaxLevel = "ok" | "due" | "long_gap";

export type TopSpeedRef = {
  kmh: number;
  source: "gps_third_best" | "sprint_test";
  /** Measured GPS days behind the reference. */
  days: number;
};

export type NearMaxRead = {
  level: NearMaxLevel;
  /** Days since the last run at ≥90% of top speed; null = none found in the look-back. */
  daysSince: number | null;
  lastDate: string | null;
  lastKmh: number | null;
  ref: TopSpeedRef;
  /** The speed that counts (90% of top speed), km/h. */
  targetKmh: number;
  confidence: "high" | "moderate";
};

const fin = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const round1 = (v: number) => Math.round(v * 10) / 10;

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);
}

/**
 * Collapse stored rows to one measured top speed per date. A row with Player Load but under 200 m is an
 * indoor day (no GPS): it is dropped, so it neither counts as a run nor as "no run". Speeds outside
 * 10–38 km/h are dropped as noise.
 */
export function mergeSpeedDays(rows: SpeedRow[]): SpeedDay[] {
  const byDate = new Map<string, number>();
  for (const r of rows) {
    const date = String(r.date ?? "").slice(0, 10);
    if (!date) continue;
    const pl = fin(r.playerLoad);
    const dist = fin(r.totalDistance);
    if (pl != null && pl > 0 && dist != null && dist < NO_GPS_MAX_M) continue;
    const v = Math.max(fin(r.maxVelocity) ?? 0, fin(r.maxVel) ?? 0);
    if (v < MIN_VALID_KMH || v > MAX_VALID_KMH) continue;
    byDate.set(date, Math.max(byDate.get(date) ?? 0, v));
  }
  return [...byDate.entries()].map(([date, kmh]) => ({ date, kmh })).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * The player's top speed: third-fastest measured day in the last 12 months (needs ≥ MIN_REF_DAYS days), or a
 * measured sprint test when that is higher. null when neither exists — no reference, no flag.
 */
export function referenceTopSpeed(days: SpeedDay[], todayIso: string, sprintTestKmh?: number | null): TopSpeedRef | null {
  const inWindow = days.filter((d) => d.date <= todayIso && daysBetween(d.date, todayIso) <= LOOKBACK_DAYS);
  const sorted = inWindow.map((d) => d.kmh).sort((a, b) => b - a);
  const gps = sorted.length >= MIN_REF_DAYS ? sorted[2] : null;
  const t = fin(sprintTestKmh);
  const test = t != null && t >= MIN_VALID_KMH && t <= MAX_VALID_KMH ? t : null;
  if (test != null && (gps == null || test > gps)) return { kmh: round1(test), source: "sprint_test", days: inWindow.length };
  if (gps != null) return { kmh: round1(gps), source: "gps_third_best", days: inWindow.length };
  return null;
}

/**
 * How long since the last run at ≥90% of top speed. Returns null (= say nothing) when there is no top-speed
 * reference, or when the player has no measured GPS day in the last ACTIVE_WINDOW_DAYS — an absent player
 * is unknown, not overdue.
 */
export function computeNearMaxExposure(input: { days: SpeedDay[]; todayIso: string; sprintTestKmh?: number | null }): NearMaxRead | null {
  const { todayIso } = input;
  const days = input.days.filter((d) => d.date <= todayIso && daysBetween(d.date, todayIso) <= LOOKBACK_DAYS);
  const ref = referenceTopSpeed(days, todayIso, input.sprintTestKmh);
  if (!ref) return null;
  const active = days.some((d) => daysBetween(d.date, todayIso) < ACTIVE_WINDOW_DAYS);
  if (!active) return null;

  const target = ref.kmh * NEAR_MAX_PCT;
  let last: SpeedDay | null = null;
  // 1e-9: 31 × 0.9 is 27.900000000000002 in floating point — a day at exactly 90% must count.
  for (const d of days) if (d.kmh >= target - 1e-9 && (!last || d.date > last.date)) last = d;
  const daysSince = last ? daysBetween(last.date, todayIso) : null;
  const level: NearMaxLevel = daysSince == null || daysSince > LONG_GAP_DAYS ? "long_gap" : daysSince > DUE_DAYS ? "due" : "ok";

  return {
    level,
    daysSince,
    lastDate: last?.date ?? null,
    lastKmh: last ? round1(last.kmh) : null,
    ref,
    targetKmh: round1(target),
    confidence: ref.source === "sprint_test" || ref.days >= HIGH_CONF_REF_DAYS ? "high" : "moderate",
  };
}
