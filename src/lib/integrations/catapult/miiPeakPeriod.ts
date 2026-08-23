/**
 * MII (Maximal Intensity Interval) → peak-period power-curve rows.
 *
 * Catapult OpenField's "Maximal Intensity Interval" parameters ARE the peak rolling
 * windows per metric — the ADI power curve — and they come through the v6 /stats API
 * automatically once enabled in the org (confirmed on real Breiðablik data 2026-08-15:
 * player-load intervals resolve to 1 / 3 / 5-minute windows via their start/end times).
 *
 * IMPORTANT: the echoed display-name keys ("MII Player Load Interval 1", "Peak Player
 * Load") come back as 0 and must NOT be read. The real values live under snake_case:
 *   value:  max_intensity_interval_player_load_interval_{1,2,3}
 *           max_intensity_interval_distance_interval_{1,2,3}
 *   window: max_intensity_interval_pl_interval_{n}_{start,end}_time   (player load)
 *           max_intensity_interval_dist_interval_{n}_{start,end}_time (distance)
 * The window length (minutes) is DERIVED from (end − start), not labelled — so a
 * reconfigured MII window in OpenField is picked up automatically, no code change.
 *
 * Pure, no I/O. Descriptive load context only — NEVER feeds the readiness colour,
 * the load target, or the daily decision. Output matches the `player_load_peak_period`
 * long format (window_min, metric, value, unit) the power-curve card already reads.
 */

/** One peak-period datum ready to upsert into player_load_peak_period. */
export type MiiPeakDatum = {
  windowMin: number;
  metric: string;
  value: number;
  unit: string;
};

type MiiMetricSpec = {
  /** Canonical metric key (matches parseCatapultPeakPeriod + the card's metric tabs). */
  metric: string;
  unit: string;
  /** Key holding the interval's value, e.g. `..._player_load_interval_1`. */
  valueKey: (n: number) => string;
  /** Key holding the interval's start/end epoch seconds (note: pl/dist, not the value word). */
  timeKey: (n: number, se: "start" | "end") => string;
};

// NOTE the units are PER-MINUTE ("AU/min", "m/min"). The raw MII value is the total
// accumulated over the interval (cumulative), but the power-curve engine + curve-shape
// classifier expect per-minute INTENSITY (peakPeriod.ts / curveShape.ts) — a curve that
// DECREASES with window length, so "retention" = long/short is a real 0–100% hold. We
// therefore store value ÷ windowMin. Storing the cumulative total made the curve rise and
// the shape read a nonsensical "372% retention".
const MII_METRICS: MiiMetricSpec[] = [
  {
    metric: "player_load",
    unit: "AU/min",
    valueKey: (n) => `max_intensity_interval_player_load_interval_${n}`,
    timeKey: (n, se) => `max_intensity_interval_pl_interval_${n}_${se}_time`,
  },
  {
    metric: "distance",
    unit: "m/min",
    valueKey: (n) => `max_intensity_interval_distance_interval_${n}`,
    timeKey: (n, se) => `max_intensity_interval_dist_interval_${n}_${se}_time`,
  },
];

// Speculative HIGH-SPEED / HIR interval — the >19.8-km/h fraction per peak window, needed for
// the Ju-2022 Table-2 score. OpenField MAY expose an MII interval for a high-speed metric under
// one of several snake_case names (the exact key depends on which parameter the org enabled).
// This is best-effort: if none of these keys is present the pass emits nothing (a no-op), so the
// CTR upload stays the reliable source until the org turns an HSR MII parameter on. When the key
// DOES appear, the daily sync populates it automatically — no code change. Stored as metric 'hsr'
// (m/min). The account HSR threshold is NOT carried by the MII feed, so the Ju comparison labels
// the threshold as "not recorded" for MII-sourced HSR (the CTR path carries it).
const HSR_VALUE_CANDIDATES: Array<(n: number) => string> = [
  (n) => `max_intensity_interval_hsr_interval_${n}`,
  (n) => `max_intensity_interval_high_speed_distance_interval_${n}`,
  (n) => `max_intensity_interval_high_speed_running_interval_${n}`,
  (n) => `max_intensity_interval_hir_distance_interval_${n}`,
  (n) => `max_intensity_interval_hir_interval_${n}`,
  (n) => `max_intensity_interval_velocity_band6_interval_${n}`,
  (n) => `max_intensity_interval_vel_b6_interval_${n}`,
  (n) => `max_intensity_interval_v6_interval_${n}`,
];
const HSR_TIME_CANDIDATES: Array<(n: number, se: "start" | "end") => string> = [
  (n, se) => `max_intensity_interval_hsr_interval_${n}_${se}_time`,
  (n, se) => `max_intensity_interval_high_speed_interval_${n}_${se}_time`,
  (n, se) => `max_intensity_interval_hir_interval_${n}_${se}_time`,
  (n, se) => `max_intensity_interval_vb6_interval_${n}_${se}_time`,
];

