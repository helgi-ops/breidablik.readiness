import type { DailyAthleteSnapshot } from "./types";

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function hasFiniteNumber(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

export function hasEnoughRecoverySignal(snapshot: DailyAthleteSnapshot): boolean {
  const recovery = snapshot.recovery;
  const autonomic = snapshot.autonomic;
  return (
    hasFiniteNumber(recovery.recoveryScore) ||
    hasFiniteNumber(recovery.sleepPerformance) ||
    hasFiniteNumber(autonomic.hrv) ||
    hasFiniteNumber(autonomic.restingHr)
  );
}

export function hasEnoughLoadSignal(snapshot: DailyAthleteSnapshot): boolean {
  const load = snapshot.load;
  return (
    hasFiniteNumber(load.sessionRpeLoad) ||
    hasFiniteNumber(load.acuteLoad) ||
    hasFiniteNumber(load.chronicLoad) ||
    hasFiniteNumber(load.acwr) ||
    hasFiniteNumber(load.gpsLoad) ||
    hasFiniteNumber(load.whoopStrain)
  );
}

export function hasEnoughDecisionSignal(snapshot: DailyAthleteSnapshot): boolean {
  return (
    snapshot.subjective.checkInCompleted ||
    hasEnoughRecoverySignal(snapshot) ||
    hasEnoughLoadSignal(snapshot) ||
    hasFiniteNumber(snapshot.stability.zScore) ||
    hasFiniteNumber(snapshot.stability.deltaZ)
  );
}

/**
 * Snapshot confidence is a bounded 0..1 score.
 * Manual + load + context anchor the decision most strongly; WHOOP can increase
 * confidence but does not dominate the total score by itself.
 */
export function computeSnapshotConfidence(snapshot: DailyAthleteSnapshot): number {
  let score = 0.1;

  if (snapshot.subjective.checkInCompleted) score += 0.28;
  if (hasEnoughRecoverySignal(snapshot)) score += 0.16;
  if (hasEnoughLoadSignal(snapshot)) score += 0.22;
  if (snapshot.derived.hasContextData) score += 0.14;
  if (snapshot.derived.hasNeuromuscularData) score += 0.08;
  if (snapshot.derived.hasWhoopData) score += 0.1;
  if (hasFiniteNumber(snapshot.stability.zScore) || hasFiniteNumber(snapshot.stability.deltaZ)) score += 0.08;

  if (!snapshot.subjective.checkInCompleted && !snapshot.derived.hasWhoopData) score -= 0.08;
  if (!snapshot.derived.hasLoadData && !snapshot.derived.hasContextData) score -= 0.06;
  if (!hasEnoughDecisionSignal(snapshot)) score -= 0.14;

  return clamp01(score);
}
