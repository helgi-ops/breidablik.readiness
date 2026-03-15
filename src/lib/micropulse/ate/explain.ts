import type { AteDecisionResult, AteReasonCode } from "./types";

export function mapAteReasonCodeToLabel(code: AteReasonCode): string {
  const labels: Record<AteReasonCode, string> = {
    HIGH_READINESS: "High readiness supported a higher-output profile.",
    NORMAL_READINESS: "Readiness was in the normal working range.",
    LOW_READINESS: "Readiness was below target, so load was moderated.",
    VERY_LOW_READINESS: "Very low readiness triggered a protective path.",
    LOW_NEURAL_FATIGUE: "Low neural fatigue supported normal intensity.",
    MODERATE_NEURAL_FATIGUE: "Moderate neural fatigue kept progression controlled.",
    HIGH_NEURAL_FATIGUE: "High neural fatigue required tighter output controls.",
    VERY_HIGH_NEURAL_FATIGUE: "Very high neural fatigue forced reset behavior.",
    HIGH_YESTERDAY_LOAD: "High yesterday load increased recovery bias today.",
    MD3_FORCE_DAY: "MD3 maps to the force-day objective.",
    MD2_POWER_DAY: "MD2 maps to the power-day objective.",
    MD1_PRIMER_DAY: "MD1 maps to a freshness-first primer objective.",
    RED_RESET_DAY: "Red state routed to a reset session.",
    FORCE_COST_REDUCED: "Force cost was reduced to protect readiness.",
    BALLISTIC_REPLACED: "Ballistic primer was replaced with a lighter option.",
    CONTRAST_DISABLED: "Contrast work was disabled to reduce nervous system cost.",
    REST_EXTENDED: "Rest intervals were extended for quality and recovery.",
    VL_TIGHTENED: "Velocity loss threshold was tightened to cap fatigue.",
    DEFAULT_BLUEPRINT: "Default safe blueprint was used as fallback.",
  };
  return labels[code];
}

function stateLabel(state: AteDecisionResult["athleteState"]): string {
  if (state === "GREEN_PLUS") return "GREEN+";
  return state;
}

function intentLabel(intent: AteDecisionResult["sessionIntent"]): string {
  return intent.toLowerCase().replace("_", " ");
}

export function buildAteHeadline(result: AteDecisionResult): string {
  return `${stateLabel(result.athleteState)} selected for ${intentLabel(result.sessionIntent)} session.`;
}

export function buildAteSummaryNotes(result: AteDecisionResult): string[] {
  const notes = result.decisionReasons.map(mapAteReasonCodeToLabel);
  return Array.from(new Set(notes));
}
