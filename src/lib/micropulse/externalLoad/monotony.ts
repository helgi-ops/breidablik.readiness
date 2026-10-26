/**
 * Weekly training MONOTONY & STRAIN (Foster 1998).
 *
 * Monotony = how EVEN the daily loads are across the week (mean daily load ÷ SD of daily load). A week
 * loaded almost the same every day — no hard/easy contrast, no real rest — scores high; a week with clear
 * peaks and troughs scores low. Strain = weekly total × monotony. High monotony (classically ≳2) together
 * with high strain tracks fatigue, illness and non-functional overreaching — used as a SIGNAL beside the
 * weekly total, within a multi-indicator view, never as a standalone predictor and never as the readiness
 * colour (Foster 1998; Nobari et al. IMU monotony/strain 2020/2021; ML multi-indicator 2026).
 *
 * Pure, IO-free. The daily series should be the week's calendar days (rest/no-data = 0 is legitimate — an
 * extra rest day lowers monotony, which is the point), using one primary load metric (PlayerLoad / IMA).
 */

export type MonotonyBand = "ok" | "elevated" | "high";

/** Foster bands: ok < 1.5, elevated 1.5–2.0, high > 2.0. */
export function monotonyBand(monotony: number): MonotonyBand {
  return monotony > 2 ? "high" : monotony >= 1.5 ? "elevated" : "ok";
}

export interface WeeklyMonotony {
  monotony: number;   // mean / SD of the daily loads
  strain: number;     // weekly total × monotony
  band: MonotonyBand;
  daysUsed: number;   // number of daily values the figures are based on
}

/**
 * Compute monotony + strain from a week's daily loads. Returns null when it cannot be defined: fewer than
 * `minDays` daily values, a zero/near-zero mean, or zero spread (SD = 0 → undefined monotony). Population
 * SD (÷n), as in Foster's original. `minDays` default 3 so a barely-started week doesn't show a figure.
 */
export function weeklyMonotony(dailyLoads: number[], minDays = 3): WeeklyMonotony | null {
  const xs = dailyLoads.filter((x) => typeof x === "number" && Number.isFinite(x));
  if (xs.length < minDays) return null;
  const n = xs.length;
  const total = xs.reduce((s, x) => s + x, 0);
  const mean = total / n;
  if (mean <= 0) return null;
  const variance = xs.reduce((s, x) => s + (x - mean) ** 2, 0) / n;
  const sd = Math.sqrt(variance);
  if (sd <= 0) return null; // every day identical → monotony undefined (would divide by zero)
  const monotony = Math.round((mean / sd) * 100) / 100;
  return { monotony, strain: Math.round(total * monotony), band: monotonyBand(monotony), daysUsed: n };
}
