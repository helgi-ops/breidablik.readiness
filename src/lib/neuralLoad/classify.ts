import { classifyReadinessTrajectory, predictNextDayRisk } from "@/lib/neuralLoad/predict";
import type { NeuralLoadClassification, NeuralLoadDriver, NeuralLoadInput, NeuralLoadState } from "@/lib/neuralLoad/types";

function pushDriver(list: NeuralLoadDriver[], code: string, label: string, points: number) {
  list.push({ code, label, points });
}

function stateFromScore(score: number): NeuralLoadState {
  if (score >= 9) return "CRITICAL";
  if (score >= 6) return "HIGH";
  if (score >= 3) return "RISING";
  return "STABLE";
}

function countRecentDrops(zHistory: number[] | null | undefined): number {
  if (!Array.isArray(zHistory) || zHistory.length < 2) return 0;
  let drops = 0;
  for (let i = 1; i < zHistory.length; i += 1) {
    const d = zHistory[i] - zHistory[i - 1];
    if (d <= -0.15) drops += 1;
  }
  return drops;
}

function dataCompleteness(input: NeuralLoadInput): number {
  const fields: Array<number | null> = [
    input.z,
    input.zPrev,
    input.deltaZ,
    input.sten,
    input.totalScore,
    input.energy,
    input.sleepQuality,
    input.sleepDuration,
    input.stress,
    input.soreness,
  ];
  const present = fields.filter((x) => typeof x === "number" && Number.isFinite(x)).length;
  return Math.round((present / fields.length) * 100);
}

export function formatNeuralLoadSummary(input: Pick<NeuralLoadClassification, "neuralLoadState" | "readinessTrajectory" | "nextDayRisk">): string {
  return `${input.neuralLoadState} neural load, ${input.readinessTrajectory.toLowerCase()} trajectory, ${input.nextDayRisk.toLowerCase()} next-day risk`;
}

