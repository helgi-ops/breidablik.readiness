import type { FinalRecommendationDecision } from "@/lib/micropulse/rulesEngine";
import type { PrescriptionDecision } from "@/lib/micropulse/prescriptionEngine";

export type SessionType = "GYM" | "FIELD" | "RECOVERY" | "MATCH" | "MIXED" | "OFF";

export type SessionBlockType =
  | "PREP"
  | "MAIN"
  | "POWER"
  | "STRENGTH"
  | "SPEED"
  | "CONDITIONING"
  | "SKILL"
  | "MOBILITY"
  | "RECOVERY"
  | "DOWNREGULATION"
  | "AEROBIC_FLUSH"
  | "ISOMETRIC"
  | "ACCESSORY";

export type SessionIntensityBand = "LOW" | "MODERATE" | "HIGH";

export type SessionExposureTag =
  | "MAX_SPEED"
  | "HIGH_DECEL"
  | "CONTACT"
  | "PLYOS"
  | "HEAVY_GYM"
  | "FIELD_MINUTES"
  | "TECHNICAL_ONLY"
  | "RECOVERY_ONLY";

export type SessionTemplateBlock = {
  id: string;
  type: SessionBlockType;
  title: string;
  description?: string;
  defaultDurationMin?: number | null;
  defaultSets?: number | null;
  defaultReps?: string | null;
  defaultIntensity?: SessionIntensityBand | null;
  exposureTags?: SessionExposureTag[];
  optional?: boolean;
};

export type SessionTemplate = {
  id: string;
  name: string;
  sessionType: SessionType;
  dayType?: "matchday" | "md+1" | "md+2" | "md-3" | "md-2" | "md-1" | "training" | "off" | null;
  blocks: SessionTemplateBlock[];
  notes?: string;
};

export type SessionDraftBlock = {
  id: string;
  type: SessionBlockType;
  title: string;
  description?: string;
  durationMin?: number | null;
  sets?: number | null;
  reps?: string | null;
  intensity?: SessionIntensityBand | null;
  exposureTags?: SessionExposureTag[];
  included: boolean;
  modificationReason?: string | null;
};

export type SessionDraft = {
  playerId?: string;
  playerName?: string;
  teamId?: string;
  date?: string;
  sessionType: SessionType;
  baseTemplateId?: string | null;
  draftAction: "FULL" | "MODIFIED" | "RECOVERY" | "HOLD";
  draftSummary: string;
  coachInstruction: string;
  blocks: SessionDraftBlock[];
  removedBlocks: SessionDraftBlock[];
  modifiedBlocks: SessionDraftBlock[];
  addedBlocks: SessionDraftBlock[];
  exposureLimits: SessionExposureTag[];
  volumeReductionPercent?: number | null;
  intensityCap?: "NO_CAP" | "CAP_HIGH" | "CAP_MODERATE" | "CAP_LOW" | "RECOVERY_ONLY" | null;
  recoveryFocus?: string[];
  matchContext?: string[];
  explanationLines: string[];
  confidence: number;
  editable: boolean;
};

export type SessionBuildInput = {
  playerId?: string;
  playerName?: string;
  teamId?: string;
  date?: string;

  dayType?: "matchday" | "md+1" | "md+2" | "md-3" | "md-2" | "md-1" | "training" | "off" | null;
  weekDensity?: "low" | "normal" | "congested" | null;
  plannedSessionType?: "gym" | "field" | "match" | "recovery" | "mixed" | null;
  plannedSessionIntensity?: "low" | "moderate" | "high" | null;

  prescriptionDecision?: PrescriptionDecision | null;
  finalRecommendationDecision?: FinalRecommendationDecision | null;

  dataConfidence?: number | null;
  isProtectedPlayer?: boolean | null;
};

export type ExposureConstraints = {
  blockTagsToRemove: SessionExposureTag[];
  blockTagsToDowngrade: SessionExposureTag[];
  technicalOnly: boolean;
  recoveryOnly: boolean;
  reduceFieldMinutes: boolean;
  reduceGymIntensity: boolean;
};

export type TeamSessionBuildSummary = {
  totalBuilt: number;
  fullDrafts: number;
  modifiedDrafts: number;
  recoveryDrafts: number;
  holdDrafts: number;
  mostCommonExposureLimits: SessionExposureTag[];
  mostCommonRecoveryFocus: string[];
  summaryText: string;
};
