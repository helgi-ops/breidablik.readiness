import type { TrainingRecommendation } from "./types";
import { roundNumber } from "./helpers";

export function serializeTrainingRecommendation(recommendation: TrainingRecommendation) {
  return {
    ...recommendation,
    loadAdjustment:
      typeof recommendation.loadAdjustment === "number" ? roundNumber(recommendation.loadAdjustment, 2) : recommendation.loadAdjustment,
    confidence: {
      ...recommendation.confidence,
      score: roundNumber(recommendation.confidence.score, 2),
    },
    explanationFactors: recommendation.explanationFactors.map((item) => ({
      ...item,
      impactScore: roundNumber(item.impactScore, 0),
    })),
  };
}
