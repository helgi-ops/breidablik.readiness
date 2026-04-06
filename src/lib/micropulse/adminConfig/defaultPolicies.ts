import type { MatchdayTemplateConfig, TeamPolicyConfig } from "./types";

export const DEFAULT_TEAM_POLICY_CONFIG: TeamPolicyConfig = {
  mdMinus1ProtectionBias: "NORMAL",
  mdPlus1RecoveryBias: "NORMAL",
  congestedWeekProtectionBias: "NORMAL",
  protectedPlayerBias: "NORMAL",
  allowAggressiveExposureInPeakWindow: false,
  requireCoachReviewForProtectedFull: true,
  defaultMaxSpeedPolicy: "CAUTIOUS",
  defaultDecelPolicy: "CAUTIOUS",
  defaultGymIntensityPolicy: "NORMAL",
  overrideReasonRequired: true,
};

export const DEFAULT_MATCHDAY_TEMPLATE_CONFIGS: MatchdayTemplateConfig[] = [
  { dayType: "matchday", defaultActionBias: "NONE", defaultIntensityBias: "NONE", protectHighRiskPlayers: true, protectProtectedPlayers: true, notes: "Keep exposure role-specific." },
  { dayType: "md+1", defaultActionBias: "RECOVERY", defaultIntensityBias: "CAP_LOW", protectHighRiskPlayers: true, protectProtectedPlayers: true, notes: "Restore after match." },
  { dayType: "md+2", defaultActionBias: "MODIFIED", defaultIntensityBias: "CAP_MODERATE", protectHighRiskPlayers: true, protectProtectedPlayers: true, notes: "Rebuild with controlled density." },
  { dayType: "md-3", defaultActionBias: "NONE", defaultIntensityBias: "NONE", protectHighRiskPlayers: true, protectProtectedPlayers: false, notes: "Main adaptation opportunity." },
  { dayType: "md-2", defaultActionBias: "MODIFIED", defaultIntensityBias: "CAP_HIGH", protectHighRiskPlayers: true, protectProtectedPlayers: true, notes: "Sharpness with controlled exposure." },
  { dayType: "md-1", defaultActionBias: "MODIFIED", defaultIntensityBias: "CAP_MODERATE", protectHighRiskPlayers: true, protectProtectedPlayers: true, notes: "Protect freshness before match." },
  { dayType: "training", defaultActionBias: "NONE", defaultIntensityBias: "NONE", protectHighRiskPlayers: true, protectProtectedPlayers: false, notes: "Use normal training logic." },
  { dayType: "off", defaultActionBias: "RECOVERY", defaultIntensityBias: "RECOVERY_ONLY", protectHighRiskPlayers: true, protectProtectedPlayers: true, notes: "No loading target." },
];
