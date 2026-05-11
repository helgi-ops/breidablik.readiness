/**
 * Strength Programming — Type definitions
 *
 * Individualized strength session generation for the MicroPulse decision
 * engine. Sits alongside autoSessionBuilder/ but goes deeper: exercise-
 * level prescriptions (not just block-level), data-driven substitutions,
 * and matchday-aware periodization (MD-4 / MD-3 / MD-2 / MD-1).
 *
 * Evidence base (research/ folder):
 *   - Cluster sets:        Tufano 2017, Hardee 2012, Pareja-Blanco 2017
 *   - French Contrast:     Cormie 2011, Liu 2023 (French Contrast for soccer)
 *   - Weightlifting deriv: Suchomel 2017, Comfort 2015/2018
 *   - VBT velocity caps:   Pareja-Blanco 2017, Sánchez-Medina 2011
 *   - Nordic hamstring:    van Dyk 2019 (51% hamstring injury reduction)
 *   - Copenhagen adductor: Harøy 2019 (41% groin injury reduction)
 *   - IMTP RFD:            Comfort 2018, Lake 2018
 *   - Microdosing:         Rønnestad 2023 (soccer congested weeks)
 */

/** Position in the microcycle relative to next match. */
export type MdContext = "MD-4" | "MD-3" | "MD-2" | "MD-1" | "MD+1" | "MD+2" | "OFF";

/** Broad category for exercise selection and substitution logic. */
export type ExerciseCategory =
  | "MOVEMENT_PREP"
  | "EXPLOSIVE_OLYMPIC"      // Mid-thigh pull, snatch, clean, jump shrug
  | "PLYOMETRIC"             // Box jump, depth jump, broad jump
  | "BALLISTIC"              // Trap-bar jump squat, KB swing
  | "MED_BALL"               // Rotational throw, slam
  | "COMPOUND_STRENGTH"      // Squat, DL, hip thrust
  | "UNILATERAL_STRENGTH"    // Split squat, B-stance RDL
  | "POSTERIOR_CHAIN"        // Nordic, RDL
  | "ADDUCTOR"               // Copenhagen
  | "ISOMETRIC_MAX"          // IMTP, iso squat 5s
  | "ISOMETRIC_LONG"         // Spanish squat, wall sit, long iso ham
  | "ACCESSORY"
  | "MOBILITY";

export type PrimaryChain = "POSTERIOR" | "ANTERIOR" | "FULL_BODY" | "UPPER" | "TRUNK";

/** Velocity-loss thresholds (Pareja-Blanco 2017): set is terminated when
 *  rep velocity drops by this % from the first rep. */
export type VelocityLossCap = 10 | 15 | 20 | 30 | null;

/** Per-MD-context dosing. */
export type ExerciseDose = {
  sets: number;
  /** Reps as string so we can represent ranges (e.g. "3-5") or holds ("30s"). */
  reps: string;
  /** Intensity — RPE 1–10, %1RM (e.g. "85% 1RM"), or %MVC for iso. */
  intensity: string;
  /** Rest between sets, in seconds or human label ("90s", "3 min"). */
  rest: string;
  /** Intra-rep rest for cluster set configs (Tufano 2017). null = traditional. */
  intraRepRestSec?: number | null;
  /** VBT auto-regulation cap. Stop set when bar velocity drops by this %. */
  velocityLossCap?: VelocityLossCap;
  /** Coaching cue / focus point. */
  cue?: string;
};

/** A canonical exercise in the library. */
export type Exercise = {
  id: string;
  nameEN: string;
  nameIS: string;
  /** Brief setup / technique note. */
  setup?: string;
  category: ExerciseCategory;
  primaryChain: PrimaryChain;
  /** Mechanical profile — drives substitution rules. */
  isUnilateral: boolean;
  hasEccentricLoad: boolean;
  hasMaxVelocity: boolean;
  hasHinge: boolean;
  isClusterCompatible: boolean;
  /** Technical complexity — drives progression suggestions for olympic lifts. */
  technicalDifficulty: "low" | "moderate" | "high";
  /** Default dosing per MD-context. Missing entry = not used on that day. */
  defaultDosing: Partial<Record<MdContext, ExerciseDose>>;
  /** Alternative exercise IDs for coach swap and auto-substitution. */
  alternatives?: string[];
  /** Conditions where this exercise should NOT be prescribed. */
  contraindications?: ContraIndication[];
  /** One-line evidence statement with citation. */
  evidence: string;
};

/** Triggers that should EXCLUDE an exercise from a session. */
export type ContraIndication =
  | "hamstring_injury"
  | "groin_injury"
  | "knee_injury"
  | "lower_back_pain"
  | "ankle_injury"
  | "shoulder_injury"
  | "high_decel_burden"        // Skip heavy eccentric when decel burden HIGH 3+ days
  | "vbt_suppressed"           // Skip max-velocity work when VBT decrement > 20%
  | "sprint_speed_dropped"     // Skip max-velocity work when speed drop > 7%
  | "sore_hamstrings"
  | "sore_lower_back"
  | "sore_quads"
  | "sore_groin";

