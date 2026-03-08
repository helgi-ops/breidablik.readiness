import type {
  FatigueClassification,
  FatigueConfidence,
  FatigueDriver,
  FatigueInput,
  FatigueSeverity,
  FatigueType,
} from "./types";
import { getRecommendedModifiers } from "./modifiers";

export function classifyFatigue(input: FatigueInput): FatigueClassification {
  const drivers: FatigueDriver[] = [];

  let neuralScore = 0;
  let tissueScore = 0;
  let systemicScore = 0;

  if ((input.deltaZ ?? 0) <= -1.0) {
    neuralScore += 2;
    drivers.push({
      code: "DELTA_Z_DROP",
      label: "Sharp readiness drop day-to-day",
      points: 2,
      category: "NEURAL",
    });
  }

  if ((input.energy ?? 99) <= 2) {
    neuralScore += 2;
    drivers.push({
      code: "LOW_ENERGY",
      label: "Low energy",
      points: 2,
      category: "NEURAL",
    });
  }

  if ((input.sleepQuality ?? 99) <= 2) {
    neuralScore += 1;
    drivers.push({
      code: "LOW_SLEEP_QUALITY",
      label: "Poor sleep quality",
      points: 1,
      category: "NEURAL",
    });
  }

  if ((input.sleepDuration ?? 99) <= 2) {
    neuralScore += 1;
    drivers.push({
      code: "LOW_SLEEP_DURATION",
      label: "Short sleep duration",
      points: 1,
      category: "NEURAL",
    });
  }

  if ((input.stress ?? 0) >= 4) {
    neuralScore += 1;
    drivers.push({
      code: "HIGH_STRESS",
      label: "High stress",
      points: 1,
      category: "NEURAL",
    });
  }

  if (input.hsrHighYesterday) {
    neuralScore += 2;
    drivers.push({
      code: "HIGH_HSR_YESTERDAY",
      label: "High-speed running elevated yesterday",
      points: 2,
      category: "NEURAL",
    });
  }

  if (input.scheduleCongestion) {
    neuralScore += 1;
    drivers.push({
      code: "SCHEDULE_CONGESTION_NEURAL",
      label: "Congested schedule",
      points: 1,
      category: "NEURAL",
    });
  }

  if (input.travelFlag) {
    neuralScore += 1;
    drivers.push({
      code: "TRAVEL_FLAG_NEURAL",
      label: "Travel load present",
      points: 1,
      category: "NEURAL",
    });
  }

  if ((input.soreness ?? 99) <= 2 && ((input.sten ?? 10) <= 4 || (input.totalScore ?? 99) <= 11)) {
    neuralScore += 1;
    drivers.push({
      code: "LOW_SORENESS_POOR_READINESS",
      label: "Poor readiness without high soreness",
      points: 1,
      category: "NEURAL",
    });
  }

  if ((input.soreness ?? 0) >= 4) {
    tissueScore += 2;
    drivers.push({
      code: "HIGH_SORENESS",
      label: "High muscle soreness",
      points: 2,
      category: "TISSUE",
    });
  }

  if (input.hasPainFlag) {
    tissueScore += 3;
    drivers.push({
      code: "PAIN_FLAG",
      label: `Pain flag present${input.painLocation ? ` (${input.painLocation})` : ""}`,
      points: 3,
      category: "TISSUE",
    });
  }

  if (input.decelHighYesterday) {
    tissueScore += 2;
    drivers.push({
      code: "HIGH_DECEL",
      label: "High deceleration load yesterday",
      points: 2,
      category: "TISSUE",
    });
  }

  if (input.accelHighYesterday) {
    tissueScore += 1;
    drivers.push({
      code: "HIGH_ACCEL",
      label: "High acceleration load yesterday",
      points: 1,
      category: "TISSUE",
    });
  }

  if (input.repeatedSameComplaint) {
    tissueScore += 2;
    drivers.push({
      code: "REPEATED_COMPLAINT",
      label: "Repeated same-region complaint",
      points: 2,
      category: "TISSUE",
    });
  }

  if (input.localComplaintMatchesLoad) {
    tissueScore += 1;
    drivers.push({
      code: "COMPLAINT_MATCHES_LOAD",
      label: "Complaint matches recent load pattern",
      points: 1,
      category: "TISSUE",
    });
  }

  const poorWellnessCount =
    input.poorWellnessCount ??
    [input.energy, input.sleepQuality, input.sleepDuration, input.soreness]
      .filter((v) => typeof v === "number" && (v as number) <= 2).length +
      [input.stress].filter((v) => typeof v === "number" && (v as number) >= 4).length;

  if (poorWellnessCount > 0) {
    systemicScore += poorWellnessCount;
    drivers.push({
      code: "MULTI_DOMAIN_WELLNESS_DECLINE",
      label: `${poorWellnessCount} poor wellness markers`,
      points: poorWellnessCount,
      category: "SYSTEMIC",
    });
  }

  if ((input.totalScore ?? 99) <= 11) {
    systemicScore += 2;
    drivers.push({
      code: "LOW_TOTAL_SCORE",
      label: "Low total wellness score",
      points: 2,
      category: "SYSTEMIC",
    });
  }

  if ((input.lowStenDays ?? 0) >= 2) {
    systemicScore += 2;
    drivers.push({
      code: "LOW_STEN_MULTI_DAY",
      label: "Low STEN on multiple days",
      points: 2,
      category: "SYSTEMIC",
    });
  }

  if (input.scheduleCongestion) {
    systemicScore += 1;
    drivers.push({
      code: "SCHEDULE_CONGESTION_SYSTEMIC",
      label: "Congested schedule",
      points: 1,
      category: "SYSTEMIC",
    });
  }

  if (input.matchMinutesHigh) {
    systemicScore += 1;
    drivers.push({
      code: "HIGH_MATCH_MINUTES",
      label: "High recent match minutes",
      points: 1,
      category: "SYSTEMIC",
    });
  }

  if (input.teamVolatilityHigh) {
    systemicScore += 1;
    drivers.push({
      code: "TEAM_VOLATILITY_HIGH",
      label: "Team volatility elevated",
      points: 1,
      category: "SYSTEMIC",
    });
  }

  if (input.travelFlag) {
    systemicScore += 1;
    drivers.push({
      code: "TRAVEL_FLAG_SYSTEMIC",
      label: "Travel load present",
      points: 1,
      category: "SYSTEMIC",
    });
  }

  const ranked = [
    { type: "NEURAL" as const, score: neuralScore },
    { type: "TISSUE" as const, score: tissueScore },
    { type: "SYSTEMIC" as const, score: systemicScore },
  ].sort((a, b) => b.score - a.score);

  const top = ranked[0];
  const second = ranked[1];

  let primaryFatigueType: FatigueType = "NONE";
  let secondaryFatigueType: FatigueType = "NONE";

  if (top.score === 0) {
    primaryFatigueType = "NONE";
    secondaryFatigueType = "NONE";
  } else if (top.score - second.score <= 1 && second.score >= 3) {
    primaryFatigueType = "MIXED";
    secondaryFatigueType = second.type;
  } else {
    primaryFatigueType = top.type;
    secondaryFatigueType = second.score > 0 ? second.type : "NONE";
  }

  let severity: FatigueSeverity = "LOW";
  if (top.score >= 6) severity = "HIGH";
  else if (top.score >= 3) severity = "MODERATE";

  const completenessRaw =
    [input.hasWellnessData, input.hasLoadData, input.deltaZ != null, input.sten != null, input.totalScore != null]
      .filter(Boolean).length / 5;

  const scoreGap = top.score - second.score;

  let confidence: FatigueConfidence = "LOW";
  if (completenessRaw >= 0.8 && scoreGap >= 2) confidence = "HIGH";
  else if (completenessRaw >= 0.5) confidence = "MODERATE";

  const recommendedModifiers = getRecommendedModifiers({
    primaryFatigueType,
    secondaryFatigueType,
    severity,
    painLocation: input.painLocation ?? null,
    mdDay: input.mdDay ?? null,
  });

  return {
    playerId: input.playerId,
    neuralScore,
    tissueScore,
    systemicScore,
    primaryFatigueType,
    secondaryFatigueType,
    severity,
    confidence,
    drivers: drivers.sort((a, b) => b.points - a.points),
    recommendedModifiers,
    debug: {
      dataCompleteness: completenessRaw,
      scoreGap,
      mixedState: primaryFatigueType === "MIXED",
    },
  };
}