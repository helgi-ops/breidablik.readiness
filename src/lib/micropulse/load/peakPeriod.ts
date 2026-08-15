/**
 * Peak-period read (ADI-grade) — pure, side-effect free.
 *
 * A TRUE peak period is the worst rolling window in a session: the most demanding
 * 1 / 3 / 5-minute stretch for a metric (PlayerLoad, high-speed running, metabolic
 * power, acceleration density). Plotting the peak value against window length gives the
 * POWER CURVE — how intensity decays as the window widens — the read Hudl validated by
 * acquiring ADI ("the true cost of the game's most demanding moments").
 *
 * This needs a per-interval / peak-period export (Catapult OpenField Peak-Period report,
 * Statsport/WIMU equivalents), stored long-format in player_load_peak_period. The daily
 * summary table has no sub-session series, so peakIntensity.ts is the Phase-1 proxy and
 * THIS is the Phase-2 real thing. This engine consumes the long-format rows and produces
 * the per-session power curve + the player's season-best curve, benchmarked vs squad.
 *
 * HONEST PROVENANCE:
 *   - Values are read as reported by the export; we do not re-derive them from raw 10 Hz.
 *   - A missing (window, metric) cell is null, never 0.
 *   - Descriptive context. NEVER feeds the readiness colour, load target, or daily decision.
 *
 * Cite: Delaney 2017 (peak locomotor demands) · di Prampero 2015 (metabolic power) ·
 *       the peak-period / power-curve method (ADI, Catapult OpenField).
 */

/** A plain-language string in both UI languages. */
export type Bi = { en: string; is: string };
export type Confidence = "low" | "medium" | "high";

/** One long-format peak-period datum (as stored in player_load_peak_period). */
export interface PeakPeriodRow {
  date: string;
  /** Rolling window length in minutes (1, 3, 5, …). */
  windowMin: number;
  /** Metric key, e.g. "player_load" | "hsr" | "metabolic_power" | "accel_density". */
  metric: string;
  /** Peak (worst) rolling-window value for that metric. Null if absent. */
  value: number | null;
  /** Optional unit label for display. */
  unit?: string | null;
}

/** One point on a power curve: the peak value at a given window length. */
export interface CurvePoint {
  windowMin: number;
  value: number | null;
  /** Value vs the player's season-best at this window (100 = his season peak). */
  index: number | null;
}

/** The power curve for one metric (one session, or the player's season-best). */
export interface PowerCurve {
  metric: string;
  unit: string | null;
  points: CurvePoint[];
}

export interface PeakPeriodSession {
  date: string;
  curves: PowerCurve[];
}

export interface PeakPeriodRead {
  /** The most recent session's power curves (per metric). */
  latest: PeakPeriodSession | null;
  /** The player's SEASON-BEST curve per metric (the max at each window across all sessions). */
  seasonBest: PowerCurve[];
  /** How many sessions and metrics the read is built from. */
  dataCoverage: { sessions: number; metrics: number; windows: number[] };
  confidence: Confidence;
  citation: string;
  caveat: Bi;
}

/** Baselines below this many peak-period sessions are immature → confidence capped low. */
export const MIN_MATURE_PEAKPERIOD_SESSIONS = 4;

const CITATION =
  "Delaney 2017 (peak locomotor demands) · di Prampero 2015 (metabolic power) · ADI / Catapult OpenField (peak-period power curve)";

const CAVEAT: Bi = {
  en: "The power curve is the peak (worst) rolling window at each length (1/3/5 min) for a metric, from the Catapult peak-period export — the true cost of the game's most demanding moments. Values are read as the export reports them (not re-derived from raw 10 Hz), and a missing window is shown as no-data, not zero. Descriptive load context — it never changes the readiness verdict or the daily plan.",
  is: "Afl-kúrfan er hámarks (versti) rúllandi gluggi við hverja lengd (1/3/5 mín) fyrir mælikvarða, úr peak-period útflutningi Catapult — raunverulegur kostnaður ákafustu augnablika leiksins. Gildin eru lesin eins og útflutningurinn skilar þeim (ekki endur-reiknuð úr hráu 10 Hz), og gluggi sem vantar er sýndur sem engin gögn, ekki núll. Lýsandi álags-samhengi — breytir aldrei readiness-dómnum eða dagsáætluninni.",
};