/** A prescribed exercise inside a generated session — Exercise + dose +
 *  rationale for any modifications applied. */
export type PrescribedExercise = {
  exerciseId: string;
  nameEN: string;
  nameIS: string;
  category: ExerciseCategory;
  dose: ExerciseDose;
  /** Substitution / modification reason ("Swapped from Nordic — sore hamstrings"). */
  modificationReason?: string | null;
  /** Whether this is added by an adaptation rule (not in base template). */
  isAdaptiveAddition?: boolean;
  /** Brief sport-science rationale shown in UI tooltip. */
  rationale?: string;
};

/** A block of related exercises (e.g. "Power Primer", "Compound Strength"). */
export type SessionBlock = {
  id: string;
  /** EN+IS titles. */
  titleEN: string;
  titleIS: string;
  type: "PREP" | "POWER_PRIMER" | "COMPOUND" | "ACCESSORY" | "UNILATERAL"
      | "POSTERIOR" | "ADDUCTOR" | "ISO_FINISH" | "MOBILITY"
      | "FRENCH_CONTRAST" | "MED_BALL";
  exercises: PrescribedExercise[];
  /** Brief block-level coaching note. */
  noteEN?: string;
  noteIS?: string;
};

/** Complete prescribed strength session for one player on one MD-context. */
export type StrengthSession = {
  playerId: string;
  playerName?: string;
  mdContext: MdContext;
  templateId: string;
  /** Total estimated session duration in minutes. */
  durationMin: number;
  /** Whether VBT auto-regulation is active (requires GymAware). */
  vbtAutoRegulated: boolean;
  /** Whether session is in compressed (microdosing) mode for congested weeks. */
  isCompressed: boolean;
  blocks: SessionBlock[];
  /** Summary of what was modified vs base template, for coach review. */
  appliedAdaptations: AppliedAdaptation[];
  /** Coach-facing one-liner ("Cluster-set strength block tuned for Magnús — Nordic kept, max-velocity replaced with iso due to sprint drop"). */
  summaryEN: string;
  summaryIS: string;
  /** Confidence in the personalization (0–1) — driven by data availability. */
  confidence: number;
  /** Coach can override any exercise; this stores manual edits for next week. */
  coachOverrides?: Record<string, string>;
};

/** Audit trail of which adaptation rules fired. */
export type AppliedAdaptation = {
  ruleId: string;
  triggerEN: string;
  triggerIS: string;
  actionEN: string;
  actionIS: string;
  evidence: string;
};

/** All player signals consumed by the strength engine. */
export type PlayerStrengthSnapshot = {
  playerId: string;
  playerName?: string;
  todayIso: string;
  mdContext: MdContext;
  /** Acute verdict from main decision engine. */
  verdict: "FULL" | "MODIFIED" | "REDUCED" | "RECOVERY" | "HOLD" | null;
  /** Sprint Speed Drop % today vs personal peak (Edouard 2019). */
  sprintSpeedDropPct: number | null;
  /** Sprint Exposure band (Malone 2018). */
  sprintExposureBand:
    | "UNDERLOAD" | "WATCH" | "SAFE" | "OVERLOAD" | "INSUFFICIENT_DATA" | null;
  /** CoD L/R asymmetry % over 14d (Bishop 2020). */
  codAsymmetryPct: number | null;
  /** Which leg is weaker for CoD ("L" or "R"). */
  codWeakerSide?: "L" | "R" | null;
  /** Decel burden band today (McBurnie 2022). */
  decelBurdenBand: "low" | "moderate" | "elevated" | "high" | null;
  /** Days in a row of HIGH decel burden — drives eccentric reduction. */
  decelBurdenHighStreakDays: number;
  /** Wellness readiness (1–5 scale, 5 best). */
  wellness: {
    sleepQuality: number | null;
    muscleSoreness: number | null;
    fatigueEnergy: number | null;
    stressMood: number | null;
    soreAreas: string[];
  };
  /** VBT velocity decrement (0 = baseline, -0.20 = 20% slower). */
  vbtDecrement: number | null;
  /** Injury / RTP status. */
  injuryStatus: "injured" | "rehabilitation" | "rtp_training" | "cleared" | null;
  /** Foster Monotony (Foster 1998). */
  fosterMonotony: number | null;
  /** Foster Strain. */
  fosterStrain: number | null;
  /** Is this a congested week (≥ 2 matches in 7 days)? Triggers compressed mode. */
  isCongestedWeek: boolean;
  /** Optional 1RM lookups for %1RM mode (only set if coach has entered them). */
  oneRepMaxes?: Record<string, number>;
};
