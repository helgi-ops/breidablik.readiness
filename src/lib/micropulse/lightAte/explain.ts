import type { LightAteDecisionResult, LightAteReasonCode } from "./types";

export function mapLightAteReasonCodeToLabel(code: LightAteReasonCode): string {
  const labels: Record<LightAteReasonCode, string> = {
    HIGH_READINESS: "High readiness",
    NORMAL_READINESS: "Normal readiness",
    LOW_READINESS: "Low readiness",
    VERY_LOW_READINESS: "Very low readiness",
    LOW_NEURAL_FATIGUE: "Low neural fatigue",
    MODERATE_NEURAL_FATIGUE: "Moderate neural fatigue",
    HIGH_NEURAL_FATIGUE: "High neural fatigue",
    VERY_HIGH_NEURAL_FATIGUE: "Very high neural fatigue",
    HIGH_YESTERDAY_LOAD: "High yesterday load",
    EXTERNAL_PLAYER_LOAD_SPIKE: "External player load spike",
    SPRINT_DISTANCE_SPIKE: "Sprint distance spike",
    MD_TEMPLATE_SELECTED: "Session template selected",
    STATE_REDUCED: "Reduced state selected",
    VL_CAPPED_BY_MD: "Match-day velocity cap applied",
    CONTRAST_DISABLED: "Contrast disabled",
    PRIMER_REPLACED: "Ballistic primer replaced",
    REST_EXTENDED: "Rest extended",
    DEFAULT_TEMPLATE: "Context missing; standard template selected",
  };

  return labels[code];
}

function formatState(state: LightAteDecisionResult["athleteState"]): string {
  if (state === "GREEN_PLUS") return "Green+";
  if (state === "GREEN") return "Green";
  if (state === "YELLOW") return "Yellow";
  return "Red";
}

function formatTemplate(templateId: string): string {
  return templateId.split("_").join(" ");
}

export function buildLightAteHeadline(
  result: LightAteDecisionResult
): string {
  return `${formatState(result.athleteState)} selected for ${formatTemplate(result.templateId)} session.`;
}

export function buildLightAteSummaryNotes(
  result: LightAteDecisionResult
): string[] {
  return Array.from(new Set(result.reasons.map(mapLightAteReasonCodeToLabel)));
}
