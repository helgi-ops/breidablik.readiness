import { mapLightAteReasonCodeToLabel } from "./explain";
import type { LightAteDecisionResult, LightAteMdContext } from "./types";

export interface MicrodoseAteDecisionContract {
  templateId: string;
  templateLabel: string;
  athleteState: "GREEN_PLUS" | "GREEN" | "YELLOW" | "RED";
  mdContext: "MD5" | "MD4" | "MD3" | "MD2" | "MD1" | "MD_PLUS_1" | "OFF" | "UNKNOWN";
  modifiers: {
    velocityLossCap?: number | null;
    reduceSetsBy?: number;
    extendRestSeconds?: number;
    disableContrast?: boolean;
    replaceBallisticPrimer?: boolean;
  };
  reasons: string[];
  riskFlags: string[];
  sessionSummary: {
    intent: string;
    reduced: boolean;
    protectedFreshness: boolean;
  };
}

export function mapTemplateIdToTemplateLabel(templateId: string): string {
  if (templateId === "md4_force_contrast") return "MD4 Force Contrast";
  if (templateId === "md3_lower_force") return "MD3 Lower Force";
  if (templateId === "md2_power_primer") return "MD2 Power Primer";
  if (templateId === "md1_neural_primer") return "MD1 Neural Primer";
  if (templateId === "red_reset_session") return "Reset / Recovery Session";
  return "MD2 Power Primer";
}

export function buildMicrodoseAteDecisionContract(args: {
  lightAteDecision: LightAteDecisionResult;
  templateLabel?: string | null;
  mdContext: LightAteMdContext;
  sessionIntent?: string | null;
}): MicrodoseAteDecisionContract {
  const { lightAteDecision, mdContext } = args;
  const templateLabel = args.templateLabel?.trim() || mapTemplateIdToTemplateLabel(lightAteDecision.templateId);
  const reasons = lightAteDecision.reasons.map(mapLightAteReasonCodeToLabel);
  const reduced =
    lightAteDecision.athleteState === "YELLOW" ||
    lightAteDecision.athleteState === "RED" ||
    !!(lightAteDecision.modifiers.reduceSetsBy && lightAteDecision.modifiers.reduceSetsBy > 0);
  const protectedFreshness =
    mdContext === "MD2" ||
    mdContext === "MD1" ||
    mdContext === "MD_PLUS_1" ||
    (typeof lightAteDecision.modifiers.velocityLossCap === "number" && lightAteDecision.modifiers.velocityLossCap <= 0.1);

  return {
    templateId: lightAteDecision.templateId,
    templateLabel,
    athleteState: lightAteDecision.athleteState,
    mdContext,
    modifiers: {
      velocityLossCap: lightAteDecision.modifiers.velocityLossCap ?? null,
      reduceSetsBy: lightAteDecision.modifiers.reduceSetsBy,
      extendRestSeconds: lightAteDecision.modifiers.extendRestSeconds,
      disableContrast: lightAteDecision.modifiers.disableContrast,
      replaceBallisticPrimer: lightAteDecision.modifiers.replaceBallisticPrimer,
    },
    reasons,
    riskFlags: [...lightAteDecision.riskFlags],
    sessionSummary: {
      intent: args.sessionIntent?.trim() || "SESSION",
      reduced,
      protectedFreshness,
    },
  };
}
