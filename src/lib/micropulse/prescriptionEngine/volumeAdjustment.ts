import { clamp } from "./normalize";
import type { DriverContribution, NormalizedPrescriptionInput, VolumeAdjustmentBand } from "./types";

export type VolumeAdjustmentDecision = {
  volumeAdjustment: VolumeAdjustmentBand;
  reductionPercent: number;
  primaryDrivers: DriverContribution[];
  secondaryDrivers: DriverContribution[];
  confidence: number;
  summary: string;
};

function push(drivers: DriverContribution[], key: string, label: string, contribution: number, direction: DriverContribution["direction"], value?: number | null): void {
  if (Math.abs(contribution) < 0.001) return;
  drivers.push({ key, label, contribution, direction, value: value ?? null });
}

function rank(drivers: DriverContribution[]) {
  const sorted = [...drivers].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  return { primary: sorted.slice(0, 3), secondary: sorted.slice(3, 6) };
}

/**
 * Recommend deterministic volume reduction percentage based on tolerance + context.
 */
export function buildVolumeAdjustmentDecision(input: NormalizedPrescriptionInput): VolumeAdjustmentDecision {
  const drivers: DriverContribution[] = [];
  let pressure = 8;

  if (input.loadToleranceBand === "RECOVERY_ONLY") {
    pressure += 44;
    push(drivers, "load_recovery", "Recovery-only tolerance", 44, "risk", input.loadToleranceScore ?? null);
  } else if (input.loadToleranceBand === "TOLERATES_LOW") {
    pressure += 24;
    push(drivers, "load_low", "Low load tolerance", 24, "risk", input.loadToleranceScore ?? null);
  } else if (input.loadToleranceBand === "TOLERATES_HIGH") {
    pressure -= 12;
    push(drivers, "load_high", "High load tolerance", -12, "protective", input.loadToleranceScore ?? null);
  }

  if (input.collapseRiskBand === "CRITICAL") {
    pressure += 24;
    push(drivers, "collapse_critical", "Critical collapse-risk", 24, "risk", input.collapseRiskScore ?? null);
  } else if (input.collapseRiskBand === "HIGH") {
    pressure += 14;
    push(drivers, "collapse_high", "High collapse-risk", 14, "risk", input.collapseRiskScore ?? null);
  }

  if (input.fatigueAccumulationBand === "HEAVY") {
    pressure += 15;
    push(drivers, "fatigue_heavy", "Heavy fatigue accumulation", 15, "risk", input.fatigueAccumulationScore ?? null);
  } else if (input.fatigueAccumulationBand === "ELEVATED") {
    pressure += 8;
    push(drivers, "fatigue_elevated", "Elevated fatigue accumulation", 8, "risk", input.fatigueAccumulationScore ?? null);
  }

  if ((input.acuteChronicRatio ?? 1) >= 1.4) {
    pressure += 9;
    push(drivers, "acwr", "Elevated acute:chronic relationship", 9, "risk", input.acuteChronicRatio ?? null);
  }

  if ((input.matchCongestionScore ?? 0) >= 60 || input.weekDensity === "congested") {
    pressure += 8;
    push(drivers, "congestion", "Congested schedule", 8, "risk", input.matchCongestionScore ?? null);
  }

  if ((input.travelLoadScore ?? 0) >= 55) {
    pressure += 6;
    push(drivers, "travel", "Travel load pressure", 6, "risk", input.travelLoadScore ?? null);
  }

  if (input.trendDirection === "IMPROVING") {
    pressure -= 6;
    push(drivers, "trend_improving", "Improving trend", -6, "protective", null);
  } else if (input.trendDirection === "SHARPLY_WORSENING") {
    pressure += 7;
    push(drivers, "trend_worse", "Sharply worsening trend", 7, "risk", null);
  }

  if (input.peakWindowBand === "OPEN" || input.peakWindowBand === "PEAK") {
    pressure -= 8;
    push(drivers, "peak_window", "Peak/open window supports load", -8, "protective", input.peakWindowScore ?? null);
  }

  pressure = clamp(pressure, 0, 100);

  const volumeAdjustment: VolumeAdjustmentBand =
    pressure >= 76
      ? "REDUCE_50"
      : pressure >= 62
      ? "REDUCE_30"
      : pressure >= 46
      ? "REDUCE_20"
      : pressure >= 30
      ? "REDUCE_10"
      : "NO_REDUCTION";

  const reductionPercent =
    volumeAdjustment === "REDUCE_50"
      ? 50
      : volumeAdjustment === "REDUCE_30"
      ? 30
      : volumeAdjustment === "REDUCE_20"
      ? 20
      : volumeAdjustment === "REDUCE_10"
      ? 10
      : 0;

  const ranked = rank(drivers);

  return {
    volumeAdjustment,
    reductionPercent,
    primaryDrivers: ranked.primary,
    secondaryDrivers: ranked.secondary,
    confidence: clamp(input.dataConfidence ?? 0.5, 0, 1),
    summary: reductionPercent > 0 ? `Reduce volume by ~${reductionPercent}%.` : "No volume reduction needed.",
  };
}
