import { getSupportedExerciseLabel } from "./normalize";
import type { ExerciseRecommendationResult, ExerciseRecommendationUiInfo } from "./types";

export function getExerciseRecommendationUiInfo(result: ExerciseRecommendationResult): ExerciseRecommendationUiInfo {
  if (!result.shouldRenderRecommendation || !result.recommendedExerciseId) {
    return {
      badgeLabel: null,
      badgeTone: "neutral",
      shortReason: null,
      playerReason: null,
    };
  }

  const tone =
    result.recommendedExerciseId === result.originalExerciseId ? "success" :
    result.recommendedExerciseId === "ISO_MID_THIGH_PULL" || result.recommendedExerciseId === "ISOMETRIC_SPLIT_SQUAT_HOLD"
      ? "warning"
      : "success";

  const shortReason =
    result.reasonCode === "protective_explosive" || result.reasonCode === "protective_unilateral"
      ? "Verndandi valkostur"
      : result.reasonCode === "neural_protective"
        ? "Minnkað álag á taugakerfi"
        : result.reasonCode === "knee_irritation_bias"
          ? "Valið til að vernda hnéð"
          : "Valið til að halda gæðum háum";

  const label = getSupportedExerciseLabel(result.recommendedExerciseId);

  return {
    badgeLabel: label ? `Mælt með í dag: ${label}` : "Mælt með í dag",
    badgeTone: tone,
    shortReason,
    playerReason: result.playerText,
  };
}
