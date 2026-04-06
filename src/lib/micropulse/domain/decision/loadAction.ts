import type { AthleteState, LoadAction } from "./types";

export function deriveLoadAction(args: {
  athleteState: AthleteState;
  hardBlock?: boolean | null;
  injuryConcern?: boolean | null;
  neuralConcern?: boolean | null;
  loadConcernLevel?: "none" | "low" | "moderate" | "high" | null;
  lowDataConfidence?: boolean | null;
}): LoadAction {
  if (args.hardBlock) return "cap";
  if (args.athleteState === "RED") return "cap";
  if (args.injuryConcern || args.neuralConcern || args.loadConcernLevel === "high") return "cap";
  if (args.athleteState === "YELLOW" || args.loadConcernLevel === "moderate") return "reduce";
  if (args.lowDataConfidence || args.athleteState === "GRAY" || args.loadConcernLevel === "low") return "monitor";
  return "normal";
}
