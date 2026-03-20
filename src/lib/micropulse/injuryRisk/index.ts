import { explainInjuryRiskDrivers, explainInjuryRiskRecommendations, explainInjuryRiskWhy } from "./explanations";
import { evaluateInjuryRiskRules } from "./rules";
import type { InjuryRiskDecision, InjuryRiskInput } from "./types";

export type { InjuryRiskDecision, InjuryRiskInput } from "./types";
export { runInjuryRiskValidationSuite } from "./validation";

export function buildInjuryRiskDecision(
  input: InjuryRiskInput,
  readinessDecision?: { athleteState: "GREEN" | "YELLOW" | "RED" | "GRAY" } | null
): InjuryRiskDecision {
  const rules = evaluateInjuryRiskRules(input, readinessDecision);
  return {
    injuryRiskLevel: rules.injuryRiskLevel,
    confidence: rules.confidence,
    riskScore: rules.riskScore,
    why: Array.from(new Set([...explainInjuryRiskWhy(rules.triggeredRules), ...(input.valdReasons ?? [])])).slice(0, 4),
    modifiableDrivers: explainInjuryRiskDrivers(rules.triggeredRules),
    recommendation: explainInjuryRiskRecommendations(rules.injuryRiskLevel),
    supportingMetrics: {
      acwr: input.acwr,
      zScore: input.zScore,
      deltaZ: input.deltaZ,
      volatility: input.volatility,
      recentYellowDays: input.recentYellowDays,
      recentRedDays: input.recentRedDays,
      highSpeedRunning: input.highSpeedRunning,
      maxVelocityPct: input.maxVelocityPct,
    },
    debug: {
      triggeredRules: rules.triggeredRules,
      missingInputs: rules.missingInputs,
    },
  };
}
