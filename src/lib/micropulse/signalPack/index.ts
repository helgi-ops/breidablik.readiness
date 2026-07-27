/**
 * Explainable Signal Pack — the combiner. Assembles every per-player signal into one
 * RANKED list of "why" contributors (flagged first, then by severity). Single source so
 * every surface agrees. Pure: takes assembled per-player data, returns contributors.
 * Rules decide; these signals only explain — they never change the verdict or the plan.
 */

import { ewmaAcwr, acwrContributor } from "./ewmaAcwr";
import { monotonyContributor } from "./monotony";
import { injuryRecencyContributor } from "./injuryRecency";
import { sleepContributor, cmjJumpContributor, cmjAsymContributor, type SleepInput, type CmjJumpInput, type CmjAsymInput } from "./sleepCmj";
import type { SignalContributor } from "./types";

export * from "./types";
export { ewma, ewmaAcwr, acwrContributor } from "./ewmaAcwr";
export { monotonyContributor, weeklyMonotony } from "./monotony";
export { injuryRecencyContributor, INJURY_RECENCY_WINDOW } from "./injuryRecency";
export { sleepContributor, cmjJumpContributor, cmjAsymContributor } from "./sleepCmj";

export const SIGNAL_PACK_CITATION =
  "Williams 2017 · Majumdar 2022 · Saberisani 2025 · Rico-González 2023 · Haller 2023";

export interface SignalPackInput {
  today: string;
  /** Internal (sRPE) daily load series, oldest→newest, rest days 0-filled. */
  load: { daily: number[]; coverageDays: number };
  /** External deceleration-count daily series. */
  decel: { daily: number[]; coverageDays: number };
  /** External high-speed-running distance daily series. */
  hsr: { daily: number[]; coverageDays: number };
  /** This week's daily sRPE (for monotony) + the player's own average weekly monotony. */
  weekLoads: number[];
  monotonyNorm: number | null;
  monotonyCoverageDays: number;
  injury: { lastInjuryDate: string | null; lastReturnDate: string | null; bodyPart?: string | null };
  sleep: SleepInput;
  cmjJump: CmjJumpInput;
  cmjAsym: CmjAsymInput;
}

export interface SignalPack {
  /** Ranked contributors: flagged first, then by severity. Empty when nothing computes. */
  contributors: SignalContributor[];
  flaggedCount: number;
  citation: string;
}

export function computeSignalPack(inp: SignalPackInput): SignalPack {
  const contributors = [
    acwrContributor({ key: "load_acwr", metric: { en: "training load", is: "æfingaálag" }, acwr: ewmaAcwr(inp.load.daily), coverageDays: inp.load.coverageDays, citation: "Williams 2017 · Majumdar 2022" }),
    acwrContributor({ key: "decel_acwr", metric: { en: "deceleration load", is: "hemlunar-álag" }, acwr: ewmaAcwr(inp.decel.daily), coverageDays: inp.decel.coverageDays, flagAt: 1.5, clearAt: 1.3, citation: "Saberisani 2025" }),
    acwrContributor({ key: "hsr_acwr", metric: { en: "high-speed running", is: "háhraðahlaup" }, acwr: ewmaAcwr(inp.hsr.daily), coverageDays: inp.hsr.coverageDays, citation: "Saberisani 2025" }),
    monotonyContributor({ weekLoads: inp.weekLoads, monotonyNorm: inp.monotonyNorm, coverageDays: inp.monotonyCoverageDays }),
    injuryRecencyContributor({ ...inp.injury, today: inp.today }),
    sleepContributor(inp.sleep),
    cmjJumpContributor(inp.cmjJump),
    cmjAsymContributor(inp.cmjAsym),
  ].filter((c): c is SignalContributor => c != null);

  // Flagged first, then most severe.
  contributors.sort((a, b) => (b.flagged ? 1 : 0) - (a.flagged ? 1 : 0) || b.severity - a.severity);

  return { contributors, flaggedCount: contributors.filter((c) => c.flagged).length, citation: SIGNAL_PACK_CITATION };
}
