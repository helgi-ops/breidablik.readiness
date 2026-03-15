import type { AthleteState, SessionMode } from "./types";

export function deriveSessionMode(args: {
  athleteState: AthleteState;
  rehab?: boolean | null;
  hardBlock?: boolean | null;
  explicitRecoveryDay?: boolean | null;
  insufficientData?: boolean | null;
}): SessionMode {
  if (args.hardBlock || args.rehab || args.explicitRecoveryDay) return "recovery";
  if (args.insufficientData && args.athleteState === "GRAY") return "pending";
  if (args.athleteState === "RED") return "recovery";
  if (args.athleteState === "YELLOW") return "modified";
  if (args.athleteState === "GREEN") return "full";
  return "pending";
}
