import { clamp } from "./normalize";
import type { DriverContribution, ModificationLevel, NormalizedPrescriptionInput, TrainingAction } from "./types";

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

function rankDrivers(drivers: DriverContribution[]) {
  const sorted = [...drivers].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  return { primary: sorted.slice(0, 3), secondary: sorted.slice(3, 6) };
}

export type TrainingActionDecision = {
  action: TrainingAction;
  modificationLevel: ModificationLevel;
  primaryDrivers: DriverContribution[];
  secondaryDrivers: DriverContribution[];
  confidence: number;
  summary: string;
};

/**
 * Select base training action from aligned multi-system signals.
 */
export function buildTrainingActionDecision(input: NormalizedPrescriptionInput): TrainingActionDecision {
  const drivers: DriverContribution[] = [];
  let severity = 12;

  if (input.athleteState === "RED" || input.readinessState === "RED") {
    severity += 30;
    push(drivers, "red_state", "Red readiness state", 30, "risk", null);
  } else if (input.athleteState === "YELLOW" || input.readinessState === "YELLOW") {
    severity += 16;
    push(drivers, "yellow_state", "Yellow readiness state", 16, "risk", null);
  }

  if (input.injuryRiskBand === "CRITICAL") {
    severity += 26;
    push(drivers, "injury_critical", "Critical injury-risk profile", 26, "risk", input.injuryRiskScore ?? null);
  } else if (input.injuryRiskBand === "HIGH") {
    severity += 16;
    push(drivers, "injury_high", "High injury-risk profile", 16, "risk", input.injuryRiskScore ?? null);
  } else if (input.injuryRiskBand === "LOW") {
    severity -= 8;
    push(drivers, "injury_low", "Low injury-risk profile", -8, "protective", input.injuryRiskScore ?? null);
  }

  if (input.loadToleranceBand === "RECOVERY_ONLY") {
    severity += 22;
    push(drivers, "load_recovery_only", "Load tolerance is recovery-only", 22, "risk", input.loadToleranceScore ?? null);
  } else if (input.loadToleranceBand === "TOLERATES_LOW") {
    severity += 12;
    push(drivers, "load_low", "Low load tolerance", 12, "risk", input.loadToleranceScore ?? null);
  } else if (input.loadToleranceBand === "TOLERATES_HIGH") {
    severity -= 10;
    push(drivers, "load_high", "High load tolerance", -10, "protective", input.loadToleranceScore ?? null);
  }

  if (input.collapseRiskBand === "CRITICAL") {
    severity += 24;
    push(drivers, "collapse_critical", "Critical collapse-risk window", 24, "risk", input.collapseRiskScore ?? null);
  } else if (input.collapseRiskBand === "HIGH") {
    severity += 16;
    push(drivers, "collapse_high", "High collapse-risk window", 16, "risk", input.collapseRiskScore ?? null);
  } else if (input.collapseRiskBand === "LOW") {
    severity -= 5;
    push(drivers, "collapse_low", "Low collapse-risk pressure", -5, "protective", input.collapseRiskScore ?? null);
  }

  if (input.fatigueAccumulationBand === "HEAVY") {
    severity += 18;
    push(drivers, "fatigue_heavy", "Heavy fatigue accumulation", 18, "risk", input.fatigueAccumulationScore ?? null);
  } else if (input.fatigueAccumulationBand === "ELEVATED") {
    severity += 10;
    push(drivers, "fatigue_elevated", "Elevated fatigue accumulation", 10, "risk", input.fatigueAccumulationScore ?? null);
  } else if (input.fatigueAccumulationBand === "LOW") {
    severity -= 4;
    push(drivers, "fatigue_low", "Low fatigue accumulation", -4, "protective", input.fatigueAccumulationScore ?? null);
  }

  if (input.instabilityWindowBand === "HIGHLY_UNSTABLE") {
    severity += 14;
    push(drivers, "instability_high", "High instability window", 14, "risk", input.instabilityWindowScore ?? null);
  } else if (input.instabilityWindowBand === "UNSTABLE") {
    severity += 8;
    push(drivers, "instability_unstable", "Unstable short-term pattern", 8, "risk", input.instabilityWindowScore ?? null);
  } else if (input.instabilityWindowBand === "STABLE") {
    severity -= 5;
    push(drivers, "instability_stable", "Stable short-term pattern", -5, "protective", input.instabilityWindowScore ?? null);
  }

  if (input.trendDirection === "SHARPLY_WORSENING") {
    severity += 10;
    push(drivers, "trend_sharp_worse", "Trend sharply worsening", 10, "risk", null);
  } else if (input.trendDirection === "WORSENING") {
    severity += 6;
    push(drivers, "trend_worse", "Trend worsening", 6, "risk", null);
  } else if (input.trendDirection === "IMPROVING") {
    severity -= 6;
    push(drivers, "trend_improving", "Trend improving", -6, "protective", null);
  }

  if ((input.sleepScore ?? 3) <= 2) {
    severity += 7;
    push(drivers, "sleep_low", "Low sleep score", 7, "risk", input.sleepScore ?? null);
  }
  if ((input.stressScore ?? 3) >= 4) {
    severity += 6;
    push(drivers, "stress_high", "Elevated stress", 6, "risk", input.stressScore ?? null);
  }
  if ((input.sorenessScore ?? 3) <= 2) {
    severity += 7;
    push(drivers, "soreness_low", "Low soreness score (caution)", 7, "risk", input.sorenessScore ?? null);
  }

  if (input.peakWindowBand === "PEAK" || input.peakWindowBand === "OPEN") {
    severity -= 10;
    push(drivers, "peak_window_open", "Peak/open performance window", -10, "protective", input.peakWindowScore ?? null);
  }

  if ((input.matchCongestionScore ?? 0) >= 65 || input.weekDensity === "congested") {
    severity += 7;
    push(drivers, "congested_context", "Congested week context", 7, "risk", input.matchCongestionScore ?? null);
  }

  severity = clamp(severity, 0, 100);

  const severeSignals = [
    input.athleteState === "RED" || input.readinessState === "RED",
    input.injuryRiskBand === "CRITICAL",
    input.loadToleranceBand === "RECOVERY_ONLY",
    input.collapseRiskBand === "CRITICAL" || input.collapseRiskBand === "HIGH",
    input.fatigueAccumulationBand === "HEAVY",
    input.instabilityWindowBand === "HIGHLY_UNSTABLE",
  ].filter(Boolean).length;

  let action: TrainingAction;
  if (severity >= 88 && severeSignals >= 3) action = "HOLD";
  else if (severity >= 62) action = "RECOVERY";
  else if (severity >= 32) action = "MODIFIED";
  else action = "FULL";

  const modificationLevel: ModificationLevel =
    action === "FULL"
      ? severity >= 24
        ? "LIGHT"
        : "NONE"
      : action === "MODIFIED"
      ? severity >= 50
        ? "MODERATE"
        : "LIGHT"
      : "HEAVY";

  const ranked = rankDrivers(drivers);

  return {
    action,
    modificationLevel,
    primaryDrivers: ranked.primary,
    secondaryDrivers: ranked.secondary,
    confidence: clamp(input.dataConfidence ?? 0.5, 0, 1),
    summary:
      action === "HOLD"
        ? "Hold full training and use recovery-only approach today."
        : action === "RECOVERY"
          ? "Recovery-focused day is recommended."
          : action === "MODIFIED"
            ? "Modified session is recommended with targeted constraints."
            : "Full training is supported with standard monitoring.",
  };
}
