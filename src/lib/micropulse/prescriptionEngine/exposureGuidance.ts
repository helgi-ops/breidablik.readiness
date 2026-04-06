import { clamp } from "./normalize";
import type { DriverContribution, ExposureGuidanceTag, NormalizedPrescriptionInput } from "./types";

export type ExposureGuidanceDecision = {
  exposureGuidance: ExposureGuidanceTag[];
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

function dedupe(tags: ExposureGuidanceTag[]): ExposureGuidanceTag[] {
  return Array.from(new Set(tags));
}

/**
 * Build practical exposure constraints for field/gym execution.
 */
export function buildExposureGuidanceDecision(input: NormalizedPrescriptionInput): ExposureGuidanceDecision {
  const drivers: DriverContribution[] = [];
  const tags: ExposureGuidanceTag[] = [];

  const severe =
    input.collapseRiskBand === "CRITICAL" ||
    input.loadToleranceBand === "RECOVERY_ONLY" ||
    input.injuryRiskBand === "CRITICAL" ||
    input.athleteState === "RED";

  if (severe) {
    tags.push("SKILL_ONLY", "RECOVERY_MODALITIES");
    push(drivers, "severe_profile", "Severe protection profile", 30, "risk", null);
  }

  if ((input.neuralFatigueScore ?? 0) >= 7 || input.instabilityWindowBand === "HIGHLY_UNSTABLE") {
    tags.push("LIMIT_MAX_SPEED", "LIMIT_DECELS");
    push(drivers, "neural_instability", "Neural fatigue/instability", 14, "risk", input.neuralFatigueScore ?? null);
  }

  if (input.fatigueAccumulationBand === "HEAVY" || (input.sorenessScore ?? 3) <= 2) {
    tags.push("LIMIT_PLYOS", "LIMIT_GYM_INTENSITY");
    push(drivers, "fatigue_soreness", "Fatigue and soreness pressure", 12, "risk", input.sorenessScore ?? null);
  }

  if ((input.matchCongestionScore ?? 0) >= 60 || input.dayType === "md-1") {
    tags.push("LIMIT_FIELD_MINUTES");
    push(drivers, "match_protection", "Match proximity/congestion", 9, "risk", input.matchCongestionScore ?? null);
  }

  if (input.plannedSessionType === "field" && (input.injuryRiskBand === "HIGH" || input.collapseRiskBand === "HIGH")) {
    tags.push("LIMIT_CONTACT");
    push(drivers, "field_contact", "Field exposure risk", 8, "risk", null);
  }

  if (
    (input.peakWindowBand === "OPEN" || input.peakWindowBand === "PEAK") &&
    input.instabilityWindowBand !== "HIGHLY_UNSTABLE" &&
    input.collapseRiskBand !== "HIGH" &&
    input.collapseRiskBand !== "CRITICAL"
  ) {
    tags.push("ALLOW_MAX_SPEED");
    push(drivers, "peak_exposure", "Peak window supports quality exposure", -8, "protective", input.peakWindowScore ?? null);
  }

  const finalTags = dedupe(tags);
  const ranked = rank(drivers);

  return {
    exposureGuidance: finalTags,
    primaryDrivers: ranked.primary,
    secondaryDrivers: ranked.secondary,
    confidence: clamp(input.dataConfidence ?? 0.5, 0, 1),
    summary: finalTags.length
      ? `Exposure guidance: ${finalTags.map((t) => t.toLowerCase().replace(/_/g, " ")).join(", ")}.`
      : "No specific exposure restrictions required.",
  };
}
