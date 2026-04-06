import type { ManualOverrideDecision, PrescriptionDecision, TrainingAction } from "./types";

export type ManualOverrideInput = Partial<ManualOverrideDecision> & {
  finalAction?: TrainingAction | null;
  finalInstruction?: string | null;
};

/**
 * Build explicit manual override metadata while preserving original recommendation context.
 */
export function buildManualOverrideDecision(
  input: ManualOverrideInput | null | undefined,
  beforeManual: PrescriptionDecision,
): ManualOverrideDecision | null {
  if (!input?.applied) return null;

  const originalAction = beforeManual.action;
  const finalAction = input.finalAction ?? originalAction;
  const originalInstruction = beforeManual.coachInstruction;
  const finalInstruction = input.finalInstruction ?? originalInstruction;

  const changedAction = finalAction !== originalAction;
  const changedInstruction = finalInstruction !== originalInstruction;
  const requiresReason = changedAction || changedInstruction;
  const normalizedReason = typeof input.reason === "string" ? input.reason.trim() : "";

  return {
    applied: true,
    overriddenBy: input.overriddenBy ?? null,
    reason: requiresReason ? (normalizedReason || "Manual override reason required") : (normalizedReason || null),
    originalAction,
    finalAction,
    originalInstruction,
    finalInstruction,
    timestamp: input.timestamp ?? new Date().toISOString(),
  };
}

/**
 * Apply manual override as final layer after rule-driven adjustment.
 */
export function applyManualOverride(
  recommendation: PrescriptionDecision,
  manualOverride: ManualOverrideInput | null | undefined,
): { recommendation: PrescriptionDecision; manual: ManualOverrideDecision | null } {
  const manual = buildManualOverrideDecision(manualOverride, recommendation);
  if (!manual?.applied) return { recommendation, manual: null };

  const next: PrescriptionDecision = {
    ...recommendation,
    action: manual.finalAction ?? recommendation.action,
    coachInstruction: manual.finalInstruction ?? recommendation.coachInstruction,
  };

  return { recommendation: next, manual };
}
