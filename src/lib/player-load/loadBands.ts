import type { LoadBand } from "@/lib/player-load/types";

export function getLoadBand(totalLoad: number): LoadBand {
  if (totalLoad < 200) return "LOW";
  if (totalLoad < 400) return "MODERATE";
  if (totalLoad < 700) return "HIGH";
  return "VERY_HIGH";
}

// NOTE(player-load): Yesterday total_load and 3-7 day trends will feed the
// Neural Fatigue Model. Daily Readiness should consume aggregated load context,
// not raw session rows, in later phases.

