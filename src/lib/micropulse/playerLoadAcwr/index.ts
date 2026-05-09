/**
 * External Player Load ACWR (Acute:Chronic Workload Ratio).
 *
 * Computes the Gabbett-style 7-day acute load divided by the 28-day chronic
 * load on Catapult-derived `total_player_load`. This is the EXTERNAL load
 * counterpart to the existing RPE-based internal ACWR (player_load_metrics).
 *
 * Bands follow the most-cited thresholds from team-sport injury epidemiology:
 *   < 0.8  → UNDERTRAIN  (low chronic exposure / detraining risk)
 *   0.8–1.3 → SAFE       ("sweet spot" — Gabbett 2016)
 *   1.3–1.5 → WATCH      (elevated trajectory — monitor)
 *   > 1.5  → RISK        (3–5× injury hazard ratio — Hulin 2014)
 *
 * Implementation notes:
 *   - Acute window is 7 days, chronic window is 28 days, both ENDING on
 *     today (inclusive). Missing days are treated as zero load (rest days).
 *   - We require at least `MIN_CHRONIC_DAYS_OBSERVED` days with non-null
 *     player_load in the 28-day window before the ratio is reported. Otherwise
 *     status is INSUFFICIENT_DATA — coaches see "needs more sessions".
 *   - Pure function. No IO. The companion loader.ts pulls daily rows and
 *     hands them in.
 *
 * References:
 *   - Gabbett TJ. The training-injury prevention paradox. Br J Sports Med 2016;50(5):273-280.
 *   - Hulin BT et al. Spikes in acute workload are associated with increased
 *     injury risk in elite cricket fast bowlers. Br J Sports Med 2014;48(8):708-712.
 *   - Blanch P, Gabbett TJ. Has the athlete trained enough to return safely
 *     from injury? Br J Sports Med 2016;50(8):471-475.
 */

export type AcwrBand =
  | "INSUFFICIENT_DATA"
  | "UNDERTRAIN"
  | "SAFE"
  | "WATCH"
  | "RISK";

export type DailyLoad = {
  /** ISO date YYYY-MM-DD. */
  date: string;
  /** Player load value for that day. null = no session uploaded. 0 = recorded but rest-equivalent. */
  load: number | null;
};

export type AcwrPayload = {
  /** Mean of last 7 days of player_load (null days treated as 0). */
  acuteMean: number | null;
  /** Mean of last 28 days of player_load (null days treated as 0). */
  chronicMean: number | null;
  /** acuteMean / chronicMean. null when chronic is 0 or below threshold. */
  ratio: number | null;
  band: AcwrBand;
  /** Count of days in the 28-day window with non-null, > 0 load (real sessions). */
  daysObserved: number;
};

const ACUTE_DAYS = 7;
const CHRONIC_DAYS = 28;
const MIN_CHRONIC_DAYS_OBSERVED = 8;

const BAND_UNDERTRAIN_MAX = 0.8;
const BAND_SAFE_MAX = 1.3;
const BAND_WATCH_MAX = 1.5;

export function bandFromRatio(ratio: number | null): AcwrBand {
  if (ratio == null || !Number.isFinite(ratio)) return "INSUFFICIENT_DATA";
  if (ratio < BAND_UNDERTRAIN_MAX) return "UNDERTRAIN";
  if (ratio <= BAND_SAFE_MAX) return "SAFE";
  if (ratio <= BAND_WATCH_MAX) return "WATCH";
  return "RISK";
}

/**
 * Pad/align an array of DailyLoad rows to a contiguous 28-day window ending
 * on `todayIso`. Returns an array of length 28 where index 0 is the oldest
 * day (today - 27) and index 27 is today. Missing days become null.
 */
function alignToWindow(
  rows: ReadonlyArray<DailyLoad>,
  todayIso: string,
): Array<number | null> {
  const map = new Map<string, number | null>();
  for (const r of rows) map.set(r.date, r.load);

  const windowSize = CHRONIC_DAYS;
  const out: Array<number | null> = new Array(windowSize).fill(null);
  const today = new Date(`${todayIso}T00:00:00Z`);
  for (let i = 0; i < windowSize; i += 1) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - (windowSize - 1 - i));
    const key = d.toISOString().slice(0, 10);
    const v = map.get(key);
    if (v != null && Number.isFinite(v)) out[i] = v;
  }
  return out;
}

