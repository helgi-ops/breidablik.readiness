import type { NormalizedNeuralVolatilityInput, NvSessionMode, NvState } from "./types";

function asRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
}

export function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const n = Number(value.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function asState(value: unknown): NvState | null {
  const token = String(value ?? "").toUpperCase();
  if (token === "GREEN_PLUS") return "GREEN";
  if (token === "GREEN" || token === "YELLOW" || token === "RED" || token === "GRAY") return token;
  return null;
}

function asSessionMode(value: unknown): NvSessionMode | null {
  const token = String(value ?? "").toLowerCase();
  if (token === "full" || token === "modified" || token === "recovery" || token === "pending") return token;
  return null;
}

function asBool(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function clampLikert(value: number | null): number | null {
  if (value == null) return null;
  return clamp(value, 1, 5);
}

export function sanitizeHistory(values: unknown, maxLength = 7): Array<number | null> {
  if (!Array.isArray(values)) return [];
  return values
    .slice(-maxLength)
    .map((v) => toFiniteNumber(v))
    .map((v) => (v != null ? v : null));
}

function sanitizeStateHistory(values: unknown, maxLength = 7): Array<NvState | null> {
  if (!Array.isArray(values)) return [];
  return values.slice(-maxLength).map((v) => asState(v));
}

function sanitizeSessionModeHistory(values: unknown, maxLength = 7): Array<NvSessionMode | null> {
  if (!Array.isArray(values)) return [];
  return values.slice(-maxLength).map((v) => asSessionMode(v));
}

/**
 * Derive confidence from current-day and short history coverage.
 */
export function deriveConfidence(input: NormalizedNeuralVolatilityInput): number {
  if (input.dataConfidence != null && Number.isFinite(input.dataConfidence)) {
    return clamp(input.dataConfidence, 0, 1);
  }

  const currentChecks = [
    input.readinessScore != null || input.readinessState != null || input.athleteState != null,
    input.zScore != null,
    input.deltaZ != null,
    input.neuralFatigueScore != null || input.neuralFatigueFlag != null,
    input.sorenessScore != null,
    input.sleepScore != null,
    input.volatility7d != null || input.volatility5d != null,
  ].filter(Boolean).length;

  const historyChecks = [
    (input.readinessHistory?.length ?? 0) >= 3,
    (input.neuralFatigueHistory?.length ?? 0) >= 3,
    (input.sorenessHistory?.length ?? 0) >= 3,
    (input.sleepHistory?.length ?? 0) >= 3,
    (input.volatilityHistory?.length ?? 0) >= 3,
    (input.athleteStateHistory?.length ?? 0) >= 3,
  ].filter(Boolean).length;

  return clamp(currentChecks / 7 * 0.65 + historyChecks / 6 * 0.35, 0.2, 1);
}

/**
 * Build normalized input for Neural + Volatility Intelligence. Deterministic and defensive.
 */
export function buildNormalizedNeuralVolatilityInput(raw: unknown): NormalizedNeuralVolatilityInput {
  const r = asRecord(raw);
  const acuteLoad = toFiniteNumber(r.acuteLoad);
  const chronicLoad = toFiniteNumber(r.chronicLoad);
  const acRatioGiven = toFiniteNumber(r.acuteChronicRatio);
  const acuteChronicRatio =
    acRatioGiven != null ? acRatioGiven : acuteLoad != null && chronicLoad != null && chronicLoad > 0 ? acuteLoad / chronicLoad : null;

  const input: NormalizedNeuralVolatilityInput = {
    playerId: typeof r.playerId === "string" ? r.playerId : undefined,
    date: typeof r.date === "string" ? r.date : undefined,
    readinessScore: toFiniteNumber(r.readinessScore),
    readinessState: asState(r.readinessState),
    athleteState: asState(r.athleteState),
    sessionMode: asSessionMode(r.sessionMode),
    neuralFatigueScore: toFiniteNumber(r.neuralFatigueScore),
    neuralFatigueFlag: asBool(r.neuralFatigueFlag),
    sorenessScore: clampLikert(toFiniteNumber(r.sorenessScore)),
    sleepScore: clampLikert(toFiniteNumber(r.sleepScore)),
    stressScore: clampLikert(toFiniteNumber(r.stressScore)),
    energyScore: clampLikert(toFiniteNumber(r.energyScore)),
    moodScore: clampLikert(toFiniteNumber(r.moodScore)),
    acuteLoad,
    chronicLoad,
    acuteChronicRatio: acuteChronicRatio != null ? clamp(acuteChronicRatio, 0, 4) : null,
    zScore: toFiniteNumber(r.zScore),
    deltaZ: toFiniteNumber(r.deltaZ),
    volatility5d: toFiniteNumber(r.volatility5d),
    volatility7d: toFiniteNumber(r.volatility7d),
    matchCongestionScore: toFiniteNumber(r.matchCongestionScore),
    travelLoadScore: toFiniteNumber(r.travelLoadScore),
    upcomingMatchInDays: toFiniteNumber(r.upcomingMatchInDays),
    readinessHistory: sanitizeHistory(r.readinessHistory),
    neuralFatigueHistory: sanitizeHistory(r.neuralFatigueHistory),
    sorenessHistory: sanitizeHistory(r.sorenessHistory),
    sleepHistory: sanitizeHistory(r.sleepHistory),
    stressHistory: sanitizeHistory(r.stressHistory),
    volatilityHistory: sanitizeHistory(r.volatilityHistory),
    riskHistory: sanitizeHistory(r.riskHistory),
    loadHistory: sanitizeHistory(r.loadHistory),
    sessionModeHistory: sanitizeSessionModeHistory(r.sessionModeHistory),
    athleteStateHistory: sanitizeStateHistory(r.athleteStateHistory),
    dataConfidence: toFiniteNumber(r.dataConfidence),
  };

  input.dataConfidence = deriveConfidence(input);
  return input;
}
