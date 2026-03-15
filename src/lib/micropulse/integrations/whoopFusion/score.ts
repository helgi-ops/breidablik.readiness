import type { WhoopFusionInput } from "./types";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function hasNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export function scoreRecoverySupport(input: WhoopFusionInput): number | null {
  if (!hasNum(input.recoveryScore) && !hasNum(input.hrv) && !hasNum(input.restingHr)) return null;

  const parts: number[] = [];

  if (hasNum(input.recoveryScore)) {
    if (input.recoveryScore >= 67) parts.push(0.7);
    else if (input.recoveryScore >= 34) parts.push(0.05);
    else parts.push(-0.75);
  }

  // Without a personal baseline, HRV only contributes soft support.
  if (hasNum(input.hrv)) {
    if (input.hrv >= 85) parts.push(0.15);
    else if (input.hrv <= 35) parts.push(-0.15);
    else parts.push(0);
  }

  // Without a personal baseline, resting HR only contributes soft caution.
  if (hasNum(input.restingHr)) {
    if (input.restingHr >= 65) parts.push(-0.2);
    else if (input.restingHr <= 48) parts.push(0.1);
    else parts.push(0);
  }

  const avg = parts.reduce((sum, value) => sum + value, 0) / parts.length;
  return round2(clamp(avg, -1, 1));
}

export function scoreSleepSupport(input: WhoopFusionInput): number | null {
  const hasSleep =
    hasNum(input.sleepPerformance) ||
    hasNum(input.sleepConsistency) ||
    hasNum(input.sleepEfficiency) ||
    hasNum(input.totalSleepMillis);
  if (!hasSleep) return null;

  const parts: number[] = [];

  if (hasNum(input.sleepPerformance)) {
    if (input.sleepPerformance >= 85) parts.push(0.6);
    else if (input.sleepPerformance >= 70) parts.push(0.05);
    else parts.push(-0.65);
  }

  if (hasNum(input.sleepEfficiency)) {
    if (input.sleepEfficiency >= 85) parts.push(0.35);
    else if (input.sleepEfficiency >= 75) parts.push(0.05);
    else parts.push(-0.4);
  }

  if (hasNum(input.sleepConsistency)) {
    if (input.sleepConsistency >= 80) parts.push(0.2);
    else if (input.sleepConsistency < 60) parts.push(-0.2);
    else parts.push(0);
  }

  if (hasNum(input.totalSleepMillis)) {
    const hours = input.totalSleepMillis / (1000 * 60 * 60);
    if (hours >= 8) parts.push(0.35);
    else if (hours >= 6) parts.push(0.05);
    else parts.push(-0.4);
  }

  const avg = parts.reduce((sum, value) => sum + value, 0) / parts.length;
  return round2(clamp(avg, -1, 1));
}

export function scoreAutonomicSupport(input: WhoopFusionInput): number | null {
  const hasAutonomic = hasNum(input.hrv) || hasNum(input.restingHr) || hasNum(input.respiratoryRate);
  if (!hasAutonomic) return null;

  const parts: number[] = [];

  if (hasNum(input.hrv)) {
    if (input.hrv >= 85) parts.push(0.25);
    else if (input.hrv <= 35) parts.push(-0.25);
    else parts.push(0);
  }

  if (hasNum(input.restingHr)) {
    if (input.restingHr >= 68) parts.push(-0.35);
    else if (input.restingHr <= 48) parts.push(0.15);
    else parts.push(0);
  }

  if (hasNum(input.respiratoryRate)) {
    if (input.respiratoryRate >= 18) parts.push(-0.25);
    else if (input.respiratoryRate <= 13) parts.push(0.1);
    else parts.push(0);
  }

  const avg = parts.reduce((sum, value) => sum + value, 0) / parts.length;
  return round2(clamp(avg, -1, 1));
}

export function scoreLoadSupport(input: WhoopFusionInput): number | null {
  const hasLoad = hasNum(input.workoutStrain) || hasNum(input.averageHr) || hasNum(input.maxHr);
  if (!hasLoad) return null;

  const parts: number[] = [];

  if (hasNum(input.workoutStrain)) {
    if (input.workoutStrain >= 18) parts.push(-0.45);
    else if (input.workoutStrain >= 12) parts.push(-0.15);
    else if (input.workoutStrain >= 7) parts.push(0.05);
    else parts.push(0.1);
  }

  // Heart-rate fields are contextual and lightly weighted.
  if (hasNum(input.averageHr)) {
    if (input.averageHr >= 155) parts.push(-0.15);
    else parts.push(0);
  }
  if (hasNum(input.maxHr)) {
    if (input.maxHr >= 185) parts.push(-0.1);
    else parts.push(0);
  }

  const avg = parts.reduce((sum, value) => sum + value, 0) / parts.length;
  return round2(clamp(avg, -1, 1));
}

/**
 * Combines WHOOP category support scores into a single overall support score.
 * This is intended as a bounded supporting signal, not a decision engine.
 */
export function combineWhoopSupportScores(
  recovery: number | null,
  sleep: number | null,
  autonomic: number | null,
  load: number | null
): number | null {
  const pieces: { score: number; weight: number }[] = [];
  if (hasNum(recovery)) pieces.push({ score: recovery, weight: 0.35 });
  if (hasNum(sleep)) pieces.push({ score: sleep, weight: 0.3 });
  if (hasNum(autonomic)) pieces.push({ score: autonomic, weight: 0.2 });
  if (hasNum(load)) pieces.push({ score: load, weight: 0.15 });
  if (pieces.length === 0) return null;

  const weighted = pieces.reduce((acc, item) => acc + item.score * item.weight, 0);
  const weightSum = pieces.reduce((acc, item) => acc + item.weight, 0);
  const normalized = weightSum > 0 ? weighted / weightSum : weighted;
  return round2(clamp(normalized, -1, 1));
}