/**
 * Compute Player Load ACWR for `todayIso` from a window of daily-load rows.
 * `rows` may include extra dates outside the 28-day window — they're ignored.
 */
export function computePlayerLoadAcwr(
  rows: ReadonlyArray<DailyLoad>,
  todayIso: string,
): AcwrPayload {
  const aligned = alignToWindow(rows, todayIso);

  // Treat null as 0 (rest day) for mean computation, per Gabbett convention.
  const numericChronic = aligned.map((v) => (v == null ? 0 : v));
  const numericAcute = numericChronic.slice(-ACUTE_DAYS);

  const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
  const acuteMean = numericAcute.length > 0 ? sum(numericAcute) / numericAcute.length : null;
  const chronicMean = numericChronic.length > 0 ? sum(numericChronic) / numericChronic.length : null;

  // daysObserved = real sessions (non-null AND > 0)
  const daysObserved = aligned.filter((v) => v != null && v > 0).length;

  if (
    daysObserved < MIN_CHRONIC_DAYS_OBSERVED ||
    chronicMean == null ||
    chronicMean <= 0
  ) {
    return {
      acuteMean,
      chronicMean,
      ratio: null,
      band: "INSUFFICIENT_DATA",
      daysObserved,
    };
  }

  const ratio = (acuteMean ?? 0) / chronicMean;
  return {
    acuteMean,
    chronicMean,
    ratio,
    band: bandFromRatio(ratio),
    daysObserved,
  };
}

/** Stable key shown in Decision Summary driver chips and explanations. */
export const PL_ACWR_DRIVER_KEY = "PLAYER_LOAD_ACWR";

export type AcwrDriverFlag = {
  driver: typeof PL_ACWR_DRIVER_KEY;
  ratio: number;
  band: AcwrBand;
  acuteMean: number;
  chronicMean: number;
  /** "watch" when band=WATCH, "concern" when ratio between 1.5–1.8, "high" when >= 1.8. */
  severity: "watch" | "concern" | "high";
};

/**
 * Build a decision-engine driver flag when the ACWR is in elevated territory.
 * Returns null on SAFE / UNDERTRAIN / INSUFFICIENT_DATA — those don't warrant
 * a Decision Summary chip (UNDERTRAIN is informational, not a risk flag).
 */
export function buildAcwrDriverFlag(payload: AcwrPayload): AcwrDriverFlag | null {
  if (
    payload.ratio == null ||
    payload.acuteMean == null ||
    payload.chronicMean == null ||
    payload.band === "INSUFFICIENT_DATA" ||
    payload.band === "UNDERTRAIN" ||
    payload.band === "SAFE"
  ) {
    return null;
  }
  let severity: AcwrDriverFlag["severity"];
  if (payload.ratio >= 1.8) severity = "high";
  else if (payload.ratio >= 1.5) severity = "concern";
  else severity = "watch";
  return {
    driver: PL_ACWR_DRIVER_KEY,
    ratio: payload.ratio,
    band: payload.band,
    acuteMean: payload.acuteMean,
    chronicMean: payload.chronicMean,
    severity,
  };
}

/**
 * Coach-facing one-liner suitable for Decision Summary. Mirrors the format
 * we use for stride intelligence reasons.
 */
export function formatAcwrReason(flag: AcwrDriverFlag): string {
  const r = flag.ratio.toFixed(2);
  const a = Math.round(flag.acuteMean);
  const c = Math.round(flag.chronicMean);
  if (flag.severity === "high") {
    return `Player Load ACWR ${r} (7d ${a} vs 28d ${c}) — high-risk spike. Reduce HSR exposure today.`;
  }
  if (flag.severity === "concern") {
    return `Player Load ACWR ${r} (7d ${a} vs 28d ${c}) — elevated load trajectory. Monitor closely.`;
  }
  return `Player Load ACWR ${r} (7d ${a} vs 28d ${c}) — trending toward overload. Watch.`;
}
