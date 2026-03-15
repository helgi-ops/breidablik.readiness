import type { NormalizedPrescriptionInput, PrescriptionSessionMode, PrescriptionState } from "./types";

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

function asState(value: unknown): PrescriptionState | null {
  const token = String(value ?? "").toUpperCase();
  if (token === "GREEN_PLUS") return "GREEN";
  if (token === "GREEN" || token === "YELLOW" || token === "RED" || token === "GRAY") return token;
  return null;
}

function asSessionMode(value: unknown): PrescriptionSessionMode | null {
  const token = String(value ?? "").toLowerCase();
  if (token === "full" || token === "modified" || token === "recovery" || token === "pending") return token;
  return null;
}

function asPlannedType(value: unknown): NormalizedPrescriptionInput["plannedSessionType"] {
  const token = String(value ?? "").toLowerCase();
  if (token === "gym" || token === "field" || token === "match" || token === "recovery" || token === "mixed") return token;
  return null;
}

function asIntensity(value: unknown): NormalizedPrescriptionInput["plannedSessionIntensity"] {
  const token = String(value ?? "").toLowerCase();
  if (token === "low" || token === "moderate" || token === "high") return token;
  return null;
}

function asDayType(value: unknown): NormalizedPrescriptionInput["dayType"] {
  const token = String(value ?? "").toLowerCase();
  if (token === "matchday" || token === "md+1" || token === "md+2" || token === "md-3" || token === "md-2" || token === "md-1" || token === "training" || token === "off") {
    return token as NormalizedPrescriptionInput["dayType"];
  }
  return null;
}

function asWeekDensity(value: unknown): NormalizedPrescriptionInput["weekDensity"] {
  const token = String(value ?? "").toLowerCase();
  if (token === "low" || token === "normal" || token === "congested") return token;
  return null;
}

/**
 * Confidence is based on the coverage of key upstream systems and load/wellness context.
 */
export function deriveConfidence(input: NormalizedPrescriptionInput): number {
  if (input.dataConfidence != null && Number.isFinite(input.dataConfidence)) {
    return clamp(input.dataConfidence, 0, 1);
  }

  const checks = [
    input.readinessState != null || input.athleteState != null,
    input.injuryRiskBand != null,
    input.loadToleranceBand != null,
    input.collapseRiskBand != null || input.instabilityWindowBand != null,
    input.peakWindowBand != null,
    input.sorenessScore != null || input.sleepScore != null,
    input.acuteChronicRatio != null || input.sessionLoad != null,
    input.dayType != null || input.upcomingMatchInDays != null,
  ].filter(Boolean).length;

  return clamp(0.2 + (checks / 8) * 0.8, 0.2, 1);
}

/**
 * Normalize merged upstream inputs for deterministic prescription selection.
 */
