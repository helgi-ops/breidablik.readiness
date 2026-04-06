import { getSupportedExerciseLabel } from "./normalize";
import type { ExerciseRecommendationResult, ExerciseRecommendationUiInfo } from "./types";
import type { Lang } from "@/lib/lang";

export function getExerciseRecommendationUiInfo(result: ExerciseRecommendationResult, lang: Lang = "IS"): ExerciseRecommendationUiInfo {
  if (!result.shouldRenderRecommendation || !result.recommendedExerciseId) {
    return {
      badgeLabel: null,
      badgeTone: "neutral",
      shortReason: null,
      playerReason: null,
    };
  }

  const isEN = lang === "EN";

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
        return isEN ? "Protective option" : "Verndandi valkostur";
      case "neural_protective":
        return isEN ? "Reduced neural load" : "Minnkað álag á taugakerfi";
      case "green_explosive":
        return isEN ? "Full explosive power" : "Fullur sprengikraftur";
      case "moderate_explosive":
        return isEN ? "Moderate explosive" : "Hóflegur sprengikraftur";

      // Phase 3 — explosive
      case "post_match_residual":
        return isEN ? "Post-match fatigue — CNS protected" : "Eftirleiksmóðasta — CNS hlíft";
      case "schedule_congestion_explosive":
        return isEN ? "Congested schedule — CNS conserved" : "Þétt leikáætlun — sparað CNS";
      case "lower_body_soreness_explosive":
        return isEN ? "Lower body soreness" : "Þreyta í neðri líkama";

      // Phase 1 / 2 — unilateral
      case "protective_unilateral":
        return isEN ? "Protective option" : "Verndandi valkostur";
      case "knee_irritation_bias":
        return isEN ? "Selected to protect the knee" : "Valið til að vernda hnéð";
      case "moderate_unilateral":
        return isEN ? "Selected to maintain quality" : "Valið til að halda gæðum háum";
      case "green_unilateral":
        return isEN ? "Full unilateral strength" : "Fullur unilateral styrk";

      // Phase 3 — unilateral
      case "posterior_chain_soreness_bias":
        return isEN ? "Posterior chain soreness" : "Þreyta í bakhluta";
      case "quad_soreness_bias":
        return isEN ? "Quad soreness" : "Þreyta í lærismöglum";
      case "unilateral_deficit_focus":
        return isEN ? "Strength asymmetry" : "Mismunur á milli hliða";

      default:
        return isEN ? "Selected to maintain quality" : "Valið til að halda gæðum háum";
    }
  })();

  const label = getSupportedExerciseLabel(result.recommendedExerciseId);

  return {
    badgeLabel: label
      ? isEN ? `Recommended today: ${label}` : `Mælt með í dag: ${label}`
      : isEN ? "Recommended today" : "Mælt með í dag",
    badgeTone: tone,
    shortReason,
    playerReason: result.playerText,
  };
}
