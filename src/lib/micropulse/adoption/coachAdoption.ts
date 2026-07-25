/**
 * Coach adoption — "are you getting the most out of MicroPulse?"
 *
 * WHY THIS EXISTS
 * ---------------
 * The readiness verdict rests on inputs the coach controls: check-ins, week setup,
 * opening Today each morning. A coach who never checks in his squad, or hasn't
 * opened MicroPulse in a week, gets a weaker product — the colour runs on low
 * confidence — and today nothing tells him so. This module reads a coach's OWN
 * usage against auditable thresholds and returns at most ONE plain-language nudge:
 * the single worst gap, worst-first, with the signal that fired, the why, a
 * concrete next step, and — where the data supports it — a counterfactual and an
 * outcome tie-in.
 *
 * Same manifesto as every other surface: RULES DECIDE which nudge fires (this
 * module); the AI only phrases it, and invents no numbers. A brand-new coach with
 * too little history returns `insufficient` / low confidence — never a low score,
 * never a scold. A well-used account returns a null nudge — a quiet bubble is the
 * correct behaviour.
 *
 * PURE by design: no I/O. The data layer assembles the raw signals (from the
 * usage_events telemetry that ALREADY exists — role='COACH' + path — plus the
 * compliance view and coach_week_setup) and any real outcome tie-in; this module
 * only classifies. That keeps every threshold testable and every number honest.
 */

export type Bi = { en: string; is: string };

// ── Thresholds ───────────────────────────────────────────────────────────────
// Stated as constants so the triggers are auditable rather than buried in a
// comparison (mirrors dataQuality.ts). Each fires a nudge ONLY on a real breach.

/** Below this much usage history, the read is unreliable — say so, don't scold. */
export const MIN_HISTORY_DAYS = 14;
/** History beyond this makes the adoption read high-confidence rather than medium. */
export const MATURE_HISTORY_DAYS = 28;
/** No page view in this many days → the coach has gone dormant. */
export const DORMANT_DAYS = 6;
/** Fewer coach sessions/week than this reads as barely-using (dormant tier). */
export const MIN_SESSIONS_PER_WEEK = 1;
/** Sessions/week at or above this — combined with breadth — reads as strong use. */
export const STRONG_SESSIONS_PER_WEEK = 4;
/** Distinct pages opened at/above this signals real breadth of use. */
export const STRONG_DISTINCT_PATHS = 4;
/** Squad check-in share below this leaves the verdict running on low confidence. */
export const COMPLIANCE_LOW = 0.5;
/** A fall of this magnitude vs the previous window is a real compliance drop. */
export const COMPLIANCE_DROP = 0.25;
/** The compliance level above which verdict confidence stays high — the target. */
export const COMPLIANCE_HEALTHY = 0.7;

// ── Signals + tiers ──────────────────────────────────────────────────────────

/** The usage signal a nudge is based on — cited to the coach ("based on …"). */
export type AdoptionSignal =
  | "login_cadence"      // how recently / how often the coach opens MicroPulse
  | "checkin_compliance" // share of the squad checking in
  | "breadth"            // how much of the product the coach actually uses
  | "week_setup";        // is the upstream weekly input fed

/** A per-coach utilisation read. `insufficient` = not enough history to judge. */
export type AdoptionTier = "strong" | "partial" | "dormant" | "insufficient";

/** How much to trust the read — thin history is stated plainly, never scored low. */
export type Confidence = "high" | "medium" | "low";

/** Which nudge fired. Ordered worst-first in the classifier's guard ladder. */
export type NudgeKey =
  | "dormant"            // hasn't opened MicroPulse in DORMANT_DAYS+
  | "compliance_drop"    // check-ins low or falling — the core input is weakening
  | "week_not_set"       // no week setup — the system can't tell a match from a session
  | "unused_key_surface"; // never opened a deeper Intelligence page

const SIGNAL_LABEL: Record<AdoptionSignal, Bi> = {
  login_cadence: { en: "your logins", is: "innskráningar þínar" },
  checkin_compliance: { en: "squad check-ins", is: "líðanarskráningar hópsins" },
  breadth: { en: "which pages you use", is: "hvaða síður þú notar" },
  week_setup: { en: "this week's setup", is: "vikuuppsetning vikunnar" },
};

