/**
 * Verdict forecast — "what should the coach expect tomorrow?"
 *
 * Coaches plan training a day or two ahead. A status that says "she
 * was YELLOW today" answers what already happened; what they actually
 * need before scheduling tomorrow is "is she likely to be RED, YELLOW,
 * or GREEN tomorrow?". This module produces a transparent, rule-based
 * forecast — not a black-box ML guess.
 *
 * Three scenarios make the forecast useful when signals are noisy:
 *   - ifImprove: signals get better tomorrow (e.g. sleep recovers)
 *   - ifHold:    signals stay at today's level
 *   - ifDecline: signals get worse
 *
 * The engine combines two transparent rules:
 *   1. Streak escalation (sequence.ts): if a player is on day 2 of
 *      yellow, the streak rule says day 3 escalates to RED. The
 *      forecast surfaces that gate explicitly so the coach knows
 *      tomorrow's verdict isn't just "more of the same".
 *   2. Signal trajectory (optional): if the readiness z-score has
 *      been trending down 3 days running, "ifHold" leans toward the
 *      same direction.
 *
 * Confidence:
 *   - HIGH:   ≥5 days of recent decisions, stable streak pattern,
 *             trajectory direction is consistent
 *   - MEDIUM: 3-4 days history OR mixed trajectory
 *   - LOW:    <3 days history (insufficient base for prediction)
 *
 * Honesty constraints:
 *   - We DON'T claim a probability (e.g. "78% chance of RED") — that's
 *     ML territory and we don't have the labelled data to back it. We
 *     surface the deterministic gates the coach can verify themselves.
 *   - When confidence is LOW, the UI should grey out the forecast
 *     instead of pretending it's actionable.
 *   - Forecast for GRAY today returns null — no signal to extrapolate.
 */

import type { AthleteState } from "./types";
import { applyStreakEscalation, type RecentDecision } from "./sequence";

export type ForecastConfidence = "low" | "medium" | "high";

export type SignalTrendDirection = "improving" | "stable" | "declining" | "unknown";

export type SignalTrend = {
  /**
   * Direction of recent change in the dominant readiness signal
   * (typically z-score or total_score over last 3-5 days). Computed
   * by the caller from athlete_decision_history.input_signals or
   * readiness_entries — keeps this module pure.
   */
  direction: SignalTrendDirection;
  /**
   * How many days of data the trend was computed from. ≥5 days is
   * considered reliable; lower drops forecast confidence one tier.
   */
  daysOfHistory: number;
};

export type VerdictForecast = {
  /**
   * Most likely state tomorrow given today's signals + streak
   * momentum + recent trajectory. Defaults to the "ifHold" scenario
   * because that's the most common outcome day-to-day.
   */
  expectedState: AthleteState;
  confidence: ForecastConfidence;
  /**
   * Three scenarios for the coach to plan against. Helps differentiate
   * "tomorrow might tip into RED" from "tomorrow is locked in for RED".
   */
  scenarios: {
    ifImprove: AthleteState;
    ifHold: AthleteState;
    ifDecline: AthleteState;
  };
  /** Bilingual rationale lines — kept short, max 2 each */
  reasonsEN: string[];
  reasonsIS: string[];
};

/** Step a state one tier "better" (toward GREEN). GREEN stays GREEN. */
function stepBetter(state: AthleteState): AthleteState {
  if (state === "RED") return "YELLOW";
  if (state === "YELLOW") return "GREEN";
  return state; // GREEN, GRAY unchanged
}

/** Step a state one tier "worse" (toward RED). RED stays RED. */
function stepWorse(state: AthleteState): AthleteState {
  if (state === "GREEN") return "YELLOW";
  if (state === "YELLOW") return "RED";
  return state; // RED, GRAY unchanged
}

/**
 * Add today's verdict to the historical decision list, then re-run the
 * streak escalation logic with `tomorrowPreliminaryState`. Lets us
 * answer "if tomorrow's preliminary state is X, what does the streak
 * rule push it to?". Pure — doesn't mutate inputs.
 */
