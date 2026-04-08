import type { CatapultDailyLoadRow, CatapultExternalLoadBaseline, CatapultExternalLoadSignals } from "./types";
import { getAccelLoad, getBand6Distance, getDecelLoad, getDensityStress, getHirDistance } from "./baselines";

const SMALL_NUMBER = 0.001;
const MAX_RATIO = 3;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function ratio(today: number | null | undefined, baseline: number): number | null {
  if (typeof today !== "number" || !Number.isFinite(today)) return null;
  return clamp(today / Math.max(baseline, SMALL_NUMBER), 0, MAX_RATIO);
}

function normalizeRatio(value: number | null, elevated = 1.1, high = 1.6): number {
  if (value == null) return 0;
  if (value <= elevated) return 0;
  if (value >= high) return 1;
  return clamp((value - elevated) / (high - elevated), 0, 1);
}

// ── Outdoor (GPS) signal weights ─────────────────────────────────────────────

type SignalWeights = {
  hirSpike: number;
  decelSpike: number;
  densityStressRatio: number;
  maxVelocityExposureRatio: number;
  band6ExposureRatio: number;
};

export const CATAPULT_SIGNAL_WEIGHTS: SignalWeights = {
  hirSpike: 0.34,
  decelSpike: 0.26,
  densityStressRatio: 0.2,
  maxVelocityExposureRatio: 0.14,
  band6ExposureRatio: 0.06,
};

// ── Indoor (FMP) signal weights ──────────────────────────────────────────────
//
// When GPS is unavailable, FMP replaces GPS-dependent signals:
//   Dynamic High %    → replaces HIR spike          (high-intensity COD/accel/decel)
//   PlayerLoad spike  → replaces density stress     (overall neuromuscular load)
//   IMA Total spike   → replaces decel spike        (impact load)
//   Dynamic Medium %  → replaces max velocity       (moderate-intensity movement)
//   Running High %         → replaces band6 exposure     (linear running load)

type IndoorSignalWeights = {
  fmpDynamicHighSpike: number;
  playerLoadSpike: number;
  imaTotalSpike: number;
  fmpDynamicMediumSpike: number;
  fmpRunningHighSpike: number;
};

export const INDOOR_SIGNAL_WEIGHTS: IndoorSignalWeights = {
  fmpDynamicHighSpike: 0.34,       // replaces HIR
  playerLoadSpike: 0.26,           // replaces density stress
  imaTotalSpike: 0.20,             // replaces decel spike
  fmpDynamicMediumSpike: 0.14,     // replaces max velocity
  fmpRunningHighSpike: 0.06,   // replaces band6
};

// ── Main signal computation ──────────────────────────────────────────────────

