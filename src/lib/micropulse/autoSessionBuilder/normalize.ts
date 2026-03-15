import type { FinalRecommendationDecision } from "@/lib/micropulse/rulesEngine";
import type { PrescriptionDecision } from "@/lib/micropulse/prescriptionEngine";
import type { SessionBuildInput, SessionType } from "./types";

export function toFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function inferSessionType(planned: SessionBuildInput["plannedSessionType"]): SessionType {
  if (planned === "gym") return "GYM";
  if (planned === "field") return "FIELD";
  if (planned === "match") return "MATCH";
  if (planned === "recovery") return "RECOVERY";
  if (planned === "mixed") return "MIXED";
  return "MIXED";
}

function deriveConfidence(args: {
  finalRecommendationDecision?: FinalRecommendationDecision | null;
  prescriptionDecision?: PrescriptionDecision | null;
  explicitConfidence?: number | null;
}): number {
  if (typeof args.explicitConfidence === "number" && Number.isFinite(args.explicitConfidence)) {
    return clamp(args.explicitConfidence, 0, 1);
  }
  const values = [args.finalRecommendationDecision?.confidence, args.prescriptionDecision?.confidence].filter(
    (v): v is number => typeof v === "number" && Number.isFinite(v),
  );
  if (!values.length) return 0.45;
  return clamp(values.reduce((a, b) => a + b, 0) / values.length, 0, 1);
}

/**
 * Normalizes heterogeneous inputs into a deterministic session-build contract.
 * Keeps builder decoupled from UI-specific object shapes.
 */
export function buildNormalizedSessionBuildInput(raw: unknown): SessionBuildInput {
  const v = (raw ?? {}) as Partial<SessionBuildInput>;

  const finalRecommendationDecision = (v.finalRecommendationDecision ?? null) as FinalRecommendationDecision | null;
  const prescriptionDecision = (v.prescriptionDecision ?? finalRecommendationDecision?.finalRecommendation ?? null) as PrescriptionDecision | null;

  return {
    playerId: v.playerId ?? undefined,
    playerName: v.playerName ?? undefined,
    teamId: v.teamId ?? undefined,
    date: v.date ?? undefined,
    dayType: v.dayType ?? "training",
    weekDensity: v.weekDensity ?? "normal",
    plannedSessionType: v.plannedSessionType ?? null,
    plannedSessionIntensity: v.plannedSessionIntensity ?? null,
    prescriptionDecision,
    finalRecommendationDecision,
    dataConfidence: deriveConfidence({
      finalRecommendationDecision,
      prescriptionDecision,
      explicitConfidence: toFiniteNumber(v.dataConfidence),
    }),
    isProtectedPlayer: v.isProtectedPlayer ?? null,
  };
}

export function resolveSessionType(input: SessionBuildInput): SessionType {
  if (input.dayType === "off") return "OFF";
  if (input.dayType === "matchday") return "MATCH";
  const fromPlan = inferSessionType(input.plannedSessionType ?? null);
  if (fromPlan !== "MIXED") return fromPlan;

  const action = input.finalRecommendationDecision?.finalRecommendation.action ?? input.prescriptionDecision?.action ?? "MODIFIED";
  if (action === "RECOVERY" || action === "HOLD") return "RECOVERY";
  return "MIXED";
}
