import type { CoachRule, RuleEffect } from "@/lib/micropulse/rulesEngine";
import type { MatchdayTemplateConfig, ProtectedPlayerConfig, TeamPolicyConfig } from "./types";

/** Build deterministic team-policy-derived rules. */
export function buildRulesFromTeamPolicy(policy: TeamPolicyConfig): CoachRule[] {
  const rules: CoachRule[] = [];

  if (policy.mdMinus1ProtectionBias === "HIGH") {
    rules.push({
      id: "policy-md1-high-protection",
      name: "MD-1 high protection bias",
      scope: "MATCH_CONTEXT",
      severity: "SOFT",
      enabled: true,
      priority: 84,
      conditions: [{ field: "dayType", operator: "EQ", value: "md-1" }],
      effects: [
        { type: "capRecommendationSeverity", value: "MODIFIED" },
        { type: "addMatchContext", value: "PROTECT_FOR_MATCH" },
      ],
    });
  }

  if (policy.mdPlus1RecoveryBias !== "LOW") {
    rules.push({
      id: "policy-mdplus1-recovery-bias",
      name: "MD+1 recovery bias",
      scope: "MATCH_CONTEXT",
      severity: policy.mdPlus1RecoveryBias === "HIGH" ? "HARD" : "SOFT",
      enabled: true,
      priority: 72,
      conditions: [{ field: "dayType", operator: "EQ", value: "md+1" }],
      effects:
        policy.mdPlus1RecoveryBias === "HIGH"
          ? [{ type: "setAction", value: "RECOVERY" }, { type: "setIntensityCap", value: "CAP_LOW" }]
          : [{ type: "capRecommendationSeverity", value: "MODIFIED" }],
    });
  }

  if (policy.congestedWeekProtectionBias === "HIGH") {
    rules.push({
      id: "policy-congested-week-caution",
      name: "Congested week caution",
      scope: "TEAM",
      severity: "SOFT",
      enabled: true,
      priority: 70,
      conditions: [{ field: "weekDensity", operator: "EQ", value: "congested" }],
      effects: [
        { type: "addExposureGuidance", value: ["LIMIT_MAX_SPEED", "LIMIT_DECELS"] },
        { type: "setVolumeAdjustment", value: "REDUCE_20" },
      ],
    });
  }

  if (policy.defaultMaxSpeedPolicy === "CAUTIOUS") {
    rules.push({
      id: "policy-default-maxspeed-cautious",
      name: "Cautious max-speed policy",
      scope: "TEAM",
      severity: "INFO",
      enabled: true,
      priority: 40,
      conditions: [{ field: "action", operator: "IN", value: ["FULL", "MODIFIED"] }],
      effects: [{ type: "addExposureGuidance", value: "LIMIT_MAX_SPEED" }],
    });
  }

  if (policy.requireCoachReviewForProtectedFull) {
    rules.push({
      id: "policy-protected-full-review",
      name: "Protected full action requires review",
      scope: "PROTECTED_PLAYER",
      severity: "HARD",
      enabled: true,
      priority: 88,
      conditions: [
        { field: "isProtectedPlayer", operator: "TRUE" },
        { field: "action", operator: "EQ", value: "FULL" },
      ],
      effects: [{ type: "requireCoachReview", value: true }],
    });
  }

  return rules;
}

/** Build protected-player-specific rules from admin config. */
export function buildRulesFromProtectedPlayerConfig(config: ProtectedPlayerConfig): CoachRule[] {
  if (!config.enabled) return [];
  const rules: CoachRule[] = [];

  if (config.maxActionAllowed && config.maxActionAllowed !== "FULL") {
    rules.push({
      id: `protected-max-action-${config.playerId}`,
      name: `Protected action cap: ${config.playerName ?? config.playerId}`,
      scope: "PLAYER",
      severity: "HARD",
      enabled: true,
      priority: 93,
      conditions: [{ field: "playerTag", operator: "CONTAINS", value: "protected" }],
      effects: [{ type: "capRecommendationSeverity", value: config.maxActionAllowed }],
      appliesToPlayerIds: [config.playerId],
      appliesToTags: ["protected"],
    });
  }

  if (config.reviewRequiredForFull) {
    rules.push({
      id: `protected-full-review-${config.playerId}`,
      name: `Protected review required: ${config.playerName ?? config.playerId}`,
      scope: "PLAYER",
      severity: "HARD",
      enabled: true,
      priority: 92,
      conditions: [{ field: "action", operator: "EQ", value: "FULL" }],
      effects: [{ type: "requireCoachReview", value: true }],
      appliesToPlayerIds: [config.playerId],
      appliesToTags: ["protected"],
    });
  }

  if (config.exposureBias && config.exposureBias !== "NONE") {
    const guidance = config.exposureBias === "HIGH" ? ["LIMIT_MAX_SPEED", "LIMIT_DECELS", "LIMIT_FIELD_MINUTES"] : ["LIMIT_MAX_SPEED"];
    rules.push({
      id: `protected-exposure-${config.playerId}`,
      name: `Protected exposure bias: ${config.playerName ?? config.playerId}`,
      scope: "PLAYER",
      severity: config.exposureBias === "HIGH" ? "HARD" : "SOFT",
      enabled: true,
      priority: 75,
      conditions: [{ field: "playerTag", operator: "CONTAINS", value: "protected" }],
      effects: [{ type: "addExposureGuidance", value: guidance }],
      appliesToPlayerIds: [config.playerId],
      appliesToTags: ["protected"],
    });
  }

  return rules;
}

/** Build matchday template rules from admin configs. */
export function buildRulesFromMatchdayTemplate(template: MatchdayTemplateConfig): CoachRule[] {
  const effects: RuleEffect[] = [];
  if (template.defaultActionBias !== "NONE") effects.push({ type: "setAction", value: template.defaultActionBias });
  if (template.defaultIntensityBias !== "NONE") effects.push({ type: "setIntensityCap", value: template.defaultIntensityBias });
  if (template.protectHighRiskPlayers) {
    effects.push({ type: "addMatchContext", value: "PROTECT_FOR_MATCH" });
  }
  if (template.protectProtectedPlayers) {
    effects.push({ type: "forceProtectedMode" });
  }

  if (!effects.length) return [];

  return [
    {
      id: `template-${template.dayType}`,
      name: `Matchday template: ${template.dayType}`,
      description: template.notes,
      scope: "MATCH_CONTEXT",
      severity: "SOFT",
      enabled: true,
      priority: 55,
      conditions: [{ field: "dayType", operator: "EQ", value: template.dayType }],
      effects,
    },
  ];
}