function num(x: number | null | undefined): number | null {
  return typeof x === "number" && isFinite(x) ? x : null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Build the power curve for ONE metric within ONE session's rows: the peak value at each
 * distinct window length, indexed to the session's own largest peak (the 1-min window is
 * usually the densest). Windows are returned ascending.
 */
export function powerCurveForSession(rows: PeakPeriodRow[], metric: string): PowerCurve {
  const mine = rows.filter((r) => r.metric === metric);
  const unit = mine.find((r) => r.unit != null)?.unit ?? null;
  const byWindow = new Map<number, number>();
  for (const r of mine) {
    const v = num(r.value);
    if (v === null) continue;
    const prev = byWindow.get(r.windowMin);
    // Keep the max if an export lists a window more than once.
    if (prev === undefined || v > prev) byWindow.set(r.windowMin, v);
  }
  const windows = [...byWindow.keys()].sort((a, b) => a - b);
  const peak = windows.length ? Math.max(...windows.map((w) => byWindow.get(w)!)) : null;
  const points: CurvePoint[] = windows.map((w) => {
    const value = byWindow.get(w)!;
    return { windowMin: w, value: r2(value), index: peak && peak > 0 ? Math.round((value / peak) * 100) : null };
  });
  return { metric, unit, points };
}

/**
 * Compute the peak-period read for ONE player from their long-format rows across the
 * season. Pure: no I/O. Produces the latest session's curves and the season-best curve
 * per metric (the max at each window across every session — his ceiling).
 */
export function computePeakPeriod(rows: PeakPeriodRow[]): PeakPeriodRead {
  const clean = (rows ?? []).filter((r) => r && typeof r.date === "string" && typeof r.metric === "string" && Number.isFinite(r.windowMin));
  const dates = [...new Set(clean.map((r) => r.date))].sort();
  const metrics = [...new Set(clean.map((r) => r.metric))].sort();
  const windows = [...new Set(clean.map((r) => r.windowMin))].sort((a, b) => a - b);

  const latestDate = dates.length ? dates[dates.length - 1] : null;
  const latest: PeakPeriodSession | null = latestDate
    ? { date: latestDate, curves: metrics.map((m) => powerCurveForSession(clean.filter((r) => r.date === latestDate), m)) }
    : null;

  // Season-best per metric: the max value at each window across ALL sessions.
  const seasonBest: PowerCurve[] = metrics.map((metric) => {
    const mine = clean.filter((r) => r.metric === metric);
    const unit = mine.find((r) => r.unit != null)?.unit ?? null;
    const byWindow = new Map<number, number>();
    for (const r of mine) {
      const v = num(r.value);
      if (v === null) continue;
      const prev = byWindow.get(r.windowMin);
      if (prev === undefined || v > prev) byWindow.set(r.windowMin, v);
    }
    const ws = [...byWindow.keys()].sort((a, b) => a - b);
    const peak = ws.length ? Math.max(...ws.map((w) => byWindow.get(w)!)) : null;
    return {
      metric,
      unit,
      points: ws.map((w) => {
        const value = byWindow.get(w)!;
        return { windowMin: w, value: r2(value), index: peak && peak > 0 ? Math.round((value / peak) * 100) : null };
      }),
    };
  });

  let confidence: Confidence = "low";
  if (dates.length >= MIN_MATURE_PEAKPERIOD_SESSIONS && metrics.length >= 1) {
    confidence = dates.length >= MIN_MATURE_PEAKPERIOD_SESSIONS * 2 && metrics.length >= 2 ? "high" : "medium";
  }

  return {
    latest,
    seasonBest,
    dataCoverage: { sessions: dates.length, metrics: metrics.length, windows },
    confidence,
    citation: CITATION,
    caveat: CAVEAT,
  };
}

/**
 * Benchmark one player's season-best at a (metric, window) against the squad — the
 * percentile of his peak among the squad's peaks. Pure. `squadPeaks` is every player's
 * season-best value at the same metric+window (self excluded from ties). Null if the
 * pool is too thin to rank.
 */
export function benchmarkPeak(playerPeak: number | null, squadPeaks: Array<number | null>): number | null {
  if (playerPeak === null) return null;
  const vals = squadPeaks.filter((v): v is number => typeof v === "number" && isFinite(v));
  if (vals.length <= 1) return null;
  let below = 0, equal = 0;
  for (const v of vals) {
    if (v < playerPeak) below += 1;
    else if (v === playerPeak) equal += 1;
  }
  const rank = below + 0.5 * Math.max(0, equal - 1);
  return Math.round((rank / (vals.length - 1)) * 100);
}
