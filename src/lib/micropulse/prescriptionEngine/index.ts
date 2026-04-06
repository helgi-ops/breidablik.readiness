import { buildTrainingActionDecision } from "./actionSelection";
import {
  buildPrescriptionCoachInstruction,
  buildPrescriptionExplanationLines,
  buildPrescriptionStaffSummary,
} from "./explanations";
import { buildExposureGuidanceDecision } from "./exposureGuidance";
import { buildIntensityCapDecision } from "./intensityCap";
import { buildMatchContextDecision } from "./matchContext";
import { buildNormalizedPrescriptionInput, clamp } from "./normalize";
import { buildRecoveryFocusDecision } from "./recoveryFocus";
import { buildVolumeAdjustmentDecision } from "./volumeAdjustment";
import type {
  DriverContribution,
  NormalizedPrescriptionInput,
  PrescriptionDecision,
} from "./types";

export type {
  DriverContribution,
  ExposureGuidanceTag,
  IntensityCapBand,
  MatchContextTag,
  ModificationLevel,
  NormalizedPrescriptionInput,
  PrescriptionDecision,
  RecoveryFocusTag,
  TeamPrescriptionSummary,
  TrainingAction,
  VolumeAdjustmentBand,
} from "./types";

export { buildNormalizedPrescriptionInput, toFiniteNumber, clamp, deriveConfidence } from "./normalize";
export { buildTrainingActionDecision } from "./actionSelection";
export { buildIntensityCapDecision } from "./intensityCap";
export { buildVolumeAdjustmentDecision } from "./volumeAdjustment";
export { buildExposureGuidanceDecision } from "./exposureGuidance";
export { buildRecoveryFocusDecision } from "./recoveryFocus";
export { buildMatchContextDecision } from "./matchContext";
export {
  buildPrescriptionCoachInstruction,
  buildPrescriptionStaffSummary,
  buildPrescriptionExplanationLines,
  formatPrescriptionDriverLabel,
} from "./explanations";
export { buildTeamPrescriptionSummary } from "./teamAggregation";

function mergeDrivers(...groups: DriverContribution[][]): DriverContribution[] {
  return groups
    .flat()
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
}

function sanitizeExposure(tags: PrescriptionDecision["exposureGuidance"]): PrescriptionDecision["exposureGuidance"] {
  if (tags.length <= 1) return tags;
  if (tags.includes("ALLOW_MAX_SPEED") && tags.some((t) => t === "LIMIT_MAX_SPEED" || t === "SKILL_ONLY" || t === "RECOVERY_MODALITIES")) {
    return tags.filter((t) => t !== "ALLOW_MAX_SPEED");
  }
  return tags;
}

/**
 * Build final Prescription & Action decision.
 * This converts intelligence outputs into practical same-day action guidance.
 */
export function buildPrescriptionDecision(raw: unknown): PrescriptionDecision {
  const input: NormalizedPrescriptionInput = buildNormalizedPrescriptionInput(raw);

  const action = buildTrainingActionDecision(input);
  const intensity = buildIntensityCapDecision(input);
  const volume = buildVolumeAdjustmentDecision(input);
  const exposure = buildExposureGuidanceDecision(input);
  const recovery = buildRecoveryFocusDecision(input);
  const match = buildMatchContextDecision(input);

  let finalAction = action.action;
  if (finalAction === "FULL" && (intensity.intensityCap === "CAP_LOW" || volume.reductionPercent >= 30)) {
    finalAction = "MODIFIED";
  }
  if (finalAction === "MODIFIED" && intensity.intensityCap === "RECOVERY_ONLY" && volume.reductionPercent >= 50) {
    finalAction = "RECOVERY";
  }

  const modificationLevel =
    finalAction === "FULL"
      ? action.modificationLevel === "NONE"
        ? "NONE"
        : "LIGHT"
      : finalAction === "MODIFIED"
      ? action.modificationLevel === "HEAVY"
        ? "MODERATE"
        : action.modificationLevel
      : "HEAVY";

  const primary = mergeDrivers(
    action.primaryDrivers,
    intensity.primaryDrivers,
    volume.primaryDrivers,
    exposure.primaryDrivers,
    recovery.primaryDrivers,
    match.primaryDrivers,
  ).slice(0, 3);
  const secondary = mergeDrivers(
    action.secondaryDrivers,
    intensity.secondaryDrivers,
    volume.secondaryDrivers,
    exposure.secondaryDrivers,
    recovery.secondaryDrivers,
    match.secondaryDrivers,
  ).slice(0, 6);

  const draft: PrescriptionDecision = {
    action: finalAction,
    modificationLevel,
    intensityCap: intensity.intensityCap,
    volumeAdjustment: volume.volumeAdjustment,
    exposureGuidance: sanitizeExposure(exposure.exposureGuidance),
    recoveryFocus: recovery.recoveryFocus,
    matchContext: match.matchContext,
    coachInstruction: "",
    staffSummary: "",
    primaryDrivers: primary,
    secondaryDrivers: secondary,
    confidence: clamp(
      (action.confidence + intensity.confidence + volume.confidence + exposure.confidence + recovery.confidence + match.confidence) / 6,
      0,
      1,
    ),
  };

  draft.coachInstruction = buildPrescriptionCoachInstruction(draft);
  draft.staffSummary = buildPrescriptionStaffSummary(draft);
  void buildPrescriptionExplanationLines(draft);

  return draft;
}
