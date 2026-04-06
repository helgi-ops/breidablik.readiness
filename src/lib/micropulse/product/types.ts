export type MicroPulsePlanKey = "FREE" | "PRO" | "ELITE";

export type MicroPulseFeatureKey =
  | "DAILY_CHECKIN"
  | "BASIC_READINESS"
  | "PLAYER_MONITORING"
  | "TEAM_MONITORING"
  | "COACH_DASHBOARD"
  | "ADAPTIVE_TRAINING_ENGINE"
  | "NEURAL_FATIGUE_MODEL"
  | "PLAYER_VOLATILITY"
  | "EXPLAINABLE_DECISIONS"
  | "SESSION_ADJUSTMENTS"
  | "MATCH_WEEK_LOGIC"
  | "TEAM_WORKFLOW"
  | "GPS_LOAD_MONITORING"
  | "MECHANICAL_LOAD_INDEX"
  | "METABOLIC_LOAD_SCORE"
  | "YESTERDAY_LOAD"
  | "SQUAD_OVERVIEW"
  | "INTELLIGENCE_TAB"
  | "LOAD_RPE_TAB"
  | "WEEK_SETUP"
  | "VALD_CMJ_MONITORING"
  | "PERFORMANCE_INTELLIGENCE"
  | "INJURY_RISK_MODEL"
  | "LOAD_FORECASTING"
  | "NEURAL_VOLATILITY_INTELLIGENCE"
  | "CROSS_TEAM_ANALYTICS"
  | "ORG_DASHBOARDS"
  | "EXECUTIVE_REPORTING"
  | "MEDICAL_OVERSIGHT"
  | "AUTOMATION_ALERTS"
  | "ADVANCED_INTEGRATIONS"
  | "MULTI_TEAM_MANAGEMENT";

export type ProductIdentity = {
  name: string;
  shortTagline: string;
  longDescription: string;
  category: string;
  positioningSummary: string;
  primaryAudience: string[];
  coreValuePoints: string[];
};

export type PlanDefinition = {
  key: MicroPulsePlanKey;
  displayName: string;
  monthlyPriceLabel: string;
  annualPriceLabel?: string | null;
  targetAudience: string[];
  summary: string;
  featureKeys: MicroPulseFeatureKey[];
  sortOrder: number;
  highlighted?: boolean;
};

export type OrganizationPlanAssignment = {
  organizationId?: string | null;
  teamId?: string | null;
  activePlan: MicroPulsePlanKey;
  status?: "ACTIVE" | "TRIAL" | "PAST_DUE" | "INACTIVE" | null;
  assignedAt?: string | null;
  expiresAt?: string | null;
};
