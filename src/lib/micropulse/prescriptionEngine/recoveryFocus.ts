import { clamp } from "./normalize";
import type { DriverContribution, NormalizedPrescriptionInput, RecoveryFocusTag } from "./types";

export type RecoveryFocusDecision = {
  recoveryFocus: RecoveryFocusTag[];
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

function unique(tags: RecoveryFocusTag[]): RecoveryFocusTag[] {
  return Array.from(new Set(tags));
}

/**
 * Select targeted recovery priorities for staff communication.
 */
export function buildRecoveryFocusDecision(input: NormalizedPrescriptionInput): RecoveryFocusDecision {
  const drivers: DriverContribution[] = [];
  const tags: RecoveryFocusTag[] = [];

  if ((input.sleepScore ?? 3) <= 2) {
    tags.push("SLEEP", "DOWNREGULATION");
    push(drivers, "sleep", "Sleep suppression", 12, "risk", input.sleepScore ?? null);
  }

  if ((input.stressScore ?? 3) >= 4) {
    tags.push("DOWNREGULATION", "HYDRATION");
    push(drivers, "stress", "Elevated stress load", 10, "risk", input.stressScore ?? null);
  }

  if ((input.sorenessScore ?? 3) <= 2 || input.fatigueAccumulationBand === "HEAVY") {
    tags.push("SOFT_TISSUE", "LOW_INTENSITY_AEROBIC", "MOBILITY");
    push(drivers, "soreness", "Soreness/fatigue accumulation", 12, "risk", input.sorenessScore ?? null);
  }

  if ((input.travelLoadScore ?? 0) >= 50) {
    tags.push("TRAVEL_RECOVERY", "HYDRATION", "NUTRITION");
    push(drivers, "travel", "Travel recovery demand", 10, "risk", input.travelLoadScore ?? null);
  }

  if (input.dayType === "md+1" || input.dayType === "matchday") {
    // Post-match recovery follows a fixed time-course (neuromuscular + muscle-
    // damage markers depressed ~24–72 h, heaviest MD+1) independent of how the
    // athlete feels, so MD+1/matchday biases recovery focus (Nédélec 2012 /
    // Silva 2018).
    tags.push("LOW_INTENSITY_AEROBIC", "MOBILITY");
    push(drivers, "day_context", "Post-match recovery context", 7, "risk", null);
  }

  if (
    (input.peakWindowBand === "OPEN" || input.peakWindowBand === "PEAK") &&
    (input.sleepScore ?? 3) >= 4 &&
    (input.sorenessScore ?? 3) >= 4 &&
    (input.stressScore ?? 3) <= 3 &&
    (input.travelLoadScore ?? 0) < 40
  ) {
    tags.push("NO_EXTRA_RECOVERY_NEEDED");
    push(drivers, "ready_profile", "Stable recovery profile", -8, "protective", null);
  }

  const deduped = unique(tags);
  const ranked = rank(drivers);

  return {
    recoveryFocus: deduped.length ? deduped : ["NO_EXTRA_RECOVERY_NEEDED"],
    primaryDrivers: ranked.primary,
    secondaryDrivers: ranked.secondary,
    confidence: clamp(input.dataConfidence ?? 0.5, 0, 1),
    summary:
      deduped.length && !deduped.includes("NO_EXTRA_RECOVERY_NEEDED")
        ? `Recovery emphasis: ${deduped.map((t) => t.toLowerCase().replace(/_/g, " ")).join(", ")}.`
        : "No extra recovery emphasis needed.",
  };
}
