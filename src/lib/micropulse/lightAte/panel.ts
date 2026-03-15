import type { MicrodoseAteDecisionContract } from "./contract";

export interface AteDecisionPanelViewModel {
  title: string;
  sessionLabel: string;
  athleteStateLabel: string;
  mdContextLabel: string;
  adjustmentLines: string[];
  reasonLines: string[];
  riskFlagLines: string[];
  sourceLabel?: string | null;
}

function stateLabel(state: MicrodoseAteDecisionContract["athleteState"]): string {
  if (state === "GREEN_PLUS") return "Green+";
  if (state === "GREEN") return "Green";
  if (state === "YELLOW") return "Yellow";
  return "Red";
}

function mdLabel(mdContext: MicrodoseAteDecisionContract["mdContext"]): string {
  if (mdContext === "MD_PLUS_1") return "MD+1";
  if (mdContext === "OFF") return "OFF";
  if (mdContext === "UNKNOWN") return "Unknown";
  return mdContext.replace("MD", "MD-");
}

function buildAdjustmentLines(contract: MicrodoseAteDecisionContract): string[] {
  const lines: string[] = [];
  const m = contract.modifiers;

  if (typeof m.velocityLossCap === "number") {
    lines.push(`Velocity loss capped at ${Math.round(m.velocityLossCap * 100)}%.`);
  }
  if (typeof m.reduceSetsBy === "number" && m.reduceSetsBy > 0) {
    lines.push(`Volume reduced by ${m.reduceSetsBy} set${m.reduceSetsBy > 1 ? "s" : ""}.`);
  }
  if (typeof m.extendRestSeconds === "number" && m.extendRestSeconds > 0) {
    lines.push(`Rest extended by ${m.extendRestSeconds} sec.`);
  }
  if (m.disableContrast) {
    lines.push("Contrast disabled.");
  }
  if (m.replaceBallisticPrimer) {
    lines.push("Ballistic primer replaced.");
  }

  return lines;
}

function buildWhyLines(contract: MicrodoseAteDecisionContract): string[] {
  const lines: string[] = [];
  const reasons = contract.reasons.map((r) => r.toLowerCase());

  if (contract.athleteState === "RED") {
    if (reasons.some((r) => r.includes("very high neural fatigue") || r.includes("high neural fatigue"))) {
      return ["Neural protection override triggered."];
    }
    if (reasons.some((r) => r.includes("very low readiness") || r.includes("low readiness"))) {
      return ["Recovery emphasis selected due to low readiness."];
    }
    if (reasons.some((r) => r.includes("high yesterday load"))) {
      return ["Recovery emphasis selected due to load risk."];
    }
    return ["Recovery emphasis selected due to protective criteria."];
  }

  if (reasons.some((r) => r.includes("very low readiness"))) {
    lines.push("Very low readiness.");
  } else if (reasons.some((r) => r.includes("low readiness"))) {
    lines.push("Low readiness.");
  }

  if (reasons.some((r) => r.includes("very high neural fatigue"))) {
    lines.push("Very high neural fatigue.");
  } else if (reasons.some((r) => r.includes("high neural fatigue"))) {
    lines.push("High neural fatigue.");
  }

  if (reasons.some((r) => r.includes("high yesterday load"))) {
    lines.push("High yesterday load.");
  }

  if (contract.athleteState === "YELLOW") {
    lines.push("Reduced state selected for today.");
  }

  return lines;
}

function mapRiskFlagToLabel(flag: string): string | null {
  if (flag === "VERY_HIGH_NEURAL_FATIGUE") return "Very high neural fatigue risk.";
  if (flag === "HIGH_NEURAL_FATIGUE") return "High neural fatigue risk.";
  if (flag === "HIGH_YESTERDAY_LOAD") return "High yesterday load risk.";
  return null;
}

export function buildAteDecisionPanelViewModel(
  contract: MicrodoseAteDecisionContract
): AteDecisionPanelViewModel {
  return {
    title: "ATE Session Decision",
    sessionLabel: contract.templateLabel,
    athleteStateLabel: stateLabel(contract.athleteState),
    mdContextLabel: mdLabel(contract.mdContext),
    adjustmentLines: buildAdjustmentLines(contract),
    reasonLines: buildWhyLines(contract),
    riskFlagLines: contract.riskFlags.map(mapRiskFlagToLabel).filter((line): line is string => !!line),
    sourceLabel: "Microdose ATE",
  };
}