export function classifyNeuralLoad(input: NeuralLoadInput): NeuralLoadClassification {
  const drivers: NeuralLoadDriver[] = [];
  let score = 0;

  if ((input.deltaZ ?? 0) <= -1.0) {
    score += 2;
    pushDriver(drivers, "DELTA_Z_SHARP_DROP", "Strong negative deltaZ", 2);
  } else if ((input.deltaZ ?? 0) <= -0.5) {
    score += 1;
    pushDriver(drivers, "DELTA_Z_DROP", "Negative deltaZ", 1);
  }

  // 3 = neutral baseline. Only values <=2 count as fatigue signals.
  if ((input.energy ?? 99) <= 2) {
    score += 2;
    pushDriver(drivers, "LOW_ENERGY", "Low energy", 2);
    if ((input.energy ?? 99) === 1) {
      score += 1;
      pushDriver(drivers, "VERY_LOW_ENERGY", "Very low energy", 1);
    }
  }
  // 3 = neutral baseline. Only values <=2 count as fatigue signals.
  if ((input.sleepQuality ?? 99) <= 2) {
    score += 1;
    pushDriver(drivers, "LOW_SLEEP_QUALITY", "Poor sleep quality", 1);
    if ((input.sleepQuality ?? 99) === 1) {
      score += 1;
      pushDriver(drivers, "VERY_LOW_SLEEP_QUALITY", "Very poor sleep quality", 1);
    }
  }
  // 3 = neutral baseline. Only values <=2 count as fatigue signals.
  if ((input.sleepDuration ?? 99) <= 2) {
    score += 1;
    pushDriver(drivers, "LOW_SLEEP_DURATION", "Short sleep duration", 1);
    if ((input.sleepDuration ?? 99) === 1) {
      score += 1;
      pushDriver(drivers, "VERY_LOW_SLEEP_DURATION", "Very short sleep duration", 1);
    }
  }
  if ((input.stress ?? 0) >= 4) {
    score += 1;
    pushDriver(drivers, "HIGH_STRESS", "Elevated stress", 1);
  }

  if (input.hsrHighYesterday) {
    score += 1;
    pushDriver(drivers, "HIGH_HSR", "High-speed load exposure", 1);
  }
  if (input.maxVelocityHighYesterday) {
    score += 1;
    pushDriver(drivers, "HIGH_MAX_VELOCITY", "High max-velocity exposure", 1);
  }

  if (input.scheduleCongestion) {
    score += 1;
    pushDriver(drivers, "SCHEDULE_CONGESTION", "Schedule congestion", 1);
  }
  if (input.travelFlag) {
    score += 1;
    pushDriver(drivers, "TRAVEL_LOAD", "Travel load", 1);
  }
  if (input.matchMinutesHigh) {
    score += 1;
    pushDriver(drivers, "MATCH_LOAD", "High recent match minutes", 1);
  }

  if ((input.lowStenDays ?? 0) >= 2) {
    score += 2;
    pushDriver(drivers, "LOW_STEN_MULTIDAY", "Low STEN over multiple days", 2);
  }
  if ((input.totalScore ?? 100) <= 40) {
    score += 2;
    pushDriver(drivers, "LOW_TOTAL_SCORE", "Low readiness total score", 2);
  }
  if ((input.volatility ?? 0) >= 40 || input.teamVolatilityHigh) {
    score += 1;
    pushDriver(drivers, "HIGH_VOLATILITY", "Elevated readiness volatility", 1);
  }

  const fatigueType = String(input.fatigue?.primaryFatigueType ?? "NONE").toUpperCase();
  const fatigueSeverity = String(input.fatigue?.severity ?? "LOW").toUpperCase();
  if (fatigueType === "NEURAL") {
    score += 2;
    pushDriver(drivers, "FATIGUE_NEURAL", "Neural fatigue classification", 2);
  }
  if (fatigueType === "SYSTEMIC" && fatigueSeverity === "HIGH") {
    score += 2;
    pushDriver(drivers, "FATIGUE_SYSTEMIC_HIGH", "Systemic fatigue (high)", 2);
  } else if (fatigueType === "SYSTEMIC" && fatigueSeverity === "MODERATE") {
    score += 1;
    pushDriver(drivers, "FATIGUE_SYSTEMIC_MOD", "Systemic fatigue (moderate)", 1);
  }

  const trajectory = classifyReadinessTrajectory({
    zHistory: input.zHistory ?? null,
    z: input.z,
    zPrev: input.zPrev,
    deltaZ: input.deltaZ,
  });

  if (trajectory === "DECLINING") {
    score += 1;
    pushDriver(drivers, "READINESS_DECLINING", "Readiness trajectory declining", 1);
  }

  const neuralLoadState = stateFromScore(score);
  const risk = predictNextDayRisk({
    neuralLoadState,
    trajectory,
    source: {
      hsrHighYesterday: input.hsrHighYesterday,
      maxVelocityHighYesterday: input.maxVelocityHighYesterday,
      scheduleCongestion: input.scheduleCongestion,
      travelFlag: input.travelFlag,
      lowStenDays: input.lowStenDays,
      fatigue: input.fatigue ?? null,
    },
  });

  return {
    playerId: input.playerId,
    neuralLoadScore: score,
    neuralLoadState,
    readinessTrajectory: trajectory,
    nextDayRisk: risk.risk,
    drivers,
    summary: formatNeuralLoadSummary({
      neuralLoadState,
      readinessTrajectory: trajectory,
      nextDayRisk: risk.risk,
    }),
    debug: {
      dataCompleteness: dataCompleteness(input),
      recentDropCount: countRecentDrops(input.zHistory ?? null),
      // 3 = neutral baseline. Only values <=2 count as fatigue signals.
      sleepTrendFlag: (input.sleepQuality ?? 99) <= 2 || (input.sleepDuration ?? 99) <= 2,
      repeatedHighLoadFlag: !!(input.hsrHighYesterday && input.maxVelocityHighYesterday),
    },
  };
}

export default classifyNeuralLoad;
