/**
 * Player goal plan ("I want to improve my top speed / acceleration / braking / jump") — shared types.
 *
 * Pure and client-safe. The engine (`buildGoalPlan`) turns one player's own data into an 8-week ADD-ON plan:
 * two short sessions a week on top of team training, on its own card. It never changes "Today's session", the
 * readiness colour, a load target or a daily decision.
 *
 * Rules decide; there is no AI here. Every dose names its source, and every plan says which parts come from a
 * study and which are MicroPulse's own rule.
 */

import type { Bi } from "@/lib/micropulse/load/peakPeriod";

export type { Bi };

export type GoalQuality = "top_speed" | "acceleration" | "braking" | "jump";

export const GOAL_QUALITIES: GoalQuality[] = ["top_speed", "acceleration", "braking", "jump"];

export type GoalSport = "football" | "basketball" | "other";

/** How well the plan as a whole rests on research. */
export type GoalEvidence = "researched" | "partly" | "rule_of_thumb";

/** "full_text" = MicroPulse read the paper; "abstract" = only the abstract or a published summary. */
export type VerifiedFrom = "full_text" | "abstract";

export type GoalRef = { key: string; short: string; cite: string; verifiedFrom: VerifiedFrom };

/** One finding behind a method, with its source. */
export type GoalFinding = { text: Bi; ref: string };

/** One training method in a quality's library. */
export type GoalMethod = {
  key: string;
  label: Bi;
  /** One plain sentence: what it is and what it does. */
  summary: Bi;
  /** "trial" = tested in a training study; "review" = recommended by a review, not trialled; "rule" = MicroPulse. */
  basis: "trial" | "review" | "rule";
  dose: Bi;
  findings: GoalFinding[];
  caution?: Bi;
};

/** One block inside a session. Counters feed the safety checks. */
export type GoalBlock = {
  method: string;
  what: Bi;
  dose: Bi;
  /** Metres run flat out (build-up excluded). */
  flatOutM?: number;
  /** A run meant to reach top speed (counts for the 2-day rule). */
  topSpeed?: boolean;
  /** Foot contacts from jumps / bounds / landings. */
  contacts?: number;
  /** Hard stops from speed (braking drills). */
  hardStops?: number;
  /** Drop jumps from a box. */
  dropJumps?: boolean;
  /** Metres pulled with a sled (sled volume check). */
  sledM?: number;
  /** Must be done in the team warm-up with a coach there (flat-out sprints, hard stops, drop jumps). */
  supervised?: boolean;
  /** A test that measures progress. */
  test?: boolean;
};

export type GoalSessionSlot = "A" | "B" | "C";

export type GoalSession = {
  slot: GoalSessionSlot;
  focus: Bi;
  /** When it fits in the week (relative to the match). */
  when: Bi;
  minutes: number;
  blocks: GoalBlock[];
};

export type GoalWeek = { week: number; label: Bi; sessions: GoalSession[] };

export type GoalBlockReason =
  | "injured_or_rtt"
  | "goalkeeper"
  | "not_for_sport"
  | "sport_not_supported"
  | "player_inactive";

// ─── Input: the player's data, already read ────────────────────────────────

export type StrengthBand = "elite" | "good" | "average" | "below";

export type GoalPlanInput = {
  quality: GoalQuality;
  todayIso: string;
  sport: GoalSport;
  isGoalkeeper: boolean;
  isActive: boolean;
  /** null = date of birth unknown → treated as under 18 (most restricted). */
  ageYears: number | null;
  /** Marked injured / in rehab / in return-to-train, or the RTP engine says currently injured. */
  unavailable: boolean;
  /** In season: 2 add-on sessions a week; out of season up to 3. */
  inSeason: boolean;
  topSpeed: {
    level: "ok" | "due" | "long_gap";
    daysSince: number | null;
    refKmh: number;
    targetKmh: number;
    confidence: "high" | "moderate";
  } | null;
  sprintTimes: { s5: number | null; s10: number | null; s20: number | null; date: string } | null;
  cmj: { heightCm: number | null; rsiMod: number | null; date: string | null; heightBand: StrengthBand | null; rsiBand: StrengthBand | null } | null;
  strength: {
    /** IMTP relative peak force, N/kg. */
    imtpRelNkg: number | null;
    imtpBand: StrengthBand | null;
    /** Dynamic Strength Index tier (squad-relative when the squad has enough tests). */
    dsiTier: "ballistic" | "concurrent" | "max_strength" | null;
    dsiBasis: "squad" | "absolute" | null;
    date: string | null;
  } | null;
  braking: {
    /** McBurnie hard-braking load over 28 days vs own baseline. */
    overloadFlag: "green" | "yellow" | "red" | "unknown" | null;
    /** High-intensity change-of-direction L/R asymmetry over 14 days, %. */
    codAsymHighPct: number | null;
    codLean: "left" | "right" | "balanced" | null;
  } | null;
  /** Weaker leg from a VALD single-leg test (≥10% asymmetry), when one exists. */
  weakerLeg: { side: "left" | "right"; asymPct: number; test: string; date: string | null } | null;
  /**
   * The coach's choice of start (a branch key), logged with a reason. Used only when it is one of the starts the
   * safety rules allow for this player (`allowedStarts`); anything else falls back to the rule's start.
   */
  startOverride?: string | null;
};

// ─── Output ────────────────────────────────────────────────────────────────

export type GoalPlan = {
  quality: GoalQuality;
  engineVersion: string;
  contentVersion: string;
  status: "ok" | "blocked";
  blocked: { reason: GoalBlockReason; text: Bi } | null;
  /** Layer 0: one sentence. */
  verdict: Bi;
  /** Layer 1: 2–3 plain facts — the why. */
  facts: Bi[];
  branch: { key: string; label: Bi; why: Bi } | null;
  /** The start (one of `allowedStarts`); the branch key may add more (top speed adds the gym emphasis). */
  start: string | null;
  /** Set when the coach chose a different start than the rule: both branch keys. */
  startOverride: { rule: string; chosen: string } | null;
  /** "If X had been Y → a different start." */
  counterfactual: Bi | null;
  evidence: GoalEvidence;
  confidence: { level: "high" | "moderate" | "low"; used: Bi[]; missing: Bi[] };
  sessionsPerWeek: number;
  /** Under 18 or age unknown: easier level, everything hard is supervised. */
  youthLevel: boolean;
  weeks: GoalWeek[];
  /** Which weeks hold a test, and what counts as real change. */
  tests: { weeks: number[]; what: Bi; change: Bi };
  supervision: Bi;
  safety: Bi[];
  /** No study tested this exact plan. */
  basis: Bi;
  /** "What the research does not show": honest limits, behind "Show details". */
  limits: Bi[];
  refs: GoalRef[];
};
