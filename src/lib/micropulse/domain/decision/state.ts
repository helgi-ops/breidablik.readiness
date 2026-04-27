/**
 * Pure state-inference logic, factored out of buildDecision.ts so the
 * counterfactual engine (counterfactuals.ts) can re-run the exact same
 * decision tree with one input flipped — guaranteeing the "what-if"
 * answer matches the real engine instead of drifting from it.
 *
 * Single source of truth for the "given these signals, what's the
 * verdict color" mapping. Keep this in sync with buildAthleteDecision —
 * both files import inferAthleteState from here so they cannot disagree.
 */

import type { AthleteState, NeuralStatus } from "./types";

export type InferStateInputs = {
  hardBlock: boolean;
  rehab: boolean;
  readinessState: AthleteState;
  neuralStatus: NeuralStatus;
  injurySeverity: "none" | "low" | "moderate" | "high";
  loadConcernLevel: "none" | "low" | "moderate" | "high";
  // Indoor + Decel intelligence layers — same severity ladder as
  // loadConcernLevel. Folded into the same red/yellow gates so the
  // dashboard verdict reflects whichever intelligence view escalated.
  indoorCompositeBand?: "light" | "below_average" | "typical" | "heavy" | "spike" | null;
  indoorMcburnieFlag?: "green" | "yellow" | "red" | null;
  indoorAcwrFlag?: "green" | "yellow" | "red" | null;
  decelOverallFlag?: "green" | "yellow" | "red" | "unknown" | null;
};

export function inferAthleteState(args: InferStateInputs): AthleteState {
  if (args.hardBlock || args.rehab) return "RED";
  if (args.readinessState === "RED") return "RED";
  if (args.neuralStatus === "suppressed") return "RED";
  if (args.injurySeverity === "high" || args.loadConcernLevel === "high") return "RED";

  // RED gates from the intelligence layers.
  if (args.indoorCompositeBand === "spike") return "RED";
  if (args.indoorMcburnieFlag === "red") return "RED";
  if (args.indoorAcwrFlag === "red") return "RED";
  if (args.decelOverallFlag === "red") return "RED";

  if (
    args.readinessState === "YELLOW" ||
    args.neuralStatus === "caution" ||
    args.injurySeverity === "moderate" ||
    args.loadConcernLevel === "moderate"
  ) {
    return "YELLOW";
  }

  // YELLOW gates from the intelligence layers.
  if (args.indoorCompositeBand === "heavy") return "YELLOW";
  if (args.indoorMcburnieFlag === "yellow") return "YELLOW";
  if (args.indoorAcwrFlag === "yellow") return "YELLOW";
  if (args.decelOverallFlag === "yellow") return "YELLOW";

  return args.readinessState;
}
