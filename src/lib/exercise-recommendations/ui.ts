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
    result.recommendedExerciseId === result.originalExerciseId
      ? "success"
      : result.recommendedExerciseId === "ISO_MID_THIGH_PULL" ||
          result.recommendedExerciseId === "ISOMETRIC_SPLIT_SQUAT_HOLD"
        ? "warning"
        : "success";

  // ── Short reason label (coach-facing) ────────────────────────────────────
  const shortReason = (() => {
    switch (result.reasonCode) {
      // Phase 1 / 2 — explosive
      case "protective_explosive":
        return "Verndandi valkostur";
      case "neural_protective":
        return "Minnkað álag á taugakerfi";
      case "green_explosive":
        return "Fullur sprengikraftur";
      case "moderate_explosive":
        return "Hóflegur sprengikraftur";

      // Phase 3 — explosive
      case "post_match_residual":
        return "Eftirleiksmóðasta — CNS hlíft";
      case "schedule_congestion_explosive":
        return "Þétt leikáætlun — sparað CNS";
      case "lower_body_soreness_explosive":
        return "Þreyta í neðri líkama";

      // Phase 1 / 2 — unilateral
      case "protective_unilateral":
        return "Verndandi valkostur";
      case "knee_irritation_bias":
        return "Valið til að vernda hnéð";
      case "moderate_unilateral":
        return "Valið til að halda gæðum háum";
      case "green_unilateral":
        return "Fullur unilateral styrk";

      // Phase 3 — unilateral
      case "posterior_chain_soreness_bias":
        return "Þreyta í bakhluta";
      case "quad_soreness_bias":
        return "Þreyta í lærismöglum";
      case "unilateral_deficit_focus":
        return "Mismunur á milli hliða";

      default:
        return "Valið til að halda gæðum háum";
    }
  })();

  const label = getSupportedExerciseLabel(result.recommendedExerciseId);

  return {
    badgeLabel: label ? `Mælt með í dag: ${label}` : "Mælt með í dag",
    badgeTone: tone,
    shortReason,
    playerReason: result.playerText,
  };
}