export function buildNormalizedPrescriptionInput(raw: unknown): NormalizedPrescriptionInput {
  const r = asRecord(raw);
  const acuteLoad = toFiniteNumber(r.acuteLoad);
  const chronicLoad = toFiniteNumber(r.chronicLoad);
  const acRatioGiven = toFiniteNumber(r.acuteChronicRatio);
  const acuteChronicRatio =
    acRatioGiven != null ? acRatioGiven : acuteLoad != null && chronicLoad != null && chronicLoad > 0 ? acuteLoad / chronicLoad : null;

  const out: NormalizedPrescriptionInput = {
    playerId: typeof r.playerId === "string" ? r.playerId : undefined,
    date: typeof r.date === "string" ? r.date : undefined,

    readinessScore: toFiniteNumber(r.readinessScore),
    readinessState: asState(r.readinessState),
    athleteState: asState(r.athleteState),
    sessionMode: asSessionMode(r.sessionMode),

    injuryRiskScore: toFiniteNumber(r.injuryRiskScore),
    injuryRiskBand: ["LOW", "MODERATE", "HIGH", "CRITICAL"].includes(String(r.injuryRiskBand ?? "").toUpperCase())
      ? (String(r.injuryRiskBand).toUpperCase() as NormalizedPrescriptionInput["injuryRiskBand"])
      : null,
    performanceScore: toFiniteNumber(r.performanceScore),
    performanceBand: ["PEAK", "READY", "MANAGEABLE", "FATIGUED", "AT_RISK"].includes(String(r.performanceBand ?? "").toUpperCase())
      ? (String(r.performanceBand).toUpperCase() as NormalizedPrescriptionInput["performanceBand"])
      : null,
    loadToleranceScore: toFiniteNumber(r.loadToleranceScore),
    loadToleranceBand: ["TOLERATES_HIGH", "TOLERATES_MODERATE", "TOLERATES_LOW", "RECOVERY_ONLY"].includes(String(r.loadToleranceBand ?? "").toUpperCase())
      ? (String(r.loadToleranceBand).toUpperCase() as NormalizedPrescriptionInput["loadToleranceBand"])
      : null,

    fatigueAccumulationScore: toFiniteNumber(r.fatigueAccumulationScore),
    fatigueAccumulationBand: ["LOW", "BUILDING", "ELEVATED", "HEAVY"].includes(String(r.fatigueAccumulationBand ?? "").toUpperCase())
      ? (String(r.fatigueAccumulationBand).toUpperCase() as NormalizedPrescriptionInput["fatigueAccumulationBand"])
      : null,
    instabilityWindowScore: toFiniteNumber(r.instabilityWindowScore),
    instabilityWindowBand: ["STABLE", "WATCH", "UNSTABLE", "HIGHLY_UNSTABLE"].includes(String(r.instabilityWindowBand ?? "").toUpperCase())
      ? (String(r.instabilityWindowBand).toUpperCase() as NormalizedPrescriptionInput["instabilityWindowBand"])
      : null,
    collapseRiskScore: toFiniteNumber(r.collapseRiskScore),
    collapseRiskBand: ["LOW", "WATCH", "HIGH", "CRITICAL"].includes(String(r.collapseRiskBand ?? "").toUpperCase())
      ? (String(r.collapseRiskBand).toUpperCase() as NormalizedPrescriptionInput["collapseRiskBand"])
      : null,
    peakWindowScore: toFiniteNumber(r.peakWindowScore),
    peakWindowBand: ["NOT_READY", "APPROACHING", "OPEN", "PEAK"].includes(String(r.peakWindowBand ?? "").toUpperCase())
      ? (String(r.peakWindowBand).toUpperCase() as NormalizedPrescriptionInput["peakWindowBand"])
      : null,
    trendDirection: ["IMPROVING", "STABLE", "WORSENING", "SHARPLY_WORSENING"].includes(String(r.trendDirection ?? "").toUpperCase())
      ? (String(r.trendDirection).toUpperCase() as NormalizedPrescriptionInput["trendDirection"])
      : null,

    neuralFatigueScore: toFiniteNumber(r.neuralFatigueScore),
    sorenessScore: toFiniteNumber(r.sorenessScore),
    sleepScore: toFiniteNumber(r.sleepScore),
    stressScore: toFiniteNumber(r.stressScore),
    energyScore: toFiniteNumber(r.energyScore),
    moodScore: toFiniteNumber(r.moodScore),
    rpe: toFiniteNumber(r.rpe),
    sessionLoad: toFiniteNumber(r.sessionLoad),
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

    plannedSessionType: asPlannedType(r.plannedSessionType),
    plannedSessionIntensity: asIntensity(r.plannedSessionIntensity),
    dayType: asDayType(r.dayType),
    weekDensity: asWeekDensity(r.weekDensity),

    dataConfidence: toFiniteNumber(r.dataConfidence),
    ruleHints: r.ruleHints && typeof r.ruleHints === "object" ? (r.ruleHints as NormalizedPrescriptionInput["ruleHints"]) : null,
  };

  out.dataConfidence = deriveConfidence(out);
  return out;
}
