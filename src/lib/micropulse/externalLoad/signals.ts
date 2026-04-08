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

export function computeCatapultExternalLoadSignals(args: {
  today: CatapultDailyLoadRow | null;
  baseline: CatapultExternalLoadBaseline;
}): CatapultExternalLoadSignals {
  const { today, baseline } = args;
  const days7 = baseline.availability.daysAvailable7d;
  const days28 = baseline.availability.daysAvailable28d;
  const dataQuality =
    !today || days28 < 10 ? "insufficient" : days7 < 3 ? "partial" : "good";

  const playerLoadSpike = ratio(today?.playerLoad ?? null, baseline.chronic28dAvg.playerLoad);
  const hirSpike = ratio(getHirDistance(today), baseline.chronic28dAvg.hirDist);
  const decelSpike = ratio(getDecelLoad(today), baseline.chronic28dAvg.decelLoad);
  const accelSpike = ratio(getAccelLoad(today), baseline.chronic28dAvg.accelLoad);
  const maxVelocityExposureRatio = ratio(today?.maxVelocity ?? null, baseline.chronic28dAvg.maxVelocity);
  const densityStressRatio = ratio(getDensityStress(today), baseline.chronic28dAvg.densityStress);
  const band6ExposureRatio = ratio(getBand6Distance(today), baseline.chronic28dAvg.band6Distance);

  const neuromuscularBurdenScore =
    dataQuality === "insufficient"
      ? null
      : clamp(
          normalizeRatio(hirSpike, 1.15, 1.6) * CATAPULT_SIGNAL_WEIGHTS.hirSpike +
            normalizeRatio(decelSpike, 1.15, 1.6) * CATAPULT_SIGNAL_WEIGHTS.decelSpike +
            normalizeRatio(densityStressRatio, 1.1, 1.35) * CATAPULT_SIGNAL_WEIGHTS.densityStressRatio +
            normalizeRatio(maxVelocityExposureRatio, 1.02, 1.12) * CATAPULT_SIGNAL_WEIGHTS.maxVelocityExposureRatio +
            normalizeRatio(band6ExposureRatio, 1.2, 1.5) * CATAPULT_SIGNAL_WEIGHTS.band6ExposureRatio,
          0,
          1,
        );

  const elevatedCount = [
    playerLoadSpike != null && playerLoadSpike >= 1.3,
    hirSpike != null && hirSpike >= 1.3,
    decelSpike != null && decelSpike >= 1.3,
    accelSpike != null && accelSpike >= 1.3,
    maxVelocityExposureRatio != null && maxVelocityExposureRatio >= 1.05,
    densityStressRatio != null && densityStressRatio >= 1.2,
  ].filter(Boolean).length;
  const highCount = [
    playerLoadSpike != null && playerLoadSpike >= 1.5,
    hirSpike != null && hirSpike >= 1.6,
    decelSpike != null && decelSpike >= 1.6,
    accelSpike != null && accelSpike >= 1.6,
    maxVelocityExposureRatio != null && maxVelocityExposureRatio >= 1.12,
    densityStressRatio != null && densityStressRatio >= 1.35,
  ].filter(Boolean).length;

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
  };
}
