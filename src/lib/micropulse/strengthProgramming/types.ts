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
export type MdContext = "MD-5" | "MD-4" | "MD-3" | "MD-2" | "MD-1" | "MD+1" | "MD+2" | "MD+3" | "MD+4" | "OFF";

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
  | "UPPER_BODY"             // Press / pull — accessory (football) / primary (basketball)
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
  /** The sets were set by the week rule (weekRule.ts): the week's heavy sets are fixed, so the block's extra set
   *  is not added on top. Rides on the dose so it survives the team-list substitution (which keeps the dose). */
  weekRule?: true;
  /** The day's loaded explosive lift close to the match (weekRule.ts `applyNearMatchDose`): found again after the
   *  team list and the player's goal have put their own exercise in the spot (`finishNearMatch`). */
  nearMatch?: true;
  /** The bar-speed zone the week rule set close to the match (m/s, mean concentric velocity); max null = "or faster".
   *  Only on a lift with a bar, where a speed can be measured. */
  speedZone?: { min: number; max: number | null };
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
  /** The player chose this exercise from the team's list (player exercise picks, 2026-11-17). */
  playerPick?: true;
  /** A new exercise for this player, shown as a light intro in the warm-up (newExercise.ts, brief §6). */
  newIntro?: true;
  /** One more set because of the player's own strength goal (lota 2, 2026-11-17). */
  playerGoal?: true;
  /** Part of the player's 8-week goal plan, session B (gym), merged into the team session ("One session, one whole",
   *  2026-11-17, goalPlanGym.ts). The goal's dose is the dose: no other extra set lands on it. `slot`: which plan
   *  session (the gym-only goals merge A or B, 2026-11-18); absent = B. */
  goalPlan?: { quality: import("@/lib/micropulse/goalPlan/types").GoalQuality; week: number; slot?: import("@/lib/micropulse/goalPlan/types").GoalSessionSlot; giveBack?: true; nearMatch?: true };
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
  /** Structure-library id for this block's METHOD (e.g. "french-contrast",
   *  "tufano-cs2") — drives the "how to perform" guide on the player + coach card.
   *  Set by the structure builders; absent on the plain MD templates. */
  structureId?: string;
};

