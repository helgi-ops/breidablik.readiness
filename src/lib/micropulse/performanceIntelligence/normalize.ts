import type { IntensityLevel, NormalizedPerformanceIntelligenceInput, ReadinessState, SessionMode } from "./types";

function asRecord(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  return {};
}

export function toFiniteNumber(value: unknown): number | null {
  if (value == null) return null;
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

function asBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  return null;
}

function asReadinessState(value: unknown): ReadinessState | null {
  const token = String(value ?? "").toUpperCase();
  if (token === "GREEN" || token === "YELLOW" || token === "RED" || token === "GRAY") return token;
  if (token === "GREEN_PLUS") return "GREEN";
  return null;
}

function asSessionMode(value: unknown): SessionMode | null {
  const token = String(value ?? "").toLowerCase();
  if (token === "full" || token === "modified" || token === "recovery" || token === "pending") return token;
  return null;
}

function asIntensity(value: unknown): IntensityLevel | null {
  const token = String(value ?? "").toLowerCase();
  if (token === "low" || token === "moderate" || token === "high") return token;
  return null;
}

function clampLikert(value: number | null): number | null {
  if (value == null) return null;
  return clamp(value, 1, 5);
}

/**
 * Build a safe normalized input object for deterministic performance intelligence rules.
 * Values are defensively coerced and bounded so downstream models can remain pure.
 */
export function buildNormalizedPerformanceIntelligenceInput(raw: unknown): NormalizedPerformanceIntelligenceInput {
  const r = asRecord(raw);

  const acuteLoad = toFiniteNumber(r.acuteLoad);
  const chronicLoad = toFiniteNumber(r.chronicLoad);
  const upstreamAcRatio = toFiniteNumber(r.acuteChronicRatio);
  const derivedAcRatio =
    upstreamAcRatio != null
      ? upstreamAcRatio
      : acuteLoad != null && chronicLoad != null && chronicLoad > 0
      ? acuteLoad / chronicLoad
      : null;

  const normalized: NormalizedPerformanceIntelligenceInput = {
    playerId: typeof r.playerId === "string" ? r.playerId : undefined,
    playerName: typeof r.playerName === "string" ? r.playerName : undefined,
    date: typeof r.date === "string" ? r.date : undefined,
    readinessScore: toFiniteNumber(r.readinessScore),
    readinessState: asReadinessState(r.readinessState),
    athleteState: asReadinessState(r.athleteState),
    sessionMode: asSessionMode(r.sessionMode),
    neuralFatigueScore: toFiniteNumber(r.neuralFatigueScore),
    neuralFatigueFlag: asBoolean(r.neuralFatigueFlag),
    sorenessScore: clampLikert(toFiniteNumber(r.sorenessScore)),
    sleepScore: clampLikert(toFiniteNumber(r.sleepScore)),
    stressScore: clampLikert(toFiniteNumber(r.stressScore)),
    energyScore: clampLikert(toFiniteNumber(r.energyScore)),
    moodScore: clampLikert(toFiniteNumber(r.moodScore)),
    rpe: toFiniteNumber(r.rpe),
    sessionLoad: toFiniteNumber(r.sessionLoad),
    acuteLoad,
    chronicLoad,
    acuteChronicRatio: derivedAcRatio != null ? clamp(derivedAcRatio, 0, 4) : null,
    zScore: toFiniteNumber(r.zScore),
    deltaZ: toFiniteNumber(r.deltaZ),
    volatility5d: toFiniteNumber(r.volatility5d),
    volatility7d: toFiniteNumber(r.volatility7d),
    matchCongestionScore: toFiniteNumber(r.matchCongestionScore),
    travelLoadScore: toFiniteNumber(r.travelLoadScore),
    upcomingMatchInDays: toFiniteNumber(r.upcomingMatchInDays),
    plannedSessionIntensity: asIntensity(r.plannedSessionIntensity),
    dataConfidence: toFiniteNumber(r.dataConfidence),
  };

  normalized.dataConfidence = deriveConfidence(normalized);
  return normalized;
}

/**
 * Compute deterministic confidence from available core metrics.
 */
export function deriveConfidence(input: NormalizedPerformanceIntelligenceInput): number {
  if (input.dataConfidence != null && Number.isFinite(input.dataConfidence)) {
    return clamp(input.dataConfidence, 0, 1);
  }

  const checks = [
    input.readinessState != null || input.athleteState != null || input.readinessScore != null,
    input.zScore != null,
    input.deltaZ != null,
    input.acuteChronicRatio != null || input.acuteLoad != null,
    input.volatility7d != null || input.volatility5d != null,
    input.sleepScore != null || input.energyScore != null || input.stressScore != null,
    input.neuralFatigueScore != null || input.neuralFatigueFlag != null,
  ];

  const present = checks.filter(Boolean).length;
  return clamp(present / checks.length, 0.2, 1);
}
