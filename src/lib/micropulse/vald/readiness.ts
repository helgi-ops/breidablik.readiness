import { getValdDailySnapshot } from "./snapshot";
import type { ValdReadinessAdjustment } from "./types";

export async function getValdReadinessAdjustment(teamId: string, microplayerId: string, date: string): Promise<ValdReadinessAdjustment> {
  const snapshot = await getValdDailySnapshot(teamId, microplayerId, date);
  if (!snapshot) {
    return {
      adjustmentScore: 0,
      confidenceWeight: -0.05,
      flags: ["vald_missing"],
      explanation: ["No recent VALD data available; confidence reduced."],
    };
  }

  const flags: string[] = [];
  const explanation: string[] = [];
  let adjustmentScore = 0;
  let confidenceWeight = 0;

  if (snapshot.cmjFreshnessStatus !== "fresh") {
    confidenceWeight -= 0.05;
  }
  if (snapshot.neuromuscularFlag === "yellow") {
    adjustmentScore -= 3;
    flags.push("vald_neuromuscular_caution");
    explanation.push("Latest CMJ is moderately below recent baseline.");
  } else if (snapshot.neuromuscularFlag === "red") {
    adjustmentScore -= 6;
    flags.push("vald_neuromuscular_drop");
    explanation.push("Latest CMJ is meaningfully below recent baseline.");
  } else if (snapshot.neuromuscularFlag === "green") {
    confidenceWeight += 0.04;
  }

  return {
    adjustmentScore,
    confidenceWeight,
    flags,
    explanation,
  };
}