function projectWithStreak(
  todayDate: string,
  todayActualState: AthleteState,
  recentDecisions: RecentDecision[],
  tomorrowPreliminary: AthleteState,
): AthleteState {
  // Build the "history as of tomorrow" by appending today as a prior decision
  const tomorrowDate = (() => {
    const d = new Date(`${todayDate}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  })();
  const projectedHistory: RecentDecision[] = [
    ...recentDecisions.filter((d) => d.decision_date !== todayDate),
    { decision_date: todayDate, athlete_state: todayActualState },
  ];
  const result = applyStreakEscalation(tomorrowPreliminary, tomorrowDate, projectedHistory);
  return result.state;
}

export type ComputeForecastInput = {
  todayDate: string;
  todayActualState: AthleteState; // post-escalation final state today
  recentDecisions: RecentDecision[];
  signalTrend?: SignalTrend | null;
};

/**
 * Compute tomorrow's forecast given today's verdict + recent history.
 * Returns null when forecast doesn't make sense (today is GRAY — no
 * signal to extrapolate from).
 */
export function computeForecast(input: ComputeForecastInput): VerdictForecast | null {
  if (input.todayActualState === "GRAY") return null;

  const { todayActualState, todayDate, recentDecisions } = input;
  const trend: SignalTrend = input.signalTrend ?? { direction: "unknown", daysOfHistory: 0 };

  // ── Three scenarios ──────────────────────────────────────────
  // For each "if tomorrow's preliminary state is X" we project through
  // the same streak escalation gate that today's verdict went through.
  // This catches escalations that would fire only on day 3 of yellow.
  const ifImprove = projectWithStreak(
    todayDate,
    todayActualState,
    recentDecisions,
    stepBetter(todayActualState),
  );
  const ifHold = projectWithStreak(
    todayDate,
    todayActualState,
    recentDecisions,
    todayActualState,
  );
  const ifDecline = projectWithStreak(
    todayDate,
    todayActualState,
    recentDecisions,
    stepWorse(todayActualState),
  );

  // ── Pick expected state ──────────────────────────────────────
  // Default to "ifHold" — that's the most common day-to-day outcome.
  // When trend direction is clearly improving or declining, lean toward
  // that scenario (still requires ≥3 days of history to act on it).
  let expectedState: AthleteState = ifHold;
  if (trend.daysOfHistory >= 3) {
    if (trend.direction === "improving") expectedState = ifImprove;
    else if (trend.direction === "declining") expectedState = ifDecline;
  }

  // ── Confidence ──────────────────────────────────────────────
  // Combine recent decision depth + trend reliability.
  let confidence: ForecastConfidence = "low";
  const decisionDays = recentDecisions.filter((d) => d.decision_date !== todayDate).length;
  if (decisionDays >= 5 && trend.daysOfHistory >= 5 && trend.direction !== "unknown") {
    confidence = "high";
  } else if (decisionDays >= 3) {
    confidence = "medium";
  }
  // Streak escalations are more deterministic — bump confidence up
  // one tier when the forecast hinges on a hard streak rule firing.
  if (
    todayActualState === "YELLOW" &&
    ifHold === "RED" &&
    confidence === "medium"
  ) {
    confidence = "high";
  }

  // ── Reasons ──────────────────────────────────────────────────
  const reasonsEN: string[] = [];
  const reasonsIS: string[] = [];

  // Streak gate explicit
  if (todayActualState === "YELLOW" && ifHold === "RED") {
    reasonsEN.push("If yellow continues tomorrow, streak rule escalates to RED (3rd day in a row).");
    reasonsIS.push("Ef gult heldur áfram á morgun, escalate-ar streak-reglan í RED (3. dagur í röð).");
  } else if (todayActualState === "RED" && ifHold === "RED") {
    reasonsEN.push("Sustained red pattern — recovery typically takes 2-3 days of green signals.");
    reasonsIS.push("Viðvarandi rautt mynstur — bati tekur yfirleitt 2-3 daga af grænum merkjum.");
  } else if (todayActualState === "GREEN" && ifHold === "GREEN") {
    reasonsEN.push("Today's signals point to a stable green tomorrow — barring new stressors.");
    reasonsIS.push("Dagsmerkin benda til stöðugs græns á morgun — ef ekkert nýtt kemur upp.");
  }

  // Trajectory line
  if (trend.daysOfHistory >= 3) {
    if (trend.direction === "declining") {
      reasonsEN.push(`Signals trending down over last ${trend.daysOfHistory} days — expect deterioration if no rest.`);
      reasonsIS.push(`Merki þróast niður síðustu ${trend.daysOfHistory} daga — búast má við versnun ef ekki er hvíld.`);
    } else if (trend.direction === "improving") {
      reasonsEN.push(`Signals trending up over last ${trend.daysOfHistory} days — recovery underway.`);
      reasonsIS.push(`Merki þróast upp síðustu ${trend.daysOfHistory} daga — bati í gangi.`);
    }
  }

  // Confidence caveat for low data
  if (confidence === "low") {
    reasonsEN.push("Limited history — forecast confidence is low.");
    reasonsIS.push("Takmarkaður gagnasaga — spá-vissa er lítil.");
  }

  return {
    expectedState,
    confidence,
    scenarios: {
      ifImprove,
      ifHold,
      ifDecline,
    },
    reasonsEN,
    reasonsIS,
  };
}

/**
 * Helper for callers that have raw signal samples (e.g. last 5 days
 * of total_score) and want to derive a SignalTrend without thinking
 * about thresholds. Pure.
 *
 * Direction is "improving" if last value is at least improvementThreshold
 * higher than oldest; "declining" if equally lower; else "stable".
 *
 * Defaults are tuned for total_score (range ~0-25) where ±2 is
 * meaningful. Caller can override for z-scores etc.
 */
export function deriveSignalTrend(
  values: Array<number | null>,
  improvementThreshold = 2,
): SignalTrend {
  const clean = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (clean.length < 2) return { direction: "unknown", daysOfHistory: clean.length };
  const oldest = clean[0];
  const newest = clean[clean.length - 1];
  const delta = newest - oldest;
  let direction: SignalTrendDirection;
  if (delta >= improvementThreshold) direction = "improving";
  else if (delta <= -improvementThreshold) direction = "declining";
  else direction = "stable";
  return { direction, daysOfHistory: clean.length };
}
