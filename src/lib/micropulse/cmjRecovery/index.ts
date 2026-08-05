/**
 * Expected post-match CMJ recovery curve, personalised by match HSR (item 2).
 *
 * A post-match jump read against a flat baseline can't tell "low but on the
 * expected curve" (normal) from "low and behind the curve" (the real signal).
 * This pure model builds the expected CMJ-vs-time band over ~72–96 h after a match
 * and classifies the observed jump against it.
 *
 * Grounded:
 *  - Driver is HIGH-SPEED RUNNING (>5.5 m/s), NOT total distance. Hader 2019: per
 *    100 m of HSR above threshold, CMJ peak power ≈ −0.5% at +24 h (CK +30%); total
 *    distance is not predictive. So the dip scales with the match's HSR metres.
 *  - Time-course: dip greatest 0–48 h, jump still impaired at 72 h, recovered by
 *    ~96 h — jump recovers SLOWER than sprint (Nédélec 2012: CK 24–48 h peak,
 *    normalises 48–120 h; Silva 2018: jumping impaired at G+72 h).
 *  - Band width reflects the CMJ (jump-height) measurement CV already in
 *    vald/phaseChange.ts (Gathercole 2015), so "inside the band" = within noise.
 *
 * Descriptive only. No IO. Never moves the readiness colour. Every result carries
 * its inputs (match HSR + hours offset) so the caller can cite provenance.
 */

import { METRIC_META, PHASE_NOISE_K } from "@/lib/micropulse/vald/phaseChange";

/** Hader 2019: CMJ peak power ≈ −0.5% per 100 m of HSR (>5.5 m/s) at +24 h. */
const DIP_PCT_PER_100M_HSR_AT_24H = 0.5;
/** Sanity cap so an outlier HSR can't model an implausible dip. */
const MAX_DIP_24H_PCT = 20;
/** Band half-width = jump-height CV × the same noise multiplier the phase gate uses. */
const BAND_HALF_PCT = METRIC_META.jumpHeight.cvPct * PHASE_NOISE_K; // ≈ 7.95 pts

export type RecoveryLabel = "on_track" | "slow" | "ahead";

export type ExpectedCmjBand = {
  /** Expected CMJ as a % of the player's own baseline at this hour offset. */
  expectedPct: number;
  /** Lower / upper bounds of the "on schedule" band (% of baseline). */
  lo: number;
  hi: number;
  /** Echo of the inputs, for provenance. */
  matchHsr: number;
  hoursPostMatch: number;
};

export type ExpectedCmjBandInput = {
  /** Match high-speed-running distance in metres (>5.5 m/s). null → no band. */
  matchHsr: number | null | undefined;
  /** Hours since the match at the time of the CMJ test. null → no band. */
  hoursPostMatch: number | null | undefined;
  /**
   * Optional personalisation: the player's own learned 24 h dip (% of baseline)
   * for this HSR load, once his post-match jumps have accrued. When provided it
   * REPLACES the Hader literature seed (the model converges to his own history).
   */
  dip24PctOverride?: number | null;
};

/**
 * Time-course multiplier on the 24 h dip (Nédélec 2012; Silva 2018). Anchored so
 * shape(24 h) = 1 (the 24 h dip is the Hader-scaled value). Greatest 0–48 h, still
 * ~half at 72 h (jump impaired longer than sprint), recovered by ~96 h.
 */
export function recoveryTimeShape(hoursPostMatch: number): number {
  const t = hoursPostMatch;
  if (t <= 0) return 1; // immediately post — already in the deepest window
  if (t <= 48) return 1; // dip greatest 0–48 h
  if (t >= 96) return 0; // recovered by ~96 h
  return 1 - (t - 48) / 48; // linear recovery 48 → 96 h (⇒ 0.5 at 72 h)
}

/** Expected CMJ band as a % of baseline, HSR-scaled and time-decaying. null when
 *  match HSR or the hour offset is missing (no fabrication). */
export function expectedCmjBand(input: ExpectedCmjBandInput): ExpectedCmjBand | null {
  const { matchHsr, hoursPostMatch } = input;
  if (matchHsr == null || !Number.isFinite(matchHsr) || matchHsr < 0) return null;
  if (hoursPostMatch == null || !Number.isFinite(hoursPostMatch) || hoursPostMatch < 0) return null;

  const dip24 =
    input.dip24PctOverride != null && Number.isFinite(input.dip24PctOverride)
      ? Math.max(0, input.dip24PctOverride)
      : Math.min(MAX_DIP_24H_PCT, (matchHsr / 100) * DIP_PCT_PER_100M_HSR_AT_24H);

  const dip = dip24 * recoveryTimeShape(hoursPostMatch);
  const expectedPct = 100 - dip;
  return {
    expectedPct,
    lo: Math.max(0, expectedPct - BAND_HALF_PCT),
    hi: Math.min(110, expectedPct + BAND_HALF_PCT),
    matchHsr,
    hoursPostMatch,
  };
}

/** Classify an observed CMJ (% of baseline) against the modelled band. null band
 *  (missing inputs) → null (no verdict, never a fabricated "fine"). */
export function classifyRecovery(observedPct: number | null | undefined, band: ExpectedCmjBand | null): RecoveryLabel | null {
  if (band == null) return null;
  if (observedPct == null || !Number.isFinite(observedPct)) return null;
  if (observedPct < band.lo) return "slow";
  if (observedPct > band.hi) return "ahead";
  return "on_track";
}

/** Map a recovery label to item-1's CMJ recovery-slope axis: a slow recovery is
 *  peripheral/TISSUE, an ahead recovery is central/NEURAL (rebounded fast). */
export function recoverySlopeFromLabel(label: RecoveryLabel | null): "fast" | "slow" | "unknown" {
  if (label === "slow") return "slow";
  if (label === "ahead") return "fast";
  return "unknown";
}

/** Bilingual coach context line with the numbers + provenance + citation. null
 *  when there's no verdict. */
export function recoveryContextLine(
  observedPct: number | null | undefined,
  band: ExpectedCmjBand | null,
  label: RecoveryLabel | null,
): { en: string; is: string } | null {
  if (band == null || label == null || observedPct == null) return null;
  const obs = Math.round(observedPct);
  const lo = Math.round(band.lo);
  const hi = Math.round(band.hi);
  const h = Math.round(band.hoursPostMatch);
  const hsr = Math.round(band.matchHsr);
  const verdictEn =
    label === "slow" ? "recovering slower than expected"
    : label === "ahead" ? "recovering ahead of schedule"
    : "recovering on schedule";
  const verdictIs =
    label === "slow" ? "endurheimtist hægar en vænst"
    : label === "ahead" ? "endurheimtist hraðar en áætlað"
    : "endurheimtist samkvæmt áætlun";
  return {
    en: `${h} h post-match: jump at ${obs}% of baseline — expected ~${lo}–${hi}% for this match's HSR (${hsr} m) → ${verdictEn}. [Hader 2019; Silva 2018]`,
    is: `${h} klst eftir leik: stökk í ${obs}% af grunnlínu — vænst ~${lo}–${hi}% miðað við háhraða hlaup leiksins (${hsr} m) → ${verdictIs}. [Hader 2019; Silva 2018]`,
  };
}
