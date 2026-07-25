/**
 * Coach adoption — the cohort outcome tie-in.
 *
 * "Clubs that open Today most days keep check-ins around X%; clubs that don't
 * average Y%." — a REAL usage × outcome comparison the coach can trust, not a
 * slogan. The data layer measures, per club over a window, (a) how often a coach
 * opens Today (usage_events) and (b) the squad check-in share
 * (v_player_submission_compliance); it splits the cohort into active / inactive
 * and hands the two group means + counts here. This module only DECIDES whether
 * the comparison is honest enough to state, and phrases it.
 *
 * It is deliberately conservative — an invented or flimsy tie-in corrodes trust in
 * every other number on the surface (manifesto). If either group is too small or
 * the two barely differ, it returns null and the nudge simply omits the claim.
 *
 * Pure: no I/O. Tested.
 */

import type { Bi } from "./coachAdoption";

/** Each group needs at least this many clubs before a comparison is worth stating. */
export const TIE_IN_MIN_GROUP = 3;
/** The two groups must differ by at least this (share points) to be meaningful. */
export const TIE_IN_MIN_GAP = 0.1;

export interface CohortTieInInput {
  /** Clubs whose coach opens Today on most days in the window. */
  activeTeams: number;
  /** Clubs whose coach does not. */
  inactiveTeams: number;
  /** Mean squad check-in share (0..1) for the active group. */
  activeMeanCompliance: number;
  /** Mean squad check-in share (0..1) for the inactive group. */
  inactiveMeanCompliance: number;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const pct = (n: number) => Math.round(clamp01(n) * 100);

/**
 * Pure. Return the tie-in sentence, or null when the data won't honestly support a
 * claim (either group too small, or the difference too slim to be real signal).
 */
export function computeCohortTieIn(inp: CohortTieInInput): Bi | null {
  if (inp.activeTeams < TIE_IN_MIN_GROUP || inp.inactiveTeams < TIE_IN_MIN_GROUP) return null;

  const total = inp.activeTeams + inp.inactiveTeams;
  const hi = pct(inp.activeMeanCompliance);
  const lo = pct(inp.inactiveMeanCompliance);

  // Gate on the same integer percentage points the coach will read, not raw floats
  // — so the threshold is exact (no floating-point drift) and matches what's shown.
  // Only state it when the active group is genuinely and meaningfully higher.
  if (hi - lo < Math.round(TIE_IN_MIN_GAP * 100)) return null;

  return {
    en: `Across ${total} clubs, those opening Today most days keep check-ins around ${hi}% — clubs that don't average ${lo}%.`,
    is: `Yfir ${total} félög: þau sem opna Today flesta daga halda skráningum um ${hi}% — félög sem gera það ekki eru að meðaltali í ${lo}%.`,
  };
}
