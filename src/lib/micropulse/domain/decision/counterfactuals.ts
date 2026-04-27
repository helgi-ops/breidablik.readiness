/**
 * Counterfactual explanations for verdict transparency.
 *
 * Today's verdict is the output of inferAthleteState() applied to a bag
 * of signals (readiness, neural, injury, load, indoor composite,
 * McBurnie, ACWR, decel) — and then potentially escalated by a chronic
 * pattern (sequence.ts). Coaches frequently ask "why is she YELLOW
 * instead of GREEN?" or "what would have to change for me to send her
 * full session?". A list of *reasons* answers the first question. A
 * list of *counterfactuals* answers the second.
 *
 * Approach: for each input lever that is currently at a non-best value,
 * re-run inferAthleteState with that one lever flipped to its best
 * value (everything else unchanged). If the resulting state is strictly
 * better than today's actual state, that lever is a "movable
 * counterfactual" — flipping just this one signal would have improved
 * the verdict. We sort by impact (how much better), keep the top K, and
 * the UI renders bilingual lines like:
 *
 *   "If indoor composite had been TYPICAL (not SPIKE) → YELLOW not RED"
 *
 * The streak escalation (yellow_streak_to_red) is special-cased: we
 * report it as a separate counterfactual ("Without 3-day yellow streak,
 * today would be YELLOW") because the chronic-pattern lever is not part
 * of inferAthleteState's input bag — it lives in sequence.ts.
 *
 * Honesty caveats baked into the design:
 *   - We only flip ONE lever at a time. Multi-lever counterfactuals are
 *     misleading ("if 4 things had been different…" isn't actionable).
 *   - We only report counterfactuals where the result is strictly
 *     better. We don't generate "if this had been worse, you'd be RED"
 *     — those are alarmism, not insight.
 *   - We exclude `hardBlock` and `rehab` because those are coach
 *     decisions / clinical states, not measured signals — flipping them
 *     hypothetically isn't useful coaching information.
 */

import type { AthleteState } from "./types";
import { inferAthleteState, type InferStateInputs } from "./state";
import type { StreakContext } from "./sequence";

export type CounterfactualSignal =
  | "readiness"
  | "neural"
  | "injury"
  | "load"
  | "indoor_composite"
  | "indoor_mcburnie"
  | "indoor_acwr"
  | "decel"
  | "streak";

export type Counterfactual = {
  /** Which lever was flipped */
  signal: CounterfactualSignal;
  /** Human label of current value (e.g. "RED", "spike", "moderate") */
  currentValue: string;
  /** Human label of hypothetical best value (e.g. "GREEN", "typical", "none") */
  hypotheticalValue: string;
  /** What today's verdict would have been if this signal were at the best value */
  hypotheticalState: AthleteState;
  /** Numeric impact score: higher = bigger improvement.
   *   3 = RED→GREEN
   *   2 = RED→YELLOW
   *   1 = YELLOW→GREEN
   * Used for ranking counterfactuals (most impactful first). */
  impact: 1 | 2 | 3;
  /** Bilingual descriptions (UI picks one based on lang) */
  descriptionEN: string;
  descriptionIS: string;
};

const STATE_RANK: Record<AthleteState, number> = {
  RED: 3,
  YELLOW: 2,
  GREEN: 1,
  GRAY: 0,
};

function impactOf(actual: AthleteState, hypo: AthleteState): 0 | 1 | 2 | 3 {
  // RED→GREEN = 3, RED→YELLOW = 2, YELLOW→GREEN = 1, no change = 0
  const diff = STATE_RANK[actual] - STATE_RANK[hypo];
  if (diff <= 0) return 0;
  if (actual === "RED" && hypo === "GREEN") return 3;
  if (actual === "RED" && hypo === "YELLOW") return 2;
  if (actual === "YELLOW" && hypo === "GREEN") return 1;
  return 0;
}

type LeverDef = {
  signal: CounterfactualSignal;
  /** Returns null when this lever is already at its best value (no
   * counterfactual to compute). Otherwise returns the modified inputs +
   * labels for the message. */
  apply: (inputs: InferStateInputs) => {
    flipped: InferStateInputs;
    currentLabel: string;
    bestLabel: string;
    descriptionEN: (hypoState: AthleteState) => string;
    descriptionIS: (hypoState: AthleteState) => string;
  } | null;
};

