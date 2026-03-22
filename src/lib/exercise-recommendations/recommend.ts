import { GROUP_OPTIONS } from "./constants";
import { getRecommendationGroupForExercise, normalizeExerciseNameToId } from "./normalize";
import type { ExerciseRecommendationInput, ExerciseRecommendationResult, RecommendationGroup, SupportedExerciseId } from "./types";

function difference(all: SupportedExerciseId[], allowed: SupportedExerciseId[]): SupportedExerciseId[] {
  return all.filter((id) => !allowed.includes(id));
}

function hasContext(input: ExerciseRecommendationInput): boolean {
  return !!(
    input.readinessState ||
    input.riskState ||
    input.trainingMode ||
    input.neuralSuppressionFlag ||
    input.modifiedOnlyFlag ||
    input.kneeIrritationFlag
  );
}

function fallbackResult(originalExerciseId: SupportedExerciseId | null, group: RecommendationGroup | null): ExerciseRecommendationResult {
  return {
    originalExerciseId,
    group,
    recommendedExerciseId: originalExerciseId,
    allowedExerciseIds: originalExerciseId ? [originalExerciseId] : [],
    restrictedExerciseIds: [],
    reasonCode: null,
    coachText: null,
    playerText: null,
    shouldRenderRecommendation: false,
  };
}

export function getExerciseRecommendation(input: ExerciseRecommendationInput): ExerciseRecommendationResult {
  const originalExerciseId = input.originalExerciseName ? normalizeExerciseNameToId(input.originalExerciseName) : null;
  const group = originalExerciseId ? getRecommendationGroupForExercise(originalExerciseId) : null;

  if (!originalExerciseId || !group) return fallbackResult(originalExerciseId, group);
  if (!hasContext(input)) return fallbackResult(originalExerciseId, group);

  let recommendedExerciseId: SupportedExerciseId = originalExerciseId;
  let reasonCode: string | null = null;
  let coachText: string | null = null;
  let playerText: string | null = null;

  if (group === "EXPLOSIVE_ACCESSORY") {
    if (input.trainingMode === "PROTECT" || input.trainingMode === "REGENERATE" || input.modifiedOnlyFlag || input.neuralSuppressionFlag || input.readinessState === "RED") {
      recommendedExerciseId = "ISO_MID_THIGH_PULL";
      reasonCode = input.neuralSuppressionFlag ? "neural_protective" : "protective_explosive";
      coachText = "Valin er ISO Mid-Thigh Pull sem verndandi útgáfa í dag.";
      playerText = input.neuralSuppressionFlag
        ? "Í dag veljum við einfaldari útgáfu til að minnka álag á taugakerfi."
        : "Í dag veljum við verndandi útgáfu til að minnka álag.";
    } else if (input.readinessState === "YELLOW" || input.riskState === "MODERATE") {
      recommendedExerciseId = "JUMP_SHRUGS";
      reasonCode = "moderate_explosive";
      coachText = "Jump Shrugs selected as the preferred explosive option due to moderate fatigue and lower technical cost than DB Snatch.";
      playerText = "Í dag veljum við Jump Shrugs til að halda sprengikrafti með einfaldari og öruggari framkvæmd.";
    } else if (input.readinessState === "GREEN" && input.riskState === "LOW") {
      recommendedExerciseId = "DB_SNATCH";
      reasonCode = "green_explosive";
      coachText = "DB Snatch mælt með í dag fyrir hærri sprengikraftsörvun.";
      playerText = "Í dag máttu velja frjálsar innan samþykktra valkosta.";
    }
  }

  if (group === "UNILATERAL_STRENGTH_ACCESSORY") {
    if (input.trainingMode === "PROTECT" || input.trainingMode === "REGENERATE" || input.modifiedOnlyFlag || input.readinessState === "RED") {
      recommendedExerciseId = "ISOMETRIC_SPLIT_SQUAT_HOLD";
      reasonCode = "protective_unilateral";
      coachText = "Valinn er Isometric Split Squat Hold sem verndandi útgáfa í dag.";
      playerText = "Í dag veljum við verndandi útgáfu til að minnka álag.";
    } else if (input.kneeIrritationFlag) {
      recommendedExerciseId = "SPLIT_STANCE_TRAP_BAR_DEADLIFT";
      reasonCode = "knee_irritation_bias";
      coachText = "RFESS er ekki ráðlagt í dag vegna ertingar í hné; Split Stance Trap Bar Deadlift valið í staðinn.";
      playerText = "Í dag veljum við stöðugri útgáfu til að vernda hnéð.";
    } else if (input.readinessState === "YELLOW" || input.riskState === "MODERATE") {
      recommendedExerciseId = "RFESS";
      reasonCode = "moderate_unilateral";
      coachText = "RFESS valið í dag til að halda gæðum háum með hóflegra álagi.";
      playerText = "Í dag veljum við einfaldari útgáfu til að halda gæðum háum.";
    } else if (input.readinessState === "GREEN" && input.riskState === "LOW") {
      recommendedExerciseId = "SPLIT_STANCE_TRAP_BAR_DEADLIFT";
      reasonCode = "green_unilateral";
      coachText = "Split Stance Trap Bar Deadlift mælt með í dag fyrir unilateral styrk.";
      playerText = "Í dag máttu velja frjálsar innan samþykktra valkosta.";
    }
  }

  let allowedExerciseIds = GROUP_OPTIONS[group];
  if (
    input.trainingMode === "PROTECT" ||
    input.trainingMode === "REGENERATE" ||
    input.modifiedOnlyFlag ||
    input.readinessState === "RED"
  ) {
    allowedExerciseIds = group === "EXPLOSIVE_ACCESSORY" ? ["ISO_MID_THIGH_PULL"] : ["ISOMETRIC_SPLIT_SQUAT_HOLD"];
  } else if (input.readinessState === "YELLOW" || input.riskState === "MODERATE" || input.neuralSuppressionFlag) {
    allowedExerciseIds = group === "EXPLOSIVE_ACCESSORY"
      ? ["JUMP_SHRUGS", "MID_THIGH_PULL", "ISO_MID_THIGH_PULL"]
      : ["RFESS", "ISOMETRIC_SPLIT_SQUAT_HOLD"];
  }

  if (input.kneeIrritationFlag && group === "UNILATERAL_STRENGTH_ACCESSORY") {
    allowedExerciseIds = ["SPLIT_STANCE_TRAP_BAR_DEADLIFT", "ISOMETRIC_SPLIT_SQUAT_HOLD"];
  }

  const restrictedExerciseIds = difference(GROUP_OPTIONS[group], allowedExerciseIds);

  return {
    originalExerciseId,
    group,
    recommendedExerciseId,
    allowedExerciseIds,
    restrictedExerciseIds,
    reasonCode,
    coachText,
    playerText,
    shouldRenderRecommendation: true,
  };
}
