import type { PrescriptionDecision, TrainingAction } from "@/lib/micropulse/prescriptionEngine";
export type { PrescriptionDecision, TrainingAction } from "@/lib/micropulse/prescriptionEngine";

export type RuleScope = "GLOBAL" | "ORGANIZATION" | "TEAM" | "PLAYER" | "MATCH_CONTEXT" | "PROTECTED_PLAYER";
export type RuleSeverity = "INFO" | "SOFT" | "HARD";

export type RuleConditionOperator =
  | "EQ"
  | "NEQ"
  | "GT"
  | "GTE"
  | "LT"
  | "LTE"
  | "IN"
  | "NOT_IN"
  | "CONTAINS"
  | "TRUE"
  | "FALSE";

export type RuleFieldKey =
  | "readinessState"
  | "athleteState"
  | "sessionMode"
  | "injuryRiskBand"
  | "injuryRiskScore"
  | "performanceBand"
  | "loadToleranceBand"
  | "fatigueAccumulationBand"
  | "instabilityWindowBand"
  | "collapseRiskBand"
  | "peakWindowBand"
  | "trendDirection"
  | "action"
  | "modificationLevel"
  | "intensityCap"
  | "volumeAdjustment"
  | "dayType"
  | "weekDensity"
  | "upcomingMatchInDays"
  | "plannedSessionType"
  | "plannedSessionIntensity"
  | "playerTag"
  | "isProtectedPlayer"
  | "dataConfidence";

export type RuleCondition = {
  field: RuleFieldKey;
  operator: RuleConditionOperator;
  value?: string | number | boolean | string[] | number[] | null;
};

export type RuleEffect = {
  type:
    | "setAction"
    | "setModificationLevel"
    | "setIntensityCap"
    | "setVolumeAdjustment"
    | "addExposureGuidance"
    | "removeExposureGuidance"
    | "addRecoveryFocus"
    | "removeRecoveryFocus"
    | "addMatchContext"
    | "removeMatchContext"
    | "addTag"
    | "forceProtectedMode"
    | "requireCoachReview"
    | "capRecommendationSeverity"
    | "raiseRecommendationSeverity"
    | "setNote";
  value?: unknown;
};

export type CoachRule = {
  id: string;
  name: string;
  description?: string;
  scope: RuleScope;
  severity: RuleSeverity;
  enabled: boolean;
  priority: number;
  conditions: RuleCondition[];
  effects: RuleEffect[];
  appliesToPlayerIds?: string[];
  appliesToTeamIds?: string[];
  appliesToTags?: string[];
  createdBy?: string | null;
  updatedAt?: string | null;
};

export type ManualOverrideDecision = {
  applied: boolean;
  overriddenBy?: string | null;
  reason?: string | null;
  originalAction?: TrainingAction | null;
  finalAction?: TrainingAction | null;
  originalInstruction?: string | null;
  finalInstruction?: string | null;
  timestamp?: string | null;
};

export type RulesEngineInput = {
  playerId?: string;
  playerName?: string;
  teamId?: string;
  organizationId?: string;
  dayType?: "matchday" | "md+1" | "md+2" | "md-3" | "md-2" | "md-1" | "training" | "off" | null;
  weekDensity?: "low" | "normal" | "congested" | null;
  playerTags?: string[];
  isProtectedPlayer?: boolean | null;
  readinessState?: "GREEN" | "YELLOW" | "RED" | "GRAY" | null;
  athleteState?: "GREEN" | "YELLOW" | "RED" | "GRAY" | null;
  injuryRiskBand?: "LOW" | "MODERATE" | "HIGH" | "CRITICAL" | null;
  injuryRiskScore?: number | null;
  performanceBand?: "PEAK" | "READY" | "MANAGEABLE" | "FATIGUED" | "AT_RISK" | null;
  loadToleranceBand?: "TOLERATES_HIGH" | "TOLERATES_MODERATE" | "TOLERATES_LOW" | "RECOVERY_ONLY" | null;
  fatigueAccumulationBand?: "LOW" | "BUILDING" | "ELEVATED" | "HEAVY" | null;
  instabilityWindowBand?: "STABLE" | "WATCH" | "UNSTABLE" | "HIGHLY_UNSTABLE" | null;
  collapseRiskBand?: "LOW" | "WATCH" | "HIGH" | "CRITICAL" | null;
  peakWindowBand?: "NOT_READY" | "APPROACHING" | "OPEN" | "PEAK" | null;
  trendDirection?: "IMPROVING" | "STABLE" | "WORSENING" | "SHARPLY_WORSENING" | null;
  prescriptionDecision?: PrescriptionDecision | null;
  dataConfidence?: number | null;
  plannedSessionType?: "gym" | "field" | "match" | "recovery" | "mixed" | null;
  plannedSessionIntensity?: "low" | "moderate" | "high" | null;
  sessionMode?: "full" | "modified" | "recovery" | "pending" | null;
};

export type AppliedRuleResult = {
  ruleId: string;
  ruleName: string;
  scope: RuleScope;
  severity: RuleSeverity;
  effectsApplied: string[];
  explanation: string;
};

export type FinalRecommendationDecision = {
  engineRecommendation: PrescriptionDecision;
  finalRecommendation: PrescriptionDecision;
  appliedRules: AppliedRuleResult[];
  manualOverride?: ManualOverrideDecision | null;
  requiresCoachReview: boolean;
  wasModifiedByRules: boolean;
  overrideSummary: string;
  confidence: number;
};

export type TeamRulesSummary = {
  overriddenPlayersCount: number;
  reviewRequiredCount: number;
  protectedPlayersCount: number;
  rulesTriggeredCount: number;
  summaryText: string;
  playerSummaries: Array<{
    playerId?: string;
    playerName?: string;
    finalAction: TrainingAction;
    modified: boolean;
    reviewRequired: boolean;
    appliedRuleCount: number;
  }>;
};