const LEVERS: LeverDef[] = [
  // ── readiness ─────────────────────────────────────────────
  {
    signal: "readiness",
    apply: (i) => {
      if (i.readinessState === "GREEN" || i.readinessState === "GRAY") return null;
      const cur = i.readinessState;
      return {
        flipped: { ...i, readinessState: "GREEN" },
        currentLabel: cur,
        bestLabel: "GREEN",
        descriptionEN: (h) =>
          `If readiness had been GREEN (not ${cur}) → ${h}`,
        descriptionIS: (h) =>
          `Ef readiness hefði verið GREEN (ekki ${cur}) → ${h}`,
      };
    },
  },
  // ── neural ─────────────────────────────────────────────
  {
    signal: "neural",
    apply: (i) => {
      if (i.neuralStatus !== "caution" && i.neuralStatus !== "suppressed") return null;
      const cur = i.neuralStatus;
      const curLbl = cur === "suppressed" ? "SUPPRESSED" : "CAUTION";
      return {
        flipped: { ...i, neuralStatus: "clear" },
        currentLabel: curLbl,
        bestLabel: "CLEAR",
        descriptionEN: (h) =>
          `If neuromuscular status had been CLEAR (not ${curLbl}) → ${h}`,
        descriptionIS: (h) =>
          `Ef taugavöðva-staða hefði verið CLEAR (ekki ${curLbl}) → ${h}`,
      };
    },
  },
  // ── injury ─────────────────────────────────────────────
  {
    signal: "injury",
    apply: (i) => {
      if (i.injurySeverity === "none" || i.injurySeverity === "low") return null;
      const cur = i.injurySeverity;
      const curLbl = cur.toUpperCase();
      return {
        flipped: { ...i, injurySeverity: "none" },
        currentLabel: curLbl,
        bestLabel: "NONE",
        descriptionEN: (h) =>
          `If injury risk had been NONE (not ${curLbl}) → ${h}`,
        descriptionIS: (h) =>
          `Ef meiðsli-áhætta hefði verið NONE (ekki ${curLbl}) → ${h}`,
      };
    },
  },
  // ── load (outdoor) ─────────────────────────────────────────
  {
    signal: "load",
    apply: (i) => {
      if (i.loadConcernLevel === "none" || i.loadConcernLevel === "low") return null;
      const cur = i.loadConcernLevel;
      const curLbl = cur.toUpperCase();
      return {
        flipped: { ...i, loadConcernLevel: "none" },
        currentLabel: curLbl,
        bestLabel: "NONE",
        descriptionEN: (h) =>
          `If load concern had been NONE (not ${curLbl}) → ${h}`,
        descriptionIS: (h) =>
          `Ef álagsáhyggja hefði verið NONE (ekki ${curLbl}) → ${h}`,
      };
    },
  },
  // ── indoor composite ────────────────────────────────────────
  {
    signal: "indoor_composite",
    apply: (i) => {
      if (i.indoorCompositeBand !== "spike" && i.indoorCompositeBand !== "heavy") return null;
      const cur = i.indoorCompositeBand;
      return {
        flipped: { ...i, indoorCompositeBand: "typical" },
        currentLabel: cur.toUpperCase(),
        bestLabel: "TYPICAL",
        descriptionEN: (h) =>
          `If indoor composite had been TYPICAL (not ${cur.toUpperCase()}) → ${h}`,
        descriptionIS: (h) =>
          `Ef inni-composite hefði verið TYPICAL (ekki ${cur.toUpperCase()}) → ${h}`,
      };
    },
  },
  // ── indoor McBurnie ─────────────────────────────────────────
  {
    signal: "indoor_mcburnie",
    apply: (i) => {
      if (i.indoorMcburnieFlag !== "yellow" && i.indoorMcburnieFlag !== "red") return null;
      const cur = i.indoorMcburnieFlag;
      return {
        flipped: { ...i, indoorMcburnieFlag: "green" },
        currentLabel: cur.toUpperCase(),
        bestLabel: "GREEN",
        descriptionEN: (h) =>
          `If indoor McBurnie had been GREEN (not ${cur.toUpperCase()}) → ${h}`,
        descriptionIS: (h) =>
          `Ef inni-McBurnie hefði verið GREEN (ekki ${cur.toUpperCase()}) → ${h}`,
      };
    },
  },
  // ── indoor ACWR ─────────────────────────────────────────────
  {
    signal: "indoor_acwr",
    apply: (i) => {
      if (i.indoorAcwrFlag !== "yellow" && i.indoorAcwrFlag !== "red") return null;
      const cur = i.indoorAcwrFlag;
      return {
        flipped: { ...i, indoorAcwrFlag: "green" },
        currentLabel: cur.toUpperCase(),
        bestLabel: "GREEN",
        descriptionEN: (h) =>
          `If indoor ACWR had been GREEN (not ${cur.toUpperCase()}) → ${h}`,
        descriptionIS: (h) =>
          `Ef inni-ACWR hefði verið GREEN (ekki ${cur.toUpperCase()}) → ${h}`,
      };
    },
  },
  // ── decel intelligence ─────────────────────────────────────
  {
    signal: "decel",
    apply: (i) => {
      if (i.decelOverallFlag !== "yellow" && i.decelOverallFlag !== "red") return null;
      const cur = i.decelOverallFlag;
      return {
        flipped: { ...i, decelOverallFlag: "green" },
        currentLabel: cur.toUpperCase(),
        bestLabel: "GREEN",
        descriptionEN: (h) =>
          `If Decel Intelligence had been GREEN (not ${cur.toUpperCase()}) → ${h}`,
        descriptionIS: (h) =>
          `Ef Decel Intelligence hefði verið GREEN (ekki ${cur.toUpperCase()}) → ${h}`,
      };
    },
  },
];

