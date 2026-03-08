import { getRecommendedModifiers } from "@/lib/fatigue/modifiers";
import type { CalibrationConfig, DeepPartial } from "@/lib/calibration/config";
import { resolveCalibrationConfig } from "@/lib/calibration/config";
import type { FatigueClassification, FatigueInput, FatigueType } from "@/lib/fatigue/types";

function severityFromScore(
  score: number,
  cfg: CalibrationConfig
): FatigueClassification["severity"] {
  if (score >= cfg.fatigue.severityThresholds.highMin) return "HIGH";
  if (score >= cfg.fatigue.severityThresholds.moderateMin) return "MODERATE";
  return "LOW";
}

function confidenceFromSignals(signalCount: number, margin: number): FatigueClassification["confidence"] {
  if (signalCount >= 5 && margin >= 2) return "HIGH";
  if (signalCount >= 3 && margin >= 1) return "MEDIUM";
  return "LOW";
}

function topTwo(scores: Record<Exclude<FatigueType, "NONE" | "MIXED">, number>) {
  const entries = Object.entries(scores) as Array<[Exclude<FatigueType, "NONE" | "MIXED">, number]>;
  entries.sort((a, b) => b[1] - a[1]);
  return { first: entries[0], second: entries[1] };
}

export function classifyFatigue(
  input: FatigueInput,
  calibrationConfig?: DeepPartial<CalibrationConfig>
): FatigueClassification {
  const cfg = resolveCalibrationConfig(calibrationConfig);
  const drivers: string[] = [];
  let neuralScore = 0;
  let tissueScore = 0;
  let systemicScore = 0;

  if ((input.deltaZ ?? 0) <= -1.0) {
    neuralScore += 2;
    drivers.push("DELTA_Z_DROP");
  }
  if ((input.energy ?? 10) <= 2) {
    neuralScore += 2;
    drivers.push("LOW_ENERGY");
  }
  if ((input.sleepQuality ?? 10) <= 2) {
    neuralScore += 1;
    drivers.push("LOW_SLEEP_QUALITY");
  }
  if ((input.sleepDuration ?? 10) <= 2) {
    neuralScore += 1;
    drivers.push("LOW_SLEEP_DURATION");
  }
  if ((input.stress ?? 0) >= 4) {
    neuralScore += 1;
    drivers.push("HIGH_STRESS");
  }
  if (input.hsrHighYesterday) {
    neuralScore += 1;
    drivers.push("HIGH_HSR_YESTERDAY");
  }
  if (input.travelFlag || input.scheduleCongestion) {
    neuralScore += 1;
    drivers.push("SCHEDULE_OR_TRAVEL_LOAD");
  }
  if ((input.zReadiness ?? 1) <= -0.8 && (input.soreness ?? 0) <= 2) {
    neuralScore += 1;
    drivers.push("LOW_READINESS_LOW_SORENESS_PATTERN");
  }

  if ((input.soreness ?? 0) >= 4) {
    tissueScore += 2;
    drivers.push("HIGH_SORENESS");
  }
  if (input.hasPainFlag) {
    tissueScore += 2;
    drivers.push("PAIN_FLAG");
  }
  if (input.decelHighYesterday) {
    tissueScore += 1;
    drivers.push("HIGH_DECEL_YESTERDAY");
  }
  if (input.accelHighYesterday) {
    tissueScore += 1;
    drivers.push("HIGH_ACCEL_YESTERDAY");
  }
  if (input.repeatedSameComplaint) {
    tissueScore += 1;
    drivers.push("REPEATED_LOCAL_COMPLAINT");
  }
  if (input.localComplaintMatchesLoad) {
    tissueScore += 1;
    drivers.push("COMPLAINT_MATCHES_LOAD");
  }

  const poorWellnessCount =
    input.poorWellnessCount ??
    [
      (input.energy ?? 10) <= 3,
      (input.sleepQuality ?? 10) <= 3,
      (input.sleepDuration ?? 10) <= 3,
      (input.stress ?? 0) >= 4,
      (input.soreness ?? 0) >= 4,
    ].filter(Boolean).length;

  if (poorWellnessCount >= 3) {
    systemicScore += 2;
    drivers.push("MULTI_WELLNESS_POOR");
  }
  if ((input.totalScore ?? 100) <= 40) {
    systemicScore += 2;
    drivers.push("TOTAL_SCORE_LOW");
  }
  if ((input.lowStenDays ?? 0) >= 2) {
    systemicScore += 2;
    drivers.push("LOW_STEN_MULTIDAY");
  }
  if (input.scheduleCongestion) {
    systemicScore += 1;
    drivers.push("SCHEDULE_CONGESTION");
  }
  if (input.matchMinutesHigh) {
    systemicScore += 1;
    drivers.push("MATCH_MINUTES_HIGH");
  }
  if (input.teamVolatilityHigh) {
    systemicScore += 1;
    drivers.push("TEAM_VOLATILITY_HIGH");
  }
  if (input.travelFlag) {
    systemicScore += 1;
    drivers.push("TRAVEL_FLAG");
  }

  const scores: Record<Exclude<FatigueType, "NONE" | "MIXED">, number> = {
    NEURAL: neuralScore,
    TISSUE: tissueScore,
    SYSTEMIC: systemicScore,
  };

  const { first, second } = topTwo(scores);
  const [firstType, firstScore] = first;
  const [, secondScore] = second;
  const margin = firstScore - secondScore;

  let primaryFatigueType: FatigueType = "NONE";
  if (firstScore > 0) {
    primaryFatigueType =
      margin <= cfg.fatigue.mixedStateGapMax && secondScore > 0 ? "MIXED" : firstType;
  }

  const severity = severityFromScore(firstScore, cfg);
  const confidence = confidenceFromSignals(Array.from(new Set(drivers)).length, margin);
  const recommendedModifiers = getRecommendedModifiers(primaryFatigueType, severity, input);

  return {
    playerId: input.playerId,
    primaryFatigueType,
    severity,
    confidence,
    score: firstScore,
    drivers: Array.from(new Set(drivers)),
    recommendedModifiers,
    reasonCodes: Array.from(new Set(drivers)),
  };
}

export default classifyFatigue;