/** How many interval slots OpenField reports (typically 3 = 1/3/5-min). Scan a few extra. */
const MAX_INTERVAL_SLOTS = 6;

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

/**
 * Extract the peak-period power curve from one athlete's raw Catapult stats row.
 * Returns one datum per (metric, window) with a positive value and a derivable window;
 * empty when the row carries no MII fields (the common case for orgs that haven't
 * enabled it). If two intervals resolve to the same window, the larger value wins.
 */
export function extractMiiPeakPeriod(raw: Record<string, unknown> | null | undefined): MiiPeakDatum[] {
  if (!raw || typeof raw !== "object") return [];
  // Case-insensitive flat lookup (MII keys are top-level snake_case, but be tolerant).
  const flat: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) flat[k.toLowerCase()] = v;

  // metric → windowMin → best value
  const best = new Map<string, Map<number, number>>();
  // interval slot n → windowMin (from any metric's start/end times) — lets the speculative
  // HSR pass borrow the window length when the HSR interval has no time keys of its own.
  const slotWindow = new Map<number, number>();
  const halfMin = (seconds: number): number => Math.round((seconds / 60) * 2) / 2;
  const record = (metric: string, windowMin: number, value: number) => {
    let perMetric = best.get(metric);
    if (!perMetric) { perMetric = new Map(); best.set(metric, perMetric); }
    const prev = perMetric.get(windowMin);
    if (prev == null || value > prev) perMetric.set(windowMin, value);
  };

  for (const spec of MII_METRICS) {
    for (let n = 1; n <= MAX_INTERVAL_SLOTS; n++) {
      const value = num(flat[spec.valueKey(n).toLowerCase()]);
      if (value == null || value <= 0) continue;
      const start = num(flat[spec.timeKey(n, "start").toLowerCase()]);
      const end = num(flat[spec.timeKey(n, "end").toLowerCase()]);
      if (start == null || end == null) continue;
      const seconds = end - start;
      if (!(seconds > 0)) continue;
      // Round to the nearest half-minute — real windows are 60/180/300 s → 1/3/5 min.
      const windowMin = halfMin(seconds);
      if (!(windowMin > 0)) continue;
      slotWindow.set(n, windowMin);
      record(spec.metric, windowMin, value);
    }
  }

  // Speculative HSR / HIR interval (metric 'hsr', m/min) — no-op unless the org exposes it.
  for (let n = 1; n <= MAX_INTERVAL_SLOTS; n++) {
    let value: number | null = null;
    for (const kf of HSR_VALUE_CANDIDATES) { const v = num(flat[kf(n).toLowerCase()]); if (v != null && v > 0) { value = v; break; } }
    if (value == null) continue;
    let windowMin: number | null = null;
    for (const tf of HSR_TIME_CANDIDATES) {
      const start = num(flat[tf(n, "start").toLowerCase()]); const end = num(flat[tf(n, "end").toLowerCase()]);
      if (start != null && end != null && end - start > 0) { windowMin = halfMin(end - start); break; }
    }
    if (windowMin == null) windowMin = slotWindow.get(n) ?? null; // borrow the slot's window
    if (windowMin == null || !(windowMin > 0)) continue;
    record("hsr", windowMin, value);
  }

  const unitOf = (metric: string): string => (metric === "hsr" ? "m/min" : MII_METRICS.find((s) => s.metric === metric)?.unit ?? "");
  const out: MiiPeakDatum[] = [];
  for (const [metric, perMetric] of best) {
    for (const [windowMin, cumulative] of perMetric) {
      // Cumulative total → per-minute intensity (the engine's contract; makes the curve
      // decrease with window and the shape's retention a real 0–100% hold).
      const perMin = Math.round((cumulative / windowMin) * 100) / 100;
      out.push({ windowMin, metric, value: perMin, unit: unitOf(metric) });
    }
  }
  // Stable order: metric, then window ascending.
  out.sort((a, b) => (a.metric === b.metric ? a.windowMin - b.windowMin : a.metric.localeCompare(b.metric)));
  return out;
}
