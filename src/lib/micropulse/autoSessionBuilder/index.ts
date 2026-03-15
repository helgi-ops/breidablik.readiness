export type {
  SessionType,
  SessionBlockType,
  SessionIntensityBand,
  SessionExposureTag,
  SessionTemplateBlock,
  SessionTemplate,
  SessionDraftBlock,
  SessionDraft,
  SessionBuildInput,
  TeamSessionBuildSummary,
} from "./types";

export { SESSION_TEMPLATE_LIBRARY, getSessionTemplateByType, getDefaultSessionTemplate, getMatchdayAwareTemplate } from "./templateLibrary";

export { buildNormalizedSessionBuildInput, resolveSessionType, toFiniteNumber, clamp } from "./normalize";

export { mapExposureGuidanceToConstraints, blockViolatesConstraint, reduceBlockForConstraint } from "./exposureMapping";

export {
  applyVolumeReduction,
  applyIntensityCap,
  adaptBlocksForAction,
  buildRecoverySubstitution,
  buildHoldDraftNote,
  volumeAdjustmentToPercent,
} from "./adaptationRules";

export { buildSessionBlockReason, buildSessionDraftSummary, buildSessionCoachInstruction, buildSessionExplanationLines } from "./explanations";

export { buildGymSessionDraft } from "./gymBuilder";
export { buildFieldSessionDraft } from "./fieldBuilder";
export { buildRecoverySessionDraft } from "./recoveryBuilder";

export { buildSessionDraft } from "./sessionBuilder";
export { buildTeamSessionBuildSummary } from "./teamAggregation";
