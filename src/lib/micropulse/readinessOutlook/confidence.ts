/**
 * Readiness Outlook confidence gate — pure. The forecast MUST say when it doesn't know.
 *
 * Three inputs (the brief's non-negotiable gate), reusing the app's existing
 * `confidenceBand` thresholds for the final mapping:
 *  1. Baseline maturity — weeks of the club's own data (weak until ~23 weeks: Rossi 2022,
 *     Mandorino 2023).
 *  2. Microcycle stability — the weekly pattern must be repeatable for the lag-7 signal
 *     to hold; an erratic schedule is downgraded.
 *  3. Per-player predictability — some players are inherently noisy (Rothschild 2024:
 *     RMSE varies >5×); the caller's walk-forward holdout within-±1 rate feeds this.
 *
 * Below the floor → WITHHELD ("not enough history yet"). Never a confident forecast on
 * thin data; no-data is never a green outlook.
 */

import { mean, stdev } from "./ewma";

// Same thresholds as the app's shared confidenceBand (provisionalBaseline.ts) but inlined
// so this pure module carries no cross-module dependency. Returns "moderate" (not the
// baseline's "medium") to match this feature's level vocabulary.
function band(c: number): "low" | "moderate" | "high" {
  if (c >= 0.75) return "high";
  if (c >= 0.35) return "moderate";
  return "low";
}

/** Weeks of club data at which the forecast is considered mature (Rossi/Mandorino ~23). */
export const OUTLOOK_MATURE_WEEKS = 23;
/** Below this many weeks (or samples) the Outlook is withheld entirely. */
export const OUTLOOK_MIN_WEEKS = 6;
export const OUTLOOK_MIN_SAMPLES = 12;

export type Bi = { en: string; is: string };
export type OutlookConfidenceLevel = "withheld" | "low" | "moderate" | "high";

export interface OutlookConfidenceInput {
  weeksOfData: number;
  sampleCount: number;
  /** Total sRPE load per recent week — for the microcycle-stability (CV) read. */
  weeklyLoads: number[];
  /** Walk-forward holdout within-±1-class accuracy (0..1), or null if not computed yet. */
  holdoutWithin1: number | null;
}

export interface OutlookConfidence {
  level: OutlookConfidenceLevel;
  /** Combined 0..1 score (0 when withheld). */
  score: number;
  weeksOfData: number;
  maturity: number;      // 0..1
  stability: number;     // 0..1
  predictability: number | null; // 0..1 or null (no holdout yet)
  /** Plain-language statement of the limiting factor. */
  note: Bi;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export function computeOutlookConfidence(input: OutlookConfidenceInput): OutlookConfidence {
  const { weeksOfData, sampleCount, weeklyLoads, holdoutWithin1 } = input;

  // Hard floor — withhold rather than guess on thin data.
  if (weeksOfData < OUTLOOK_MIN_WEEKS || sampleCount < OUTLOOK_MIN_SAMPLES) {
    return {
      level: "withheld", score: 0, weeksOfData,
      maturity: clamp01(weeksOfData / OUTLOOK_MATURE_WEEKS), stability: 0, predictability: holdoutWithin1,
      note: {
        en: `Not enough history yet — ${weeksOfData} week${weeksOfData === 1 ? "" : "s"} of data (an outlook needs a few months). No forecast until the baseline matures.`,
        is: `Ekki næg saga enn — ${weeksOfData} vik${weeksOfData === 1 ? "a" : "ur"} af gögnum (spá þarf nokkra mánuði). Engin spá fyrr en grunnlínan þroskast.`,
      },
    };
  }

  const maturity = clamp01(weeksOfData / OUTLOOK_MATURE_WEEKS);

  // Microcycle stability from the coefficient of variation of weekly load. Low CV = a
  // repeatable week = the lag-7 signal is trustworthy. Needs ≥3 weeks to judge.
  let stability = 0.3; // unknown → mild penalty
  const m = mean(weeklyLoads);
  const sd = stdev(weeklyLoads);
  if (weeklyLoads.length >= 3 && m != null && m > 0 && sd != null) {
    stability = clamp01(1 - sd / m);
  }

  const predictability = holdoutWithin1 == null ? null : clamp01(holdoutWithin1);
  const predComponent = predictability ?? 0.5; // neutral when no holdout yet

  const score = 0.5 * maturity + 0.25 * stability + 0.25 * predComponent;

  // Map via the app's shared bands, then apply hard CAPS so no single strong factor can
  // mask a weak one — each of the three must be earned, not averaged away.
  const RANK: Record<OutlookConfidenceLevel, number> = { withheld: 0, low: 1, moderate: 2, high: 3 };
  const capTo = (lvl: OutlookConfidenceLevel, max: OutlookConfidenceLevel) => (RANK[lvl] > RANK[max] ? max : lvl);

  let level: OutlookConfidenceLevel = band(score);
  // Immature baseline or no holdout → never "high" (Rossi: earned over a season).
  if (weeksOfData < OUTLOOK_MATURE_WEEKS || predictability == null) level = capTo(level, "moderate");
  // Erratic weekly schedule → the lag-7 signal is shaky → cap.
  if (stability < 0.5) level = capTo(level, "moderate");
  // A genuinely hard-to-predict player is downgraded regardless of maturity (Rothschild).
  if (predictability != null && predictability < 0.7) level = capTo(level, "moderate");
  if (predictability != null && predictability < 0.5) level = capTo(level, "low");

  // Name the biggest limiter for the plain note.
  const limiters: Array<{ v: number; note: Bi }> = [
    { v: maturity, note: { en: `still building history (${weeksOfData} of ~${OUTLOOK_MATURE_WEEKS} weeks)`, is: `enn að byggja sögu (${weeksOfData} af ~${OUTLOOK_MATURE_WEEKS} vikum)` } },
    { v: stability, note: { en: "the weekly schedule is irregular, so week-ago patterns are less reliable", is: "vikuskipulagið er óreglulegt, svo mynstur frá fyrri viku eru síður áreiðanleg" } },
    { v: predComponent, note: { en: "his wellness has been harder than most to predict", is: "líðan hans hefur verið erfiðari en flestra að spá fyrir um" } },
  ];
  const worst = limiters.reduce((a, b) => (b.v < a.v ? b : a));
  const note: Bi = level === "high"
    ? { en: `Mature baseline (${weeksOfData} weeks), stable schedule.`, is: `Þroskuð grunnlína (${weeksOfData} vikur), stöðugt skipulag.` }
    : { en: `Read with some caution — ${worst.note.en}.`, is: `Lestu með nokkurri varúð — ${worst.note.is}.` };

  return { level, score, weeksOfData, maturity, stability, predictability, note };
}
