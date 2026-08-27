import type { MicroPulseFeatureKey, MicroPulsePlanKey } from "./types";

const FREE_FEATURES: MicroPulseFeatureKey[] = [
  "DAILY_CHECKIN",
  "BASIC_READINESS",
  "PLAYER_MONITORING",
  "TEAM_MONITORING",
];

const PRO_INCREMENTAL_FEATURES: MicroPulseFeatureKey[] = [
  "COACH_DASHBOARD",
  "SQUAD_OVERVIEW",
  "INTELLIGENCE_TAB",
  "LOAD_RPE_TAB",
  "GPS_LOAD_MONITORING",
  "MECHANICAL_LOAD_INDEX",
  "METABOLIC_LOAD_SCORE",
  "YESTERDAY_LOAD",
  "WEEK_SETUP",
  "ADAPTIVE_TRAINING_ENGINE",
  "NEURAL_FATIGUE_MODEL",
  "PLAYER_VOLATILITY",
  "EXPLAINABLE_DECISIONS",
  "SESSION_ADJUSTMENTS",
  "MATCH_WEEK_LOGIC",
  "TEAM_WORKFLOW",
  "VALD_CMJ_MONITORING",
];

const ELITE_INCREMENTAL_FEATURES: MicroPulseFeatureKey[] = [
  "PERFORMANCE_INTELLIGENCE",
  "INJURY_RISK_MODEL",
  "LOAD_FORECASTING",
  "NEURAL_VOLATILITY_INTELLIGENCE",
  "CROSS_TEAM_ANALYTICS",
  "ORG_DASHBOARDS",
  "EXECUTIVE_REPORTING",
  "MEDICAL_OVERSIGHT",
  "AUTOMATION_ALERTS",
  "ADVANCED_INTEGRATIONS",
  "MULTI_TEAM_MANAGEMENT",
  // Premium data-integration analytics — StatsBomb / Wyscout match + season +
  // opponent, per-player season analytics, and the deep VALD assessment suite
  // (RTP, ForceFrame benchmark bands, Load-Velocity profile). CMJ monitoring
  // stays LITE (VALD_CMJ_MONITORING) — only the deeper VALD is ELITE.
  "OPPOSITION_MATCH_ANALYTICS",
  "PLAYER_SEASON_ANALYTICS",
  "VALD_ASSESSMENT_SUITE",
];

// LITE = FREE + the subset of PRO that doesn't require Premium Catapult
// data (B2-3 efforts or IMU bands). Coach dashboard, RPE/load tabs, week
// setup, basic GPS load monitoring on standard Catapult Activity Reports
// — yes. Mechanical Load Index and Metabolic Load Score depend on B2-3
// efforts → these stay Pro-only and are filtered out of LITE_FEATURES.
const LITE_INCREMENTAL_FEATURES: MicroPulseFeatureKey[] = [
  "COACH_DASHBOARD",
  "SQUAD_OVERVIEW",
  "INTELLIGENCE_TAB",
  "LOAD_RPE_TAB",
  "GPS_LOAD_MONITORING",  // Volume-axis only on Lite (Gabbett 2016, Malone 2017)
  "YESTERDAY_LOAD",
  "WEEK_SETUP",
  "ADAPTIVE_TRAINING_ENGINE",
  "PLAYER_VOLATILITY",
  "EXPLAINABLE_DECISIONS",
  "SESSION_ADJUSTMENTS",
  "MATCH_WEEK_LOGIC",
  "TEAM_WORKFLOW",
  "VALD_CMJ_MONITORING",
];

const LITE_FEATURES: MicroPulseFeatureKey[] = [...FREE_FEATURES, ...LITE_INCREMENTAL_FEATURES];
const PRO_FEATURES: MicroPulseFeatureKey[] = [...FREE_FEATURES, ...PRO_INCREMENTAL_FEATURES];
const ELITE_FEATURES: MicroPulseFeatureKey[] = [...PRO_FEATURES, ...ELITE_INCREMENTAL_FEATURES];

/**
 * Centralized feature mapping by plan. Keep plan-feature logic here so UI and
 * services do not scatter hardcoded gating checks.
 */
export const PLAN_FEATURES: Record<MicroPulsePlanKey, MicroPulseFeatureKey[]> = {
  FREE: FREE_FEATURES,
  LITE: LITE_FEATURES,
  PRO: PRO_FEATURES,
  ELITE: ELITE_FEATURES,
};

export const FEATURE_MIN_PLAN: Record<MicroPulseFeatureKey, MicroPulsePlanKey> = {
  DAILY_CHECKIN: "FREE",
  BASIC_READINESS: "FREE",
  PLAYER_MONITORING: "FREE",
  TEAM_MONITORING: "FREE",
  // Lite-tier minimum — works on standard Catapult plans + RPE / wellness
  COACH_DASHBOARD: "LITE",
  ADAPTIVE_TRAINING_ENGINE: "LITE",
  PLAYER_VOLATILITY: "LITE",
  EXPLAINABLE_DECISIONS: "LITE",
  SESSION_ADJUSTMENTS: "LITE",
  MATCH_WEEK_LOGIC: "LITE",
  TEAM_WORKFLOW: "LITE",
  GPS_LOAD_MONITORING: "LITE",
  YESTERDAY_LOAD: "LITE",
  SQUAD_OVERVIEW: "LITE",
  INTELLIGENCE_TAB: "LITE",
  LOAD_RPE_TAB: "LITE",
  WEEK_SETUP: "LITE",
  VALD_CMJ_MONITORING: "LITE",
  // Pro-only — requires Premium Catapult (B2-3 efforts + IMU bands)
  NEURAL_FATIGUE_MODEL: "PRO",
  MECHANICAL_LOAD_INDEX: "PRO",
  METABOLIC_LOAD_SCORE: "PRO",
  PERFORMANCE_INTELLIGENCE: "ELITE",
  INJURY_RISK_MODEL: "ELITE",
  LOAD_FORECASTING: "ELITE",
  NEURAL_VOLATILITY_INTELLIGENCE: "ELITE",
  CROSS_TEAM_ANALYTICS: "ELITE",
  ORG_DASHBOARDS: "ELITE",
  EXECUTIVE_REPORTING: "ELITE",
  MEDICAL_OVERSIGHT: "ELITE",
  AUTOMATION_ALERTS: "ELITE",
  ADVANCED_INTEGRATIONS: "ELITE",
  MULTI_TEAM_MANAGEMENT: "ELITE",
  OPPOSITION_MATCH_ANALYTICS: "ELITE",
  PLAYER_SEASON_ANALYTICS: "ELITE",
  VALD_ASSESSMENT_SUITE: "ELITE",
};
