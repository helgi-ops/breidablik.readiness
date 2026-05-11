/**
 * Player Trend Forecast — pattern detection over 14 days of STEN scores.
 *
 * Reads the per-day z-score history (`athlete_decision_history.z_today`)
 * for ONE player, fits a simple linear trend, and projects what the next
 * 1–3 days look like if the trend continues. Output is a coach-facing
 * narrative — not a verdict modifier — so the system stays predictable
 * but the coach gets a forward-looking signal:
 *
 *   "Atli has dropped 1 STEN per session over the last 4 days. If the
 *    trend continues he'll be in RECOVERY band by Friday."
 *
 *   "Kristófer climbed steadily this week — peak readiness for tomorrow's
 *    high-intensity block."
 *
 * Pure deterministic. No LLM, no API call. Companion loader fetches the
 * rows and the UI surfaces the result.
 *
 * Sport-science note:
 *   - We only forecast when there are ≥ 5 days of observed data and the
 *     trend has a meaningful slope (|Δz/day| ≥ 0.1).
 *   - Forecast horizon is capped at 3 days. Past that, predictive power
 *     is dominated by upcoming session content (which we don't model).
 *   - Confidence is gated by how clean the trend is (R² of the fit).
 *     A noisy player with high day-to-day variance gets "low" confidence
 *     even if the slope happens to be steep.
 *
 * References:
 *   - Robertson 2017 — wellness Z-score trend windows for fatigue detection.
 *   - Hulin 2014 — multi-day trajectory > single-day spike for injury risk.
 */

export type DailyZ = {
  /** ISO date YYYY-MM-DD. */
  date: string;
  /** Z-score (player vs personal baseline). */
  z: number;
};

export type TrendDirection = "improving" | "stable" | "declining" | "sharply_declining";

export type TrendForecastPayload = {
  /** Days of clean data used in the fit. */
  daysObserved: number;
  /** Linear regression slope in z-units per day (positive = improving). */
  slopePerDay: number | null;
  /** R² of the fit, 0–1. Higher = cleaner trend. */
  r2: number | null;
  /** Categorical direction. */
  direction: TrendDirection;
  /** "low" / "medium" / "high" — how much weight to give the forecast. */
  confidence: "low" | "medium" | "high";
  /** Projected z 3 days from today (today's z + slope × 3). null when no data. */
  projectedZ3d: number | null;
  /** Projected STEN band 3 days out: 1–10 scale, or null. */
  projectedSten3d: number | null;
  /** Today's most recent z. */
  todayZ: number | null;
  /** Today's STEN. */
  todaySten: number | null;
};

const MIN_DAYS_FOR_FIT = 5;
const SLOPE_NOISE_THRESHOLD = 0.1; // per day
const SLOPE_SHARP_THRESHOLD = 0.25; // per day = >1 STEN drop in 4 days

/** STEN = z × 2 + 5.5, clamped to [1, 10]. Mirror of zToSten used elsewhere. */
function zToSten(z: number): number {
  const raw = z * 2 + 5.5;
  return Math.round(Math.max(1, Math.min(10, raw)) * 10) / 10;
}

/** Simple linear regression. Returns slope, intercept and R². Days are
 *  encoded as integer offsets (oldest = 0, newest = N-1). */
function linRegress(values: number[]): { slope: number; intercept: number; r2: number } | null {
  const n = values.length;
  if (n < 2) return null;

  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - meanX) * (values[i] - meanY);
    den += (i - meanX) ** 2;
  }
  if (den === 0) return null;
  const slope = num / den;
  const intercept = meanY - slope * meanX;

  // R²
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    const yHat = slope * i + intercept;
    ssRes += (values[i] - yHat) ** 2;
    ssTot += (values[i] - meanY) ** 2;
  }
  const r2 = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;
  return { slope, intercept, r2 };
}

/**
 * Compute the trend payload for one player from a window of daily z-scores.
 * Rows must be sorted oldest → newest by the caller.
 */
