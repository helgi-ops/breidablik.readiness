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

const MII_METRICS: MiiMetricSpec[] = [
  {
    metric: "player_load",
    unit: "AU",
    valueKey: (n) => `max_intensity_interval_player_load_interval_${n}`,
    timeKey: (n, se) => `max_intensity_interval_pl_interval_${n}_${se}_time`,
  },
  {
    metric: "distance",
    unit: "m",
    valueKey: (n) => `max_intensity_interval_distance_interval_${n}`,
    timeKey: (n, se) => `max_intensity_interval_dist_interval_${n}_${se}_time`,
  },
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
      const windowMin = Math.round((seconds / 60) * 2) / 2;
      if (!(windowMin > 0)) continue;
      let perMetric = best.get(spec.metric);
      if (!perMetric) { perMetric = new Map(); best.set(spec.metric, perMetric); }
      const prev = perMetric.get(windowMin);
      if (prev == null || value > prev) perMetric.set(windowMin, value);
    }
  }

  const out: MiiPeakDatum[] = [];
  for (const spec of MII_METRICS) {
    const perMetric = best.get(spec.metric);
    if (!perMetric) continue;
    for (const [windowMin, value] of perMetric) {
      out.push({ windowMin, metric: spec.metric, value, unit: spec.unit });
    }
  }
  // Stable order: metric, then window ascending.
  out.sort((a, b) => (a.metric === b.metric ? a.windowMin - b.windowMin : a.metric.localeCompare(b.metric)));
  return out;
}
