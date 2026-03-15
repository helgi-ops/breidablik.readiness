import { clamp } from "./normalize";
import type { DriverContribution, IntensityCapBand, NormalizedPrescriptionInput } from "./types";

export type IntensityCapDecision = {
  intensityCap: IntensityCapBand;
  recommendedMaxIntensity: "low" | "moderate" | "high";
  primaryDrivers: DriverContribution[];
  secondaryDrivers: DriverContribution[];
  confidence: number;
  summary: string;
};

function push(
  drivers: DriverContribution[],
  key: string,
  label: string,
  contribution: number,
  direction: DriverContribution["direction"],
  value?: number | null,
): void {
  if (Math.abs(contribution) < 0.001) return;
  drivers.push({ key, label, contribution, direction, value: value ?? null });
}

function rank(drivers: DriverContribution[]) {
  const sorted = [...drivers].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  return { primary: sorted.slice(0, 3), secondary: sorted.slice(3, 6) };
}

/**
 * Recommend max intensity cap; this refines action selection rather than replacing it.
 */
export function buildIntensityCapDecision(input: NormalizedPrescriptionInput): IntensityCapDecision {
  const drivers: DriverContribution[] = [];
  let pressure = 10;

  if (input.collapseRiskBand === "CRITICAL" || input.loadToleranceBand === "RECOVERY_ONLY") {
    pressure += 42;
    push(drivers, "critical_limit", "Critical tolerance/collapse pressure", 42, "risk", null);
  } else if (input.collapseRiskBand === "HIGH" || input.injuryRiskBand === "HIGH") {
    pressure += 22;
    push(drivers, "high_limit", "High risk pressure", 22, "risk", null);
  } else if (input.injuryRiskBand === "LOW" && input.loadToleranceBand === "TOLERATES_HIGH") {
    pressure -= 10;
    push(drivers, "high_tolerance", "High tolerance profile", -10, "protective", null);
  }

  if (input.instabilityWindowBand === "HIGHLY_UNSTABLE") {
    pressure += 16;
    push(drivers, "instability", "Highly unstable profile", 16, "risk", input.instabilityWindowScore ?? null);
  } else if (input.instabilityWindowBand === "UNSTABLE") {
    pressure += 8;
    push(drivers, "instability_moderate", "Unstable window", 8, "risk", input.instabilityWindowScore ?? null);
  }

  if ((input.neuralFatigueScore ?? 0) >= 8) {
    pressure += 10;
    push(drivers, "neural_high", "High neural fatigue", 10, "risk", input.neuralFatigueScore ?? null);
  }
  if ((input.sorenessScore ?? 3) <= 2) {
    pressure += 8;
    push(drivers, "soreness_low", "Low soreness score (caution)", 8, "risk", input.sorenessScore ?? null);
  }

  if (input.peakWindowBand === "PEAK" || input.peakWindowBand === "OPEN") {
    pressure -= 10;
    push(drivers, "peak_window", "Peak/open window supports intensity", -10, "protective", input.peakWindowScore ?? null);
  }

  if (input.dayType === "md-1") {
    pressure += 8;
    push(drivers, "md1", "Pre-match intensity protection", 8, "risk", null);
  }
  if (input.dayType === "md-3" && (input.peakWindowBand === "OPEN" || input.peakWindowBand === "PEAK")) {
    pressure -= 6;
    push(drivers, "md3_open", "MD-3 adaptation opportunity", -6, "protective", null);
  }

  pressure = clamp(pressure, 0, 100);

  const intensityCap: IntensityCapBand =
    pressure >= 72 ? "RECOVERY_ONLY" : pressure >= 58 ? "CAP_LOW" : pressure >= 40 ? "CAP_MODERATE" : pressure >= 24 ? "CAP_HIGH" : "NO_CAP";

  const recommendedMaxIntensity =
    intensityCap === "RECOVERY_ONLY" || intensityCap === "CAP_LOW"
      ? "low"
      : intensityCap === "CAP_MODERATE"
      ? "moderate"
      : "high";

  const ranked = rank(drivers);

  return {
    intensityCap,
    recommendedMaxIntensity,
    primaryDrivers: ranked.primary,
    secondaryDrivers: ranked.secondary,
    confidence: clamp(input.dataConfidence ?? 0.5, 0, 1),
    summary:
      intensityCap === "RECOVERY_ONLY"
        ? "Recovery-only intensity cap is recommended."
        : intensityCap === "CAP_LOW"
          ? "Keep intensity low today."
          : intensityCap === "CAP_MODERATE"
            ? "Cap intensity at moderate output."
            : intensityCap === "CAP_HIGH"
              ? "Allow high intensity with control."
              : "No intensity cap required.",
  };
}
