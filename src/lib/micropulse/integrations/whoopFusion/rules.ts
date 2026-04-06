import {
  scoreAutonomicSupport,
  scoreLoadSupport,
  scoreRecoverySupport,
  scoreSleepSupport,
  combineWhoopSupportScores,
} from "./score";
import type { WhoopFusionFeatures, WhoopFusionInput } from "./types";

import type { WhoopSupportFlag } from "./types";

function hasNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function flagForSupport(score: number | null): WhoopSupportFlag {
  if (!hasNum(score)) return null;
  if (score >= 0.25) return "positive";
  if (score <= -0.25) return "negative";
  return "neutral";
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function getMissingFields(input: WhoopFusionInput): string[] {
  const missing: string[] = [];
  if (!hasNum(input.recoveryScore)) missing.push("recoveryScore");
  if (!hasNum(input.hrv)) missing.push("hrv");
  if (!hasNum(input.restingHr)) missing.push("restingHr");
  if (!hasNum(input.respiratoryRate)) missing.push("respiratoryRate");
  if (!hasNum(input.sleepPerformance)) missing.push("sleepPerformance");
  if (!hasNum(input.sleepConsistency)) missing.push("sleepConsistency");
  if (!hasNum(input.sleepEfficiency)) missing.push("sleepEfficiency");
  if (!hasNum(input.totalSleepMillis)) missing.push("totalSleepMillis");
  if (!hasNum(input.workoutStrain)) missing.push("workoutStrain");
  if (!hasNum(input.averageHr)) missing.push("averageHr");
  if (!hasNum(input.maxHr)) missing.push("maxHr");
  return missing;
}

export function buildWhoopFusionFeatures(input: WhoopFusionInput): WhoopFusionFeatures {
  const recoverySupportScore = scoreRecoverySupport(input);
  const sleepSupportScore = scoreSleepSupport(input);
  const autonomicSupportScore = scoreAutonomicSupport(input);
  const loadSupportScore = scoreLoadSupport(input);

  const overallSupportScore = combineWhoopSupportScores(
    recoverySupportScore,
    sleepSupportScore,
    autonomicSupportScore,
    loadSupportScore
  );

  const missingFields = getMissingFields(input);
  const presentCount = 11 - missingFields.length;
  const hasWhoopData = presentCount > 0;

  const recoveryFlag = flagForSupport(recoverySupportScore);
  const sleepFlag = flagForSupport(sleepSupportScore);
  const autonomicFlag = flagForSupport(autonomicSupportScore);
  const loadFlag = flagForSupport(loadSupportScore);

  const notes: string[] = [];

  if (!hasWhoopData) {
    notes.push("WHOOP snapshot missing for this date.");
  } else {
    if (recoveryFlag === "positive") notes.push("Recovery markers support readiness.");
    if (recoveryFlag === "negative") notes.push("Recovery markers suggest caution.");
    if (sleepFlag === "positive") notes.push("Sleep profile supports readiness.");
    if (sleepFlag === "negative") notes.push("Sleep profile suggests caution.");
    if (autonomicFlag === "negative") notes.push("Autonomic markers are mildly suppressed.");
    if (autonomicFlag === "positive") notes.push("Autonomic markers are stable.");

    const isMixedRecoverySleep =
      (recoveryFlag === "positive" && sleepFlag === "negative") ||
      (recoveryFlag === "negative" && sleepFlag === "positive");
    if (isMixedRecoverySleep) notes.push("Recovery and sleep signals are mixed.");

    if (loadFlag === "negative") notes.push("Workout load is elevated and treated as context.");
    if (presentCount <= 3) notes.push("WHOOP evidence is sparse; confidence is reduced.");
  }

  let confidence = clamp01(presentCount / 8);
  const contradictory =
    (recoveryFlag === "positive" && sleepFlag === "negative") ||
    (recoveryFlag === "negative" && sleepFlag === "positive");
  if (contradictory) confidence = clamp01(confidence - 0.2);
  if (presentCount <= 2) confidence = Math.min(confidence, 0.25);

  return {
    hasWhoopData,
    recoverySupportScore,
    sleepSupportScore,
    autonomicSupportScore,
    loadSupportScore,
    overallSupportScore,
    recoveryFlag,
    sleepFlag,
    autonomicFlag,
    loadFlag,
    confidence: Number(confidence.toFixed(2)),
    missingFields,
    notes: Array.from(new Set(notes)),
  };
}