export function computeCatapultExternalLoadSignals(args: {
  today: CatapultDailyLoadRow | null;
  baseline: CatapultExternalLoadBaseline;
  indoorMode?: boolean;
}): CatapultExternalLoadSignals {
  const { today, baseline, indoorMode = false } = args;
  const days7 = baseline.availability.daysAvailable7d;
  const days28 = baseline.availability.daysAvailable28d;
  const dataQuality =
    !today || days28 < 10 ? "insufficient" : days7 < 3 ? "partial" : "good";

  // ── GPS-based signals (always computed, may be null indoors) ───────────────

  const playerLoadSpike = ratio(today?.playerLoad ?? null, baseline.chronic28dAvg.playerLoad);
  const hirSpike = ratio(getHirDistance(today), baseline.chronic28dAvg.hirDist);
  const decelSpike = ratio(getDecelLoad(today), baseline.chronic28dAvg.decelLoad);
  const accelSpike = ratio(getAccelLoad(today), baseline.chronic28dAvg.accelLoad);
  const maxVelocityExposureRatio = ratio(today?.maxVelocity ?? null, baseline.chronic28dAvg.maxVelocity);
  const densityStressRatio = ratio(getDensityStress(today), baseline.chronic28dAvg.densityStress);
  const band6ExposureRatio = ratio(getBand6Distance(today), baseline.chronic28dAvg.band6Distance);

  // ── FMP-based signals (always computed, primary when indoor) ───────────────

  const fmpDynamicHighSpike = ratio(today?.fmpDynamicHighS ?? null, baseline.chronic28dAvg.fmpDynamicHighS);
  const fmpDynamicMediumSpike = ratio(today?.fmpDynamicMediumS ?? null, baseline.chronic28dAvg.fmpDynamicMediumS);
  const fmpRunningHighSpike = ratio(today?.fmpRunningHighS ?? null, baseline.chronic28dAvg.fmpRunningHighS);
  const imaTotalSpike = ratio(today?.imaTotal ?? null, baseline.chronic28dAvg.imaTotal);

  // ── Burden score ───────────────────────────────────────────────────────────

  let neuromuscularBurdenScore: number | null;

  if (dataQuality === "insufficient") {
    neuromuscularBurdenScore = null;
  } else if (indoorMode) {
    // Indoor Mode: FMP + PlayerLoad + IMA based burden
    neuromuscularBurdenScore = clamp(
      normalizeRatio(fmpDynamicHighSpike, 1.15, 1.6) * INDOOR_SIGNAL_WEIGHTS.fmpDynamicHighSpike +
        normalizeRatio(playerLoadSpike, 1.15, 1.6) * INDOOR_SIGNAL_WEIGHTS.playerLoadSpike +
        normalizeRatio(imaTotalSpike, 1.15, 1.6) * INDOOR_SIGNAL_WEIGHTS.imaTotalSpike +
        normalizeRatio(fmpDynamicMediumSpike, 1.1, 1.35) * INDOOR_SIGNAL_WEIGHTS.fmpDynamicMediumSpike +
        normalizeRatio(fmpRunningHighSpike, 1.2, 1.5) * INDOOR_SIGNAL_WEIGHTS.fmpRunningHighSpike,
      0,
      1,
    );
  } else {
    // Outdoor Mode: GPS based burden (original)
    neuromuscularBurdenScore = clamp(
      normalizeRatio(hirSpike, 1.15, 1.6) * CATAPULT_SIGNAL_WEIGHTS.hirSpike +
        normalizeRatio(decelSpike, 1.15, 1.6) * CATAPULT_SIGNAL_WEIGHTS.decelSpike +
        normalizeRatio(densityStressRatio, 1.1, 1.35) * CATAPULT_SIGNAL_WEIGHTS.densityStressRatio +
        normalizeRatio(maxVelocityExposureRatio, 1.02, 1.12) * CATAPULT_SIGNAL_WEIGHTS.maxVelocityExposureRatio +
        normalizeRatio(band6ExposureRatio, 1.2, 1.5) * CATAPULT_SIGNAL_WEIGHTS.band6ExposureRatio,
      0,
      1,
    );
  }

  // ── Load state classification ──────────────────────────────────────────────

  let elevatedCount: number;
  let highCount: number;

  if (indoorMode) {
    // Indoor: use FMP + PlayerLoad + IMA signals
    elevatedCount = [
      playerLoadSpike != null && playerLoadSpike >= 1.3,
      fmpDynamicHighSpike != null && fmpDynamicHighSpike >= 1.3,
      fmpDynamicMediumSpike != null && fmpDynamicMediumSpike >= 1.3,
      imaTotalSpike != null && imaTotalSpike >= 1.3,
      fmpRunningHighSpike != null && fmpRunningHighSpike >= 1.2,
    ].filter(Boolean).length;
    highCount = [
      playerLoadSpike != null && playerLoadSpike >= 1.5,
      fmpDynamicHighSpike != null && fmpDynamicHighSpike >= 1.6,
      fmpDynamicMediumSpike != null && fmpDynamicMediumSpike >= 1.6,
      imaTotalSpike != null && imaTotalSpike >= 1.6,
      fmpRunningHighSpike != null && fmpRunningHighSpike >= 1.5,
    ].filter(Boolean).length;
  } else {
    // Outdoor: original GPS signals
    elevatedCount = [
      playerLoadSpike != null && playerLoadSpike >= 1.3,
      hirSpike != null && hirSpike >= 1.3,
      decelSpike != null && decelSpike >= 1.3,
      accelSpike != null && accelSpike >= 1.3,
      maxVelocityExposureRatio != null && maxVelocityExposureRatio >= 1.05,
      densityStressRatio != null && densityStressRatio >= 1.2,
    ].filter(Boolean).length;
    highCount = [
      playerLoadSpike != null && playerLoadSpike >= 1.5,
      hirSpike != null && hirSpike >= 1.6,
      decelSpike != null && decelSpike >= 1.6,
      accelSpike != null && accelSpike >= 1.6,
      maxVelocityExposureRatio != null && maxVelocityExposureRatio >= 1.12,
      densityStressRatio != null && densityStressRatio >= 1.35,
    ].filter(Boolean).length;
  }

  let externalLoadState: CatapultExternalLoadSignals["externalLoadState"] = "normal";
  if (dataQuality === "insufficient") externalLoadState = "unknown";
  else if (highCount >= 2 || elevatedCount >= 3 || (neuromuscularBurdenScore ?? 0) >= 0.66) externalLoadState = "high";
  else if (highCount >= 1 || elevatedCount >= 1 || (neuromuscularBurdenScore ?? 0) >= 0.34) externalLoadState = "elevated";

  return {
    playerLoadSpike,
    hirSpike,
    decelSpike,
    accelSpike,
    maxVelocityExposureRatio,
    densityStressRatio,
    band6ExposureRatio,
    neuromuscularBurdenScore,
    externalLoadState,
    dataQuality,
    // FMP indoor signals
    fmpDynamicHighSpike,
    fmpDynamicMediumSpike,
    fmpRunningHighSpike,
    imaTotalSpike,
  };
}
