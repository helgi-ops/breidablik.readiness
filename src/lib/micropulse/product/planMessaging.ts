import { FEATURE_MIN_PLAN } from "./features";
import { getPlanDefinition } from "./plans";
import type { MicroPulseFeatureKey, MicroPulsePlanKey } from "./types";

const FEATURE_LABELS: Record<MicroPulseFeatureKey, string> = {
  DAILY_CHECKIN: "Daily player check-in",
  BASIC_READINESS: "Basic readiness score",
  PLAYER_MONITORING: "Player monitoring",
  TEAM_MONITORING: "Team monitoring",
  COACH_DASHBOARD: "Coach dashboard",
  ADAPTIVE_TRAINING_ENGINE: "Adaptive Training Engine",
  NEURAL_FATIGUE_MODEL: "Neural Fatigue Model",
  PLAYER_VOLATILITY: "Player volatility tracking",
  EXPLAINABLE_DECISIONS: "Explainable decision support",
  SESSION_ADJUSTMENTS: "Session adjustment suggestions",
  MATCH_WEEK_LOGIC: "Match-week context logic",
  TEAM_WORKFLOW: "Team workflow tools",
  PERFORMANCE_INTELLIGENCE: "Performance Intelligence platform",
  INJURY_RISK_MODEL: "Injury risk modelling",
  LOAD_FORECASTING: "Load forecasting",
  NEURAL_VOLATILITY_INTELLIGENCE: "Neural + volatility intelligence",
  CROSS_TEAM_ANALYTICS: "Cross-team analytics",
  ORG_DASHBOARDS: "Organization dashboards",
  EXECUTIVE_REPORTING: "Executive reporting",
  MEDICAL_OVERSIGHT: "Medical + performance oversight",
  AUTOMATION_ALERTS: "Automation and smart alerts",
  ADVANCED_INTEGRATIONS: "Advanced integrations",
  MULTI_TEAM_MANAGEMENT: "Multi-team management",
};

const MARKETING_FEATURES: Record<MicroPulsePlanKey, MicroPulseFeatureKey[]> = {
  FREE: ["DAILY_CHECKIN", "BASIC_READINESS", "PLAYER_MONITORING", "TEAM_MONITORING"],
  PRO: [
    "ADAPTIVE_TRAINING_ENGINE",
    "NEURAL_FATIGUE_MODEL",
    "EXPLAINABLE_DECISIONS",
    "SESSION_ADJUSTMENTS",
    "PLAYER_VOLATILITY",
    "MATCH_WEEK_LOGIC",
    "TEAM_WORKFLOW",
  ],
  ELITE: [
    "PERFORMANCE_INTELLIGENCE",
    "INJURY_RISK_MODEL",
    "LOAD_FORECASTING",
    "NEURAL_VOLATILITY_INTELLIGENCE",
    "CROSS_TEAM_ANALYTICS",
    "ORG_DASHBOARDS",
    "EXECUTIVE_REPORTING",
    "AUTOMATION_ALERTS",
    "ADVANCED_INTEGRATIONS",
    "MULTI_TEAM_MANAGEMENT",
  ],
};

export function getFeatureLabel(feature: MicroPulseFeatureKey): string {
  return FEATURE_LABELS[feature];
}

export function getPlanSummary(plan: MicroPulsePlanKey): string {
  return getPlanDefinition(plan).summary;
}

export function getPlanAudience(plan: MicroPulsePlanKey): string[] {
  return getPlanDefinition(plan).targetAudience;
}

export function getPlanMarketingFeatureLabels(plan: MicroPulsePlanKey): string[] {
  return MARKETING_FEATURES[plan].map(getFeatureLabel);
}

export function getUpgradeMessageForFeature(feature: MicroPulseFeatureKey): string {
  const requiredPlan = FEATURE_MIN_PLAN[feature];
  if (requiredPlan === "FREE") return "This feature is included on all plans.";
  if (requiredPlan === "PRO") return "This feature is available on Pro and Elite plans.";
  return "Organization-level capabilities like this are available on Elite.";
}
