/**
 * Sequence-aware verdict escalation (decision_history derived).
 *
 * Stateless current-day logic in buildAthleteDecision can't see that
 * a player has been YELLOW for 5 days running — each day is computed
 * fresh from today's signals. That misses the chronic-warning pattern
 * that any sport scientist would catch by eye: "She's been yellow all
 * week, even if today is just one yellow, the cumulative load matters."
 *
 * This module reads the last N days of verdicts from
 * `athlete_decision_history` and produces a streak summary that the
 * decision engine can use to escalate.
 *
 * Escalation rules (conservative — clinical decisions, false-positive
 * cost is high):
 *   - 3+ consecutive YELLOW (today included) → escalate today to RED
 *     with reason CHRONIC_YELLOW_3D. Two days could be noise; three is
 *     a pattern.
 *   - 2+ consecutive RED → keep RED, tag SUSTAINED_RED_2D. Coach
 *     guidance shifts ("rest is non-negotiable now").
 *   - GRAY days break the streak (we don't have data — no extrapolation).
 *
 * The streak is computed on the FULL history (today + recent days). The
 * caller decides whether today's preliminary state contributes — for
 * the escalation pass we include it so 2 prior + today's yellow → RED.
 */

import type { AthleteState } from "./types";

export type RecentDecision = {
  decision_date: string; // ISO yyyy-mm-dd
  athlete_state: AthleteState;
};

export type StreakContext = {
  consecutiveYellow: number;
  consecutiveRed: number;
  daysOfYellowOrRed: number;
  daysSinceGreen: number | null;
  escalationApplied: "none" | "yellow_streak_to_red" | "red_streak_sustained";
};

export type StreakEscalationResult = {
  state: AthleteState;
  context: StreakContext;
  /** Reason code to append to the verdict's reasons[] when an
   * escalation was applied. Empty string when no change. */
  reasonCode: string;
};

const YELLOW_TO_RED_THRESHOLD = 3;
const SUSTAINED_RED_THRESHOLD = 2;

/**
 * Apply sequence-aware escalation to a preliminary state.
 *
 * @param preliminaryState — what inferAthleteState computed today from
 *   single-day signals
 * @param todayDate — ISO yyyy-mm-dd of the verdict being computed
 * @param recentDecisions — last 7 decisions for this player, ordered
 *   newest-first or oldest-first (we sort defensively)
 */
export function applyStreakEscalation(
  preliminaryState: AthleteState,
  todayDate: string,
  recentDecisions: RecentDecision[],
): StreakEscalationResult {
  // Sort newest-first and exclude today (we use today's preliminary state)
  const prior = (recentDecisions ?? [])
    .filter((d) => d.decision_date !== todayDate)
    .sort((a, b) => b.decision_date.localeCompare(a.decision_date));

  // Count consecutive same-state days starting with today and walking back
  let consecutiveYellow = 0;
  let consecutiveRed = 0;
  if (preliminaryState === "YELLOW") consecutiveYellow = 1;
  else if (preliminaryState === "RED") consecutiveRed = 1;

  // Walk back through prior days, stop at first non-matching state
  for (const d of prior) {
    if (preliminaryState === "YELLOW" && d.athlete_state === "YELLOW") {
      consecutiveYellow += 1;
    } else if (preliminaryState === "RED" && d.athlete_state === "RED") {
      consecutiveRed += 1;
    } else if (
      preliminaryState === "YELLOW" &&
      d.athlete_state === "RED"
    ) {
      // Yellow today but red yesterday — don't extend yellow streak,
      // but the trajectory is improving; let escalation rule handle
      // (it won't fire since count < threshold)
      break;
    } else {
      break;
    }
  }

  // Days of yellow-or-red in last 7 (any non-green non-gray)
  const lastSeven = prior.slice(0, 7);
  const daysOfYellowOrRed = lastSeven.filter(
    (d) => d.athlete_state === "YELLOW" || d.athlete_state === "RED",
  ).length + (preliminaryState === "YELLOW" || preliminaryState === "RED" ? 1 : 0);

  // Days since last GREEN (today included if green, counts back through prior)
  let daysSinceGreen: number | null = null;
  if (preliminaryState === "GREEN") {
    daysSinceGreen = 0;
  } else {
    let count = 1; // today is non-green
    let found = false;
    for (const d of prior) {
      if (d.athlete_state === "GREEN") {
        found = true;
        break;
      }
      count += 1;
    }
    daysSinceGreen = found ? count : null;
  }

  // Apply escalation
  let finalState = preliminaryState;
  let escalationApplied: StreakContext["escalationApplied"] = "none";
  let reasonCode = "";

  if (preliminaryState === "YELLOW" && consecutiveYellow >= YELLOW_TO_RED_THRESHOLD) {
    finalState = "RED";
    escalationApplied = "yellow_streak_to_red";
    reasonCode = `CHRONIC_YELLOW_${consecutiveYellow}D`;
  } else if (preliminaryState === "RED" && consecutiveRed >= SUSTAINED_RED_THRESHOLD) {
    escalationApplied = "red_streak_sustained";
    reasonCode = `SUSTAINED_RED_${consecutiveRed}D`;
  }

  return {
    state: finalState,
    context: {
      consecutiveYellow,
      consecutiveRed,
      daysOfYellowOrRed,
      daysSinceGreen,
      escalationApplied,
    },
    reasonCode,
  };
}

/**
 * Human-readable streak description for the verdict explanation. EN/IS.
 */
export function describeStreakContext(
  context: StreakContext,
  lang: "EN" | "IS" = "EN",
): string | null {
  if (context.escalationApplied === "yellow_streak_to_red") {
    return lang === "IS"
      ? `Þrjátta gula daga í röð (${context.consecutiveYellow}× YELLOW) — escalate-að í RED`
      : `${context.consecutiveYellow}th yellow day in a row — escalating to RED`;
  }
  if (context.escalationApplied === "red_streak_sustained") {
    return lang === "IS"
      ? `${context.consecutiveRed}. rauði dagurinn í röð — viðvarandi rautt mynstur`
      : `${context.consecutiveRed}th red day in a row — sustained red pattern`;
  }
  // No escalation but worth surfacing if pattern is brewing (2 yellow days)
  if (context.consecutiveYellow >= 2) {
    return lang === "IS"
      ? `Annar guli dagurinn í röð — fylgstu með ef það heldur áfram`
      : `${context.consecutiveYellow}nd yellow day in a row — watch if it continues`;
  }
  return null;
}