/** Complete prescribed strength session for one player on one MD-context. */
export type StrengthSession = {
  playerId: string;
  playerName?: string;
  mdContext: MdContext;
  /** Human-facing context label. Usually the mdContext, but "Strength" for basketball (which has no MD
   *  microcycle) so player notifications / chips don't show football jargon like "MD-4". */
  contextLabel?: string;
  templateId: string;
  /** Total estimated session duration in minutes. */
  durationMin: number;
  /** What MD-4's time budget took out (dayRules.ts TIME_BUDGET_TRIM, brief §6): whole exercises, or one set of B2
   *  (`sets: 1`, `setOnly`). Absent = nothing trimmed for time. */
  timeTrimmed?: Array<{ exerciseId: string; sets: number; role: "upper" | "C" | "B2"; setOnly?: true }>;
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
  /** Screen-driven correctives, merged as the session's FRONT block on serialize
   *  (strengthSessionToTodayStructure prepends them). Low-load, not set-reduced. */
  correctives?: SessionCorrective[];
  /** The team palette in force for this build (individualised only) — the
   *  serializer restricts each item's safe-swap `alternatives` to the coach's
   *  chosen pool, so a player only swaps to an exercise the coach approved. */
  teamPalette?: import("./palette").PaletteSlots;
  /** The team's per-MD method/Off map in force for this build — lets the meso layer equate the
   *  weekly volume onto the traditional lift days (the Off days are read from here). */
  mdStructures?: import("./structures").MdStructures;
  /** The meso block this session sits in (Accumulation / Transmutation / Realization / Deload) and
   *  the bounded volume tilt applied for it — set by applyBlockToSession (the meso layer). Absent when
   *  no block context was supplied (fully backwards-compatible). */
  blockEmphasis?: import("./blockEmphasis").BlockEmphasis;
  /** Exercises today's safety rules rule out for this player (taken out / swapped away, or a library
   *  contraindication hit by today's soreness / decel streak / sprint drop). The serializer drops them
   *  from the player's swap options, so a swap can't bring them back. Absent = none (2026-11-17). */
  blockedExerciseIds?: string[];
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
  /** CoD L/R asymmetry % over 14d from IMA (Bishop 2020). */
  codAsymmetryPct: number | null;
  /** Which leg is weaker for CoD ("L" or "R"). */
  codWeakerSide?: "L" | "R" | null;
  /** VALD limb asymmetry % (NordBord hamstring / ForceFrame hip / ForceDecks CMJ
   *  L/R), most severe recent test. A second symmetry source for uni/bi selection
   *  so teams with VALD but no IMA still get symmetry-driven work. Absent = none. */
  valdAsymmetryPct?: number | null;
  valdWeakerSide?: "L" | "R" | null;
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
  /** Minutes played in the most recent match BEFORE today (match_player_minutes).
   *  Only consumed on MD+1, where it drives the recovery-vs-rebuild tier
   *  (Carling 2018 — ~60 min match exposure = a recovery day next):
   *    ≥ 60 min  → protective iso lower-body + fresh-tissue upper-body strength;
   *    30–59 min → the measured recovery stim (default MD+1 template);
   *    < 30 min  → a real strength stimulus (they missed match load, Rønnestad 2023).
   *  Absent / null (no recent match or minutes never entered) → the engine keeps
   *  the fixed recovery template (fully backwards-compatible). */
  lastMatchMinutes?: number | null;
  /** True when the player was recorded DNP (did not play) in that match — treated
   *  as the low-minutes MD+1 tier regardless of the (usually null) minutes. */
  lastMatchDnp?: boolean;
  /** Team sport ("basketball" | "football" | …) — gates the upper-body block
   *  (primary for basketball). Absent → treated as football. */
  sport?: string | null;
  /** Season phase from week setup ("preseason" | "inseason" | …) — football gets
   *  the upper-body accessory only in preseason. Absent → treated as inseason. */
  seasonPhase?: string | null;
  /** Foster Monotony (Foster 1998). */
  fosterMonotony: number | null;
  /** Foster Strain. */
  fosterStrain: number | null;
  /** Is this a congested week (≥ 2 matches in 7 days)? Triggers compressed mode. */
  isCongestedWeek: boolean;
  /** Optional 1RM lookups for %1RM mode (only set if coach has entered them). */
  oneRepMaxes?: Record<string, number>;
  /** Strength emphases from the reconciled deficit ledger (moderate+ confidence
   *  only — hints don't auto-modify the session). Values are StrengthEmphasis
   *  strings ("plyometric" | "unilateral" | "eccentric" | …). Absent = no ledger
   *  input (fully backwards-compatible). */
  ledgerEmphases?: string[];
  /** Screen-driven correctives (movement-quality activation / mobility) merged as
   *  the session's front block, so the corrective and strength consumers arrive as
   *  ONE session (one override row), not two colliding sends. Absent = none. */
  correctives?: SessionCorrective[];
  /** The strength emphases the corrective block covers (comp → emphasis), for the
   *  CONFIRM-vs-ADD de-dup against ledgerEmphases. */
  correctiveEmphases?: string[];
  /** Team strength palette (per-slot exercise pool the coach picked). When present
   *  in individualised mode the engine builds the power/strength slots from THESE
   *  ids (symmetry chooses uni vs bi lower-body); absent → the built-in template
   *  exercises are used unchanged. Does not apply in standard mode. */
  teamPalette?: import("./palette").PaletteSlots;
  /** Team MD→method map (coach chose the training structure per MD day). When a
   *  configurable day (MD-4 / MD-3) has a NON-default method here, individualised
   *  mode lays that method out instead of the built-in template. Absent / default
   *  / other days → the built-in template. Does not apply in standard mode. */
  mdStructures?: import("./structures").MdStructures;
  /** Reps a set for the heavy lift, per heavy MD day (the coach's choice, weekRule.ts). The week rule fixes the day's
   *  heavy reps; this cuts them into sets (12 reps = 6 × 2 or 3 × 4). Absent / unset day → the method's own
   *  (2026-11-19). */
  mdRepsPerSet?: import("./weekRule").MdRepsPerSet;
  /** The player's own picks from the team list. They go first in their group when the palette fills the session;
   *  safety rules still win. Used only when the player takes part under the build's send mode (see
   *  `playerChoiceAccess`). Absent = no picks (2026-11-17). */
  playerExercisePicks?: import("./playerPicks").PlayerExercisePicks;
  /** The player's own strength goal (same rule as the picks). On the goal's days the matching exercise gets
   *  one more set, unless readiness / safety / a two-match week says no. Individualised mode only. Absent = no
   *  goal (lota 2, 2026-11-17). */
  playerStrengthGoal?: import("./playerPicks").StrengthGoal;
  /** Today's place in the season plan (resolveCurrentBlock), set by the send routes / coach preview before the
   *  build. The goal's extra set is building, so it only comes in pre-season / off-season, and not in a light
   *  (deload) or taper (realize) block. Absent → the week setup's `seasonPhase` decides; unknown → maintenance
   *  (2026-11-17). */
  goalSeason?: {
    phase: import("./seasonPhaseStrength").SeasonPhaseKey;
    blockGoal: import("./seasonPhaseStrength").BlockGoalKey | null;
  } | null;
  /** True when no match is scheduled from 4 days back to 5 days ahead (the MD day then defaults to MD-3). In
   *  pre-/off-season every strength session is then a goal day. Absent = a match is near, or the coach chose the
   *  MD day by hand (2026-11-17). */
  noMatchNearby?: true;
  /** The coach's weekday plan for weeks without a match (team_strength_palette.no_match_week): strength / power /
   *  light day or rest. Used only with `noMatchNearby` in the individualised modes; a strength day builds as MD-4,
   *  power as MD-3, light as MD-2 (structures.ts). Absent / empty = as before (MD-3) (2026-11-17). */
  noMatchWeek?: import("./structures").NoMatchWeek;
  /** Today's gym session of the player's 8-week goal plan (session B; either session for the gym-only goals), when
   *  the plan places it on this day (set by the send routes / coach preview from `goalPlan/gymLoader.ts`). Merged into
   *  the session only in pre-/off-season (goalPlanGym.ts). Absent = no plan, or no gym session today ("One session,
   *  one whole", 2026-11-17). */
  goalPlanGym?: import("./goalPlanGym").GoalPlanGym;
  /** The team's send mode + the coach's setting for this player (2026-11-17). When present, the engine uses the
   *  player's own input (picks, strength goal, goal plan gym session) only if the player takes part under the mode of
   *  the build (`sendMode.ts` takesPart). Absent (hand-built snapshots) → the input is used as given. */
  playerChoiceAccess?: PlayerChoiceAccess;
  /** The jump test on this week's test day that feeds today's dose (cmjDose.ts, brief §3): MD+3 for the heavy day,
   *  MD-2 (or MD-1 when MD-2 had none) for MD-2 / MD-1. Absent = no test that day, or no ready baseline. Never the
   *  readiness colour. */
  cmjTest?: import("./cmjDose").CmjDoseTest;
  /** The exercises this player has logged sets for (player_strength_set_log, last 120 days, warm-up sets included),
   *  read in the same query as the logged 1RMs. Absent = nothing logged: the new-exercise rule stays off
   *  (newExercise.ts, brief §6). */
  loggedExerciseIds?: string[];
  /** Fresh NordBord / ForceFrame hip adduction tests with the previous one (testAddons.ts, brief §4b): a drop or a
   *  left/right gap adds one Nordic / Copenhagen set, within the week's cap. Never the readiness colour. */
  strengthTests?: import("./testAddons").StrengthTests;
  /** The coach's newest decision on a left/right asymmetry (asymmetry_reviews, brief §4b): "swap" lets the
   *  asymmetry rules swap to one leg at a time for 28 days, "keep" keeps the lift. Absent = not reviewed → no swap. */
  asymmetryReview?: import("./asymmetryReview").AsymmetryReview;
  /** The latest overhead squat / single-leg balance findings (screenRules.ts, brief §4c), ≤ 56 days old, no pain or
   *  red flag. Absent = nothing that changes the session. */
  screenFlags?: import("./screenRules").ScreenFlags;
  /** This week's MD-4 session was sent and not done (missedDay.ts, brief §5). Set only by the coach's preview. It
   *  changes nothing in the session: MD-3 and later keep their own; the audit says so. */
  missedDay?: import("./missedDay").MissedDay;
};

/** See `PlayerStrengthSnapshot.playerChoiceAccess`. */
export type PlayerChoiceAccess = {
  teamMode: import("./sendMode").SendMode;
  /** The coach let this player in on another mode (test). */
  on: boolean;
  /** The coach took this player out of the goals mode. */
  off: boolean;
};

/** A screen-driven corrective rendered into the daily session's front block. Bi
 *  strings (name/dose/cue/source note) so serialization picks EN/IS at send time.
 *  Low-load activation/mobility — NOT readiness set-reduced. */
export type SessionCorrective = {
  slug: string;
  nameEN: string; nameIS: string;
  doseEN: string; doseIS: string;
  cueEN: string; cueIS: string;
  /** Provenance (movement screen + re-screen reminder) → the item's note. */
  sourceNoteEN: string; sourceNoteIS: string;
};