/**
 * Compute counterfactual "what-if" alternatives for a given verdict.
 *
 * @param actualState - today's final verdict (after streak escalation)
 * @param inferInputs - the exact inputs passed to inferAthleteState today
 * @param streakContext - optional streak context; used to special-case
 *   the chronic-yellow→red lever, which lives outside inferAthleteState
 * @param maxResults - cap on number of counterfactuals returned (default 3)
 *
 * @returns counterfactuals sorted by impact descending. Empty array
 *   when athleteState is GREEN/GRAY (no counterfactuals make sense) or
 *   when no single-lever flip improves the verdict.
 */
export function computeCounterfactuals(
  actualState: AthleteState,
  inferInputs: InferStateInputs,
  streakContext?: StreakContext | null,
  maxResults = 3,
): Counterfactual[] {
  // Counterfactuals only meaningful for non-GREEN, non-GRAY verdicts.
  // (GREEN players don't need "why aren't I worse" explanations.)
  if (actualState === "GREEN" || actualState === "GRAY") return [];

  const out: Counterfactual[] = [];

  // ── Streak escalation lever (special-cased) ──────────────────
  // If the chronic-yellow streak escalated to RED, the obvious
  // counterfactual is "without the streak, today would be YELLOW".
  // Compute it first because this is usually the dominant lever.
  if (streakContext?.escalationApplied === "yellow_streak_to_red") {
    // Without escalation, the preliminary state would have been YELLOW
    // (because escalation only fires when preliminary == YELLOW).
    const hypoState: AthleteState = "YELLOW";
    const imp = impactOf(actualState, hypoState);
    if (imp !== 0) {
      out.push({
        signal: "streak",
        currentValue: `${streakContext.consecutiveYellow}-day yellow streak`,
        hypotheticalValue: "no chronic pattern",
        hypotheticalState: hypoState,
        impact: imp,
        descriptionEN: `Without the ${streakContext.consecutiveYellow}-day yellow streak → YELLOW (today's signals alone are not RED)`,
        descriptionIS: `Án ${streakContext.consecutiveYellow}-daga gulu rákarinnar → YELLOW (dagsmerkin ein og sér eru ekki RED)`,
      });
    }
  }

  // ── Single-lever flips through inferAthleteState ──────────────
  for (const lever of LEVERS) {
    const flip = lever.apply(inferInputs);
    if (!flip) continue;
    const hypoState = inferAthleteState(flip.flipped);
    const imp = impactOf(actualState, hypoState);
    if (imp === 0) continue;
    out.push({
      signal: lever.signal,
      currentValue: flip.currentLabel,
      hypotheticalValue: flip.bestLabel,
      hypotheticalState: hypoState,
      impact: imp,
      descriptionEN: flip.descriptionEN(hypoState),
      descriptionIS: flip.descriptionIS(hypoState),
    });
  }

  // Sort by impact desc, then by signal name for stable ordering
  out.sort((a, b) => {
    if (b.impact !== a.impact) return b.impact - a.impact;
    return a.signal.localeCompare(b.signal);
  });

  return out.slice(0, maxResults);
}
