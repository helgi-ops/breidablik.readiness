import type { AthleteDecision } from "./types";

export function buildDecisionReasons(args: {
  hardBlock?: boolean | null;
  rehab?: boolean | null;
  readinessWhy?: string[];
  neuralSummary?: string | null;
  injurySummary?: string | null;
  loadSummary?: string | null;
  whoopLine?: string | null;
  lowDataConfidence?: boolean | null;
}): string[] {
  const lines: string[] = [];
  if (args.hardBlock) lines.push("Explicit protection rules remain the dominant constraint today.");
  if (args.rehab) lines.push("Rehab or return-to-play context limits normal loading today.");
  lines.push(...(args.readinessWhy ?? []));
  if (args.neuralSummary) lines.push(args.neuralSummary);
  if (args.injurySummary) lines.push(args.injurySummary);
  if (args.loadSummary) lines.push(args.loadSummary);
  if (args.whoopLine) lines.push(args.whoopLine);
  if (args.lowDataConfidence) lines.push("Decision confidence is reduced because monitoring inputs are sparse.");
  return Array.from(new Set(lines.filter(Boolean))).slice(0, 4);
}

export function buildDecisionExplanationLines(args: {
  athleteState: AthleteDecision["athleteState"];
  sessionMode: AthleteDecision["sessionMode"];
  reasons: string[];
}): string[] {
  const lead =
    args.sessionMode === "recovery"
      ? "Recovery emphasis is the recommended session mode today."
      : args.sessionMode === "modified"
      ? "Modified session recommended based on current monitoring."
      : args.sessionMode === "full"
      ? "Full session remains appropriate based on current evidence."
      : "Final session mode should remain pending until more data is available.";
  return Array.from(new Set([lead, ...args.reasons])).slice(0, 4);
}

export function buildDecisionRecommendations(args: {
  athleteState: AthleteDecision["athleteState"];
  loadAction: AthleteDecision["loadAction"];
  coachAction?: string[];
  lowDataConfidence?: boolean | null;
}): string[] {
  const lines = [...(args.coachAction ?? [])];
  if (!lines.length) {
    if (args.athleteState === "GREEN") lines.push("Run planned session with standard monitoring.");
    if (args.athleteState === "YELLOW") lines.push("Modify volume and monitor first block response.");
    if (args.athleteState === "RED") lines.push("Use recovery-first work and avoid high-output loading.");
    if (args.athleteState === "GRAY") lines.push("Collect missing monitoring inputs before confirming full load.");
  }
  if (args.loadAction === "cap") lines.push("Cap intensity and avoid high-cost exposures.");
  else if (args.loadAction === "reduce") lines.push("Reduce load slightly while preserving session quality.");
  else if (args.loadAction === "monitor") lines.push("Monitor response closely due to lower decision certainty.");
  if (args.lowDataConfidence) lines.push("Use coach observation early in session to validate progression.");
  return Array.from(new Set(lines.filter(Boolean))).slice(0, 4);
}
