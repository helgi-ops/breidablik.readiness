import type {
  CoachRule,
  FinalRecommendationDecision,
  RuleConditionOperator,
  RuleScope,
  RuleSeverity,
} from "@/lib/micropulse/rulesEngine";

export type EditableRuleCondition = {
  field: string;
  operator: RuleConditionOperator;
  value?: string | number | boolean | string[] | number[] | null;
};

export type EditableRuleEffect = {
  type: string;
  value?: unknown;
};

export type EditableRuleForm = {
  id?: string;
  name: string;
  description?: string;
  scope: RuleScope;
  severity: RuleSeverity;
  enabled: boolean;
  priority: number;
  conditions: EditableRuleCondition[];
  effects: EditableRuleEffect[];
  appliesToPlayerIds?: string[];
  appliesToTeamIds?: string[];
  appliesToTags?: string[];
};

export type ProtectedPlayerConfig = {
  playerId: string;
  playerName?: string;
  enabled: boolean;
  tags: string[];
  notes?: string;
  protectedReason?: string | null;
  exposureBias?: "NONE" | "LIGHT" | "MODERATE" | "HIGH";
  reviewRequiredForFull?: boolean;
  maxActionAllowed?: "FULL" | "MODIFIED" | "RECOVERY" | "HOLD" | null;
};

export type TeamPolicyConfig = {
  mdMinus1ProtectionBias: "LOW" | "NORMAL" | "HIGH";
  mdPlus1RecoveryBias: "LOW" | "NORMAL" | "HIGH";
  congestedWeekProtectionBias: "LOW" | "NORMAL" | "HIGH";
  protectedPlayerBias: "LOW" | "NORMAL" | "HIGH";
  allowAggressiveExposureInPeakWindow: boolean;
  requireCoachReviewForProtectedFull: boolean;
  defaultMaxSpeedPolicy: "NORMAL" | "CAUTIOUS";
  defaultDecelPolicy: "NORMAL" | "CAUTIOUS";
  defaultGymIntensityPolicy: "NORMAL" | "CAUTIOUS";
  overrideReasonRequired: boolean;
};

export type MatchdayTemplateConfig = {
  dayType: "matchday" | "md+1" | "md+2" | "md-3" | "md-2" | "md-1" | "training" | "off";
  defaultActionBias: "FULL" | "MODIFIED" | "RECOVERY" | "NONE";
  defaultIntensityBias: "NO_CAP" | "CAP_HIGH" | "CAP_MODERATE" | "CAP_LOW" | "RECOVERY_ONLY" | "NONE";
  protectHighRiskPlayers: boolean;
  protectProtectedPlayers: boolean;
  notes?: string;
};

export type RecommendationAuditView = {
  playerId?: string;
  playerName?: string;
  date?: string;
  engineRecommendation: FinalRecommendationDecision["engineRecommendation"];
  finalRecommendation: FinalRecommendationDecision["finalRecommendation"];
  appliedRules: FinalRecommendationDecision["appliedRules"];
  manualOverride?: FinalRecommendationDecision["manualOverride"];
  requiresCoachReview: boolean;
  overrideSummary: string;
};

export type OverrideHistoryItem = {
  id: string;
  playerId?: string;
  playerName?: string;
  timestamp: string;
  overriddenBy?: string | null;
  reason?: string | null;
  engineAction: string;
  finalAction: string;
  summary: string;
};

export type AdminSystemSummary = {
  activeRuleCount: number;
  protectedPlayerCount: number;
  reviewRequiredCount: number;
  overridesTodayCount: number;
  overridesThisWeekCount: number;
  summaryText: string;
};

export type AdminConfigSnapshot = {
  rules: CoachRule[];
  protectedPlayers: ProtectedPlayerConfig[];
  teamPolicy: TeamPolicyConfig;
  matchdayTemplates: MatchdayTemplateConfig[];
  overrideHistory: OverrideHistoryItem[];
};
