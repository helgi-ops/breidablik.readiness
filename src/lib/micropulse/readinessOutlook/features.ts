/**
 * Feature build for the Readiness Outlook — pure, from a single player's history.
 *
 * Deliberately few features (Rossi 2022 / Rothschild 2024: a handful dominate; a
 * 200-feature tree overfits at squad scale). Everything is per-player z-scored so a
 * pooled ordinal model is fair across players (the paper template).
 *
 * The "planned load for the target day" is the feature that makes this a FORECAST, not
 * a nowcast. In TRAINING it's the load that was actually applied that day (plan ≈ what
 * happened); at FORECAST time the caller passes the PLANNED load from Week Setup.
 */

import { ewma, mean, stdev, zscore } from "./ewma";
import { classFromPersonalNorm, type WellnessClass } from "./target";

/** Ordered feature keys — the index into `beta` maps back to these for the plain "why". */
export const FEATURE_KEYS = [
  "chronic28",
  "acute7",
  "plannedLoad",
  "mdOffset",
  "wellnessLag1",
  "wellnessLag7",
] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

export type Bi = { en: string; is: string };

/** Plain-language name per feature (no jargon) — used to phrase the top driver. */
export const FEATURE_LABELS: Record<FeatureKey, Bi> = {
  chronic28: { en: "his 4-week load", is: "4-vikna álag hans" },
  acute7: { en: "this week's load", is: "álag vikunnar" },
  plannedLoad: { en: "the load you've planned for that day", is: "álagið sem þú hefur planað þann dag" },
  mdOffset: { en: "how close the day is to the match", is: "hversu nálægt leik dagurinn er" },
  wellnessLag1: { en: "how he feels right now", is: "hvernig honum líður núna" },
  wellnessLag7: { en: "how he felt a week ago", is: "hvernig honum leið fyrir viku" },
};

export interface RawFeatures {
  chronic28: number;
  acute7: number;
  plannedLoad: number;
  mdOffset: number;
  wellnessLag1: number;
  wellnessLag7: number;
}

/** One player's daily inputs. Maps keyed by ISO date (YYYY-MM-DD). */
export interface PlayerHistory {
  /** Summed sRPE session_load per day. Absent day = rest = 0. */
  loadByDate: Map<string, number>;
  /** readiness_entries.total_score per check-in day (5..25). */
  wellnessByDate: Map<string, number>;
  /** MD-day numeric offset per date (MD = 0, MD-2 = −2, MD+1 = +1). */
  mdOffsetByDate: Map<string, number>;
}

const LOAD_WINDOW_DAYS = 35; // runway for a stable 28-day EWMA

function isoAdd(dateISO: string, days: number): string {
  const d = new Date(`${dateISO}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Latest wellness total_score strictly before `date`, scanning back up to 21 days. */
function wellnessBefore(h: PlayerHistory, date: string, maxBack = 21): number | null {
  for (let i = 1; i <= maxBack; i++) {
    const v = h.wellnessByDate.get(isoAdd(date, -i));
    if (v != null) return v;
  }
  return null;
}

/** Wellness ~7 days before `date` (closest within ±2 days), else null. */
function wellnessLag7(h: PlayerHistory, date: string): number | null {
  for (const off of [-7, -6, -8, -5, -9]) {
    const v = h.wellnessByDate.get(isoAdd(date, off));
    if (v != null) return v;
  }
  return null;
}

/**
 * Build the raw (un-normalised) feature vector for a target date. `targetDayLoad` is the
 * applied load in training / the planned load in forecasting; `targetMdOffset` the MD
 * offset of that day. Returns null when a required input is missing — no fabrication.
 */
export function buildRawFeatures(
  h: PlayerHistory,
  targetDate: string,
  targetDayLoad: number,
  targetMdOffset: number,
): RawFeatures | null {
  // Daily load series ending the day BEFORE the target (as-of the forecast).
  const series: number[] = [];
  for (let i = LOAD_WINDOW_DAYS; i >= 1; i--) series.push(h.loadByDate.get(isoAdd(targetDate, -i)) ?? 0);
  const chronic28 = ewma(series, 28);
  const acute7 = ewma(series, 7);
  const lag1 = wellnessBefore(h, targetDate);
  const lag7 = wellnessLag7(h, targetDate);
  // Load EWMA is always computable (0-filled); the wellness lags are the real gate —
  // without a recent check-in there is no autoregressive signal, so withhold.
  if (chronic28 == null || acute7 == null || lag1 == null) return null;
  return {
    chronic28,
    acute7,
    plannedLoad: targetDayLoad,
    mdOffset: targetMdOffset,
    wellnessLag1: lag1,
    // Fall back to lag-1 when a 7-day-old check-in is missing (better than dropping the
    // sample); the confidence gate downgrades erratic schedules separately.
    wellnessLag7: lag7 ?? lag1,
  };
}

export interface TrainingSample {
  date: string;
  raw: RawFeatures;
  /** Observed wellness class on the target day. */
  y: WellnessClass;
}

/**
 * Walk-forward training samples for one player: every check-in day that also has a
 * usable feature vector built ONLY from data available before it. The applied load on
 * the target day stands in for "planned" during training.
 */
export function buildTrainingSamples(h: PlayerHistory): TrainingSample[] {
  const out: TrainingSample[] = [];
  // The player's OWN wellness norm — the target class is relative to this, not absolute.
  const wellnessVals = [...h.wellnessByDate.values()];
  const wMean = mean(wellnessVals);
  const wSd = stdev(wellnessVals);
  for (const [date, total] of h.wellnessByDate) {
    const y = classFromPersonalNorm(total, wMean, wSd);
    if (y == null) continue;
    const targetDayLoad = h.loadByDate.get(date) ?? 0;
    const targetMdOffset = h.mdOffsetByDate.get(date) ?? 0;
    const raw = buildRawFeatures(h, date, targetDayLoad, targetMdOffset);
    if (!raw) continue;
    out.push({ date, raw, y });
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

/** Per-feature normalisation stats (a player's own baseline for each feature). */
export type NormParams = Record<FeatureKey, { mean: number; sd: number }>;

/** Fit per-player normalisation from that player's raw samples. */
export function fitNorm(raws: RawFeatures[]): NormParams {
  const params = {} as NormParams;
  for (const key of FEATURE_KEYS) {
    const vals = raws.map((r) => r[key]);
    params[key] = { mean: mean(vals) ?? 0, sd: stdev(vals) ?? 0 };
  }
  return params;
}

/** Z-score a raw feature vector into the model's ordered `x` input. */
export function applyNorm(raw: RawFeatures, params: NormParams): number[] {
  return FEATURE_KEYS.map((key) => zscore(raw[key], params[key].mean, params[key].sd));
}