export interface AdoptionInput {
  /** Days of usage history available for this coach. < MIN → insufficient. */
  historyDays: number;
  /** Days since the coach's last page view. null = never seen. */
  daysSinceLastLogin: number | null;
  /** Average coach sessions per week over the window. */
  sessionsPerWeek: number;
  /** Distinct coach pages (paths) opened over the window. */
  distinctPathsOpened: number;
  /** Has the coach opened at least one deeper "*-intelligence" surface, ever? */
  openedAnyIntelligence: boolean;
  /** Is the current week configured in coach_week_setup? */
  weekSetupPresent: boolean;
  /** Squad check-in share this window, 0..1. */
  checkinComplianceNow: number;
  /** Squad check-in share the PREVIOUS window, 0..1 — null when not comparable. */
  checkinCompliancePrev: number | null;
  /**
   * A real, pre-computed outcome tie-in ("clubs that keep check-ins above 70% and
   * open Today daily keep verdict confidence high"), computed by the data layer
   * from usage × outcome. null when the sample is too thin — the module then omits
   * it rather than inventing one. The module NEVER fabricates this string.
   */
  outcomeTieIn: Bi | null;
}

export interface AdoptionNudge {
  key: NudgeKey;
  /** Warm, never accusatory. Highest is "attention", not "urgent". */
  severity: "info" | "encourage" | "attention";
  /** The usage signal this is based on — cited to the coach. */
  signal: AdoptionSignal;
  signalLabel: Bi;
  /** Plain-language why. Coach-readable, no jargon. */
  why: Bi;
  /** One concrete next step + a deep-link into the relevant page. */
  nextStep: { label: Bi; href: string };
  /** "If you did X, Y would improve" — from the threshold, no invented numbers. */
  counterfactual: Bi | null;
  /** Real outcome tie-in, or null when the sample is too thin to support a claim. */
  outcomeTieIn: Bi | null;
}