export function computePlayerTrend(rows: ReadonlyArray<DailyZ>): TrendForecastPayload {
  const clean = rows.filter((r) => r.z != null && Number.isFinite(r.z));
  const todayRow = clean[clean.length - 1] ?? null;
  const todayZ = todayRow ? todayRow.z : null;
  const todaySten = todayZ != null ? zToSten(todayZ) : null;

  if (clean.length < MIN_DAYS_FOR_FIT) {
    return {
      daysObserved: clean.length,
      slopePerDay: null,
      r2: null,
      direction: "stable",
      confidence: "low",
      projectedZ3d: null,
      projectedSten3d: null,
      todayZ,
      todaySten,
    };
  }

  const fit = linRegress(clean.map((r) => r.z));
  if (!fit) {
    return {
      daysObserved: clean.length,
      slopePerDay: null,
      r2: null,
      direction: "stable",
      confidence: "low",
      projectedZ3d: null,
      projectedSten3d: null,
      todayZ,
      todaySten,
    };
  }

  const { slope, r2 } = fit;
  let direction: TrendDirection;
  if (Math.abs(slope) < SLOPE_NOISE_THRESHOLD) direction = "stable";
  else if (slope > 0) direction = "improving";
  else if (Math.abs(slope) >= SLOPE_SHARP_THRESHOLD) direction = "sharply_declining";
  else direction = "declining";

  // Confidence based on R² — clean linear trend gets weight, noisy data
  // gets discounted even if the slope is steep.
  let confidence: "low" | "medium" | "high";
  if (r2 >= 0.6 && Math.abs(slope) >= SLOPE_NOISE_THRESHOLD) confidence = "high";
  else if (r2 >= 0.3) confidence = "medium";
  else confidence = "low";

  const projectedZ3d = todayZ != null ? todayZ + slope * 3 : null;
  const projectedSten3d = projectedZ3d != null ? zToSten(projectedZ3d) : null;

  return {
    daysObserved: clean.length,
    slopePerDay: slope,
    r2,
    direction,
    confidence,
    projectedZ3d,
    projectedSten3d,
    todayZ,
    todaySten,
  };
}

/**
 * Coach-facing one-liner. Empty string when nothing meaningful to say
 * (low confidence + stable direction = silent).
 */
export function formatTrendForecast(
  payload: TrendForecastPayload,
  lang: "IS" | "EN" = "EN",
): string {
  if (
    payload.direction === "stable" ||
    payload.confidence === "low" ||
    payload.slopePerDay == null ||
    payload.todaySten == null ||
    payload.projectedSten3d == null
  ) {
    return "";
  }

  // STEN-per-day to band terms (1 STEN = 0.5 z)
  const stenPerDay = Math.abs(payload.slopePerDay) * 2;
  const stenPerDayStr = stenPerDay >= 0.5 ? `${stenPerDay.toFixed(1)} STEN/day` : `${(stenPerDay * 7).toFixed(1)} STEN/week`;

  if (payload.direction === "improving") {
    return lang === "IS"
      ? `Hækkar jafnt og þétt — STEN ${payload.todaySten} → ${payload.projectedSten3d} eftir 3 daga ef trendinn heldur.`
      : `Trending steadily upward — STEN ${payload.todaySten} → ${payload.projectedSten3d} in 3 days if the trend holds.`;
  }

  if (payload.direction === "sharply_declining") {
    const recoveryRisk = payload.projectedSten3d <= 4;
    return lang === "IS"
      ? `Skarp lækkun (${stenPerDayStr}) — STEN ${payload.todaySten} → ${payload.projectedSten3d} eftir 3 daga. ${recoveryRisk ? "Líklega kominn í RECOVERY band ef ekkert breytist." : "Fylgjastu vel með næstu 1–2 sessions."}`
      : `Sharp decline (${stenPerDayStr}) — STEN ${payload.todaySten} → ${payload.projectedSten3d} in 3 days. ${recoveryRisk ? "Likely to be in the RECOVERY band if nothing changes." : "Watch the next 1–2 sessions closely."}`;
  }

  // declining
  const recoveryRisk = payload.projectedSten3d <= 4;
  return lang === "IS"
    ? `Mild lækkun (${stenPerDayStr}) — STEN ${payload.todaySten} → ${payload.projectedSten3d} eftir 3 daga.${recoveryRisk ? " Gæti farið í RECOVERY band ef trendinn heldur." : ""}`
    : `Mild decline (${stenPerDayStr}) — STEN ${payload.todaySten} → ${payload.projectedSten3d} in 3 days.${recoveryRisk ? " Could enter the RECOVERY band if the trend continues." : ""}`;
}
