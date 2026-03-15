export function buildDecisionFlags(args: {
  hardBlock: boolean;
  recoveryBias: boolean;
  whoopInfluenced: boolean;
  loadConcernLevel?: "none" | "low" | "moderate" | "high" | null;
  neuralStatus?: "clear" | "caution" | "suppressed" | "unknown" | null;
  injurySeverity?: "none" | "low" | "moderate" | "high" | null;
  lowDataConfidence: boolean;
}) {
  return {
    hardBlock: args.hardBlock,
    recoveryBias: args.recoveryBias,
    whoopInfluenced: args.whoopInfluenced,
    loadConcern: args.loadConcernLevel === "moderate" || args.loadConcernLevel === "high",
    neuralConcern: args.neuralStatus === "caution" || args.neuralStatus === "suppressed",
    injuryConcern: args.injurySeverity === "moderate" || args.injurySeverity === "high",
    lowDataConfidence: args.lowDataConfidence,
  };
}
