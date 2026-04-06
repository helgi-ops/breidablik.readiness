import type { CoachRule } from "./types";

/**
 * Baseline safety and policy guardrails shipped by default.
 */
export const DEFAULT_COACH_RULES: CoachRule[] = [
  {
    id: "default-collapse-critical-no-full",
    name: "Critical collapse risk cannot remain FULL",
    scope: "GLOBAL",
    severity: "HARD",
    enabled: true,
    priority: 100,
    conditions: [{ field: "collapseRiskBand", operator: "EQ", value: "CRITICAL" }],
    effects: [
      { type: "capRecommendationSeverity", value: "RECOVERY" },
      { type: "setIntensityCap", value: "RECOVERY_ONLY" },
      { type: "setVolumeAdjustment", value: "REDUCE_50" },
      { type: "addExposureGuidance", value: "RECOVERY_MODALITIES" },
    ],
  },
  {
    id: "default-load-recovery-only-cap",
    name: "Recovery-only tolerance enforces cap",
    scope: "GLOBAL",
    severity: "HARD",
    enabled: true,
    priority: 95,
    conditions: [{ field: "loadToleranceBand", operator: "EQ", value: "RECOVERY_ONLY" }],
    effects: [
      { type: "capRecommendationSeverity", value: "RECOVERY" },
      { type: "setIntensityCap", value: "RECOVERY_ONLY" },
      { type: "setVolumeAdjustment", value: "REDUCE_30" },
    ],
  },
  {
    id: "default-red-state-floor",
    name: "Red athlete state floor",
    scope: "GLOBAL",
    severity: "SOFT",
    enabled: true,
    priority: 82,
    conditions: [{ field: "athleteState", operator: "EQ", value: "RED" }],
    effects: [
      { type: "capRecommendationSeverity", value: "RECOVERY" },
      { type: "addRecoveryFocus", value: "LOW_INTENSITY_AEROBIC" },
      { type: "addExposureGuidance", value: "LIMIT_PLYOS" },
    ],
  },
  {
    id: "default-md1-unstable-protect",
    name: "MD-1 instability protection",
    scope: "MATCH_CONTEXT",
    severity: "SOFT",
    enabled: true,
    priority: 76,
    conditions: [
      { field: "dayType", operator: "EQ", value: "md-1" },
      { field: "instabilityWindowBand", operator: "EQ", value: "HIGHLY_UNSTABLE" },
    ],
    effects: [
      { type: "addMatchContext", value: "PROTECT_FOR_MATCH" },
      { type: "addExposureGuidance", value: "LIMIT_FIELD_MINUTES" },
      { type: "addExposureGuidance", value: "LIMIT_MAX_SPEED" },
      { type: "setAction", value: "MODIFIED" },
    ],
  },
  {
    id: "default-protected-high-risk-review",
    name: "Protected player review on high risk",
    scope: "PROTECTED_PLAYER",
    severity: "HARD",
    enabled: true,
    priority: 90,
    conditions: [
      { field: "isProtectedPlayer", operator: "TRUE" },
      { field: "injuryRiskBand", operator: "IN", value: ["HIGH", "CRITICAL"] },
      { field: "action", operator: "EQ", value: "FULL" },
    ],
    effects: [
      { type: "setAction", value: "MODIFIED" },
      { type: "requireCoachReview", value: true },
      { type: "addExposureGuidance", value: "LIMIT_MAX_SPEED" },
      { type: "addMatchContext", value: "PROTECT_FOR_MATCH" },
    ],
  },
];