export interface AdoptionVerdict {
  tier: AdoptionTier;
  confidence: Confidence;
  /** At most one nudge — the single worst gap. null = nothing to say (quiet). */
  topNudge: AdoptionNudge | null;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const pct = (n: number) => Math.round(clamp01(n) * 100);

function deriveTier(inp: AdoptionInput): AdoptionTier {
  const dormant =
    (inp.daysSinceLastLogin != null && inp.daysSinceLastLogin >= DORMANT_DAYS) ||
    inp.sessionsPerWeek < MIN_SESSIONS_PER_WEEK;
  if (dormant) return "dormant";

  const strong =
    inp.sessionsPerWeek >= STRONG_SESSIONS_PER_WEEK &&
    inp.distinctPathsOpened >= STRONG_DISTINCT_PATHS &&
    inp.checkinComplianceNow >= COMPLIANCE_HEALTHY;
  if (strong) return "strong";

  return "partial";
}

/**
 * Pure. Read one coach's usage and return at most one nudge, worst-first.
 *
 * Order matters. Insufficient history is tested FIRST — we never scold a coach we
 * can't yet read. Then the nudge ladder runs most-severe-first: not opening the
 * product at all beats a weakening input beats a missing setup beats unused depth.
 * The first breach wins; a well-used account falls through to a null nudge.
 */
export function classifyAdoption(inp: AdoptionInput): AdoptionVerdict {
  // Too little history to judge. Low confidence, stated plainly — no nudge, no
  // score. Week 1 is not the time to tell a coach he's doing it wrong.
  if (inp.historyDays < MIN_HISTORY_DAYS) {
    return { tier: "insufficient", confidence: "low", topNudge: null };
  }

  const tier = deriveTier(inp);
  const confidence: Confidence = inp.historyDays >= MATURE_HISTORY_DAYS ? "high" : "medium";

  // 1) Dormant — the root problem. If he isn't opening it, nothing else matters.
  if (inp.daysSinceLastLogin != null && inp.daysSinceLastLogin >= DORMANT_DAYS) {
    return {
      tier, confidence,
      topNudge: {
        key: "dormant",
        severity: "attention",
        signal: "login_cadence",
        signalLabel: SIGNAL_LABEL.login_cadence,
        why: {
          en: `You haven't opened MicroPulse in ${inp.daysSinceLastLogin} days — the morning verdicts only help if you check them each day.`,
          is: `Þú hefur ekki opnað MicroPulse í ${inp.daysSinceLastLogin} daga — morgun-niðurstöðurnar hjálpa aðeins ef þú kíkir á þær daglega.`,
        },
        nextStep: {
          label: { en: "Open Today", is: "Opna Today" },
          href: "/coach",
        },
        counterfactual: {
          en: "A two-minute look each morning is all most days need.",
          is: "Tveggja mínútna kík á hverjum morgni er allt sem flestir dagar þurfa.",
        },
        outcomeTieIn: inp.outcomeTieIn,
      },
    };
  }

  // 2) Check-ins low or falling — the core input the whole verdict rests on.
  const dropped =
    inp.checkinCompliancePrev != null &&
    inp.checkinCompliancePrev - inp.checkinComplianceNow >= COMPLIANCE_DROP;
  if (inp.checkinComplianceNow < COMPLIANCE_LOW || dropped) {
    const prevClause =
      inp.checkinCompliancePrev != null ? ` (were ${pct(inp.checkinCompliancePrev)}%)` : "";
    const prevClauseIs =
      inp.checkinCompliancePrev != null ? ` (voru ${pct(inp.checkinCompliancePrev)}%)` : "";
    return {
      tier, confidence,
      topNudge: {
        key: "compliance_drop",
        severity: "attention",
        signal: "checkin_compliance",
        signalLabel: SIGNAL_LABEL.checkin_compliance,
        why: {
          en: `Check-ins are down to ${pct(inp.checkinComplianceNow)}%${prevClause}. The colour is running on low confidence — a start-of-day reminder is what drives it back up.`,
          is: `Líðanarskráningar eru komnar niður í ${pct(inp.checkinComplianceNow)}%${prevClauseIs}. Liturinn keyrir á lágu öryggi — morgunáminning er það sem lyftir honum aftur.`,
        },
        nextStep: {
          label: { en: "See who's missing", is: "Sjá hverja vantar" },
          href: "/coach?tab=load",
        },
        counterfactual: {
          en: `Keep check-ins above ${pct(COMPLIANCE_HEALTHY)}% and verdict confidence rises from low to high.`,
          is: `Haltu skráningum yfir ${pct(COMPLIANCE_HEALTHY)}% og öryggi niðurstöðunnar hækkar úr lágu í hátt.`,
        },
        outcomeTieIn: inp.outcomeTieIn,
      },
    };
  }

  // 3) Week not set — without it the system can't tell a match from a session.
  if (!inp.weekSetupPresent) {
    return {
      tier, confidence,
      topNudge: {
        key: "week_not_set",
        severity: "info",
        signal: "week_setup",
        signalLabel: SIGNAL_LABEL.week_setup,
        why: {
          en: "No week setup for this week — without it the system can't tell a match from a session, and the MD-day logic goes quiet.",
          is: "Engin vikuuppsetning fyrir þessa viku — án hennar getur kerfið ekki aðgreint leik frá æfingu, og MD-lógíkin þagnar.",
        },
        nextStep: {
          label: { en: "Set up this week", is: "Setja upp þessa viku" },
          href: "/coach/week-setup",
        },
        counterfactual: null,
        outcomeTieIn: null,
      },
    };
  }

  // 4) Never opened a deeper surface — a breadth nudge, gentlest of the four.
  if (!inp.openedAnyIntelligence) {
    return {
      tier, confidence,
      topNudge: {
        key: "unused_key_surface",
        severity: "info",
        signal: "breadth",
        signalLabel: SIGNAL_LABEL.breadth,
        why: {
          en: "You've never opened Load Intelligence — it's where overload shows up before it bites.",
          is: "Þú hefur aldrei opnað Load Intelligence — það er þar sem ofálag birtist áður en það bítur.",
        },
        nextStep: {
          label: { en: "Open Load Intelligence", is: "Opna Load Intelligence" },
          href: "/coach/load-intelligence",
        },
        counterfactual: null,
        outcomeTieIn: null,
      },
    };
  }

  // Well-used account, nothing weakening — the bubble stays quiet.
  return { tier, confidence, topNudge: null };
}
