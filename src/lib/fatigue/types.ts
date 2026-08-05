export type FatigueType = "NONE" | "SYSTEMIC" | "NEURAL" | "TISSUE" | "MIXED";
export type FatigueSeverity = "LOW" | "MODERATE" | "HIGH";
export type FatigueConfidence = "LOW" | "MEDIUM" | "HIGH";
export type FatigueDriverCategory = "NEURAL" | "TISSUE" | "SYSTEMIC";

export type FatigueDriver = {
  code: string;
  label: string;
  points: number;
  category: FatigueDriverCategory;
  /** Optional Icelandic label — the CMJ evidence layer emits bilingual drivers so
   *  the fatigue UI can render EN/IS. Legacy drivers leave this undefined. */
  labelIs?: string;
  /** Optional phase-metric key this driver quotes (e.g. "peakPower"). */
  metric?: string;
  /** Optional paper citation for the driver's signal (shown behind a tooltip). */
  citation?: string;
  /** Optional plain-language detail, e.g. "−9.4% vs baseline (noise floor 4.1%)". */
  detail?: string;
};

/** Multi-day CMJ rebound shape: central fatigue recovers in hours (fast), while
 *  peripheral/tissue fatigue lingers 48–72 h (slow). Carroll, Taylor & Gandevia
 *  2017; Silva 2018. "unknown" = not enough post-match jumps to judge. */
export type CmjRecoverySlope = "fast" | "slow" | "unknown";

/** One CV-gated CMJ driver, pre-split onto the neural or tissue axis by the pure
 *  mapper (`cmjEvidence.ts`). Carries everything the classifier needs to emit a
 *  labelled, cited FatigueDriver — it never recomputes the jump itself. */
export type CmjDriverSeed = {
  code: string;
  metric: string;
  points: number;
  category: "NEURAL" | "TISSUE";
  labelEn: string;
  labelIs: string;
  detail?: string;
  citation: string;
};

/** Measured-CMJ evidence folded into the fatigue-type split. Present only when a
 *  VALD CMJ pipeline ran for the player; `hasData` is false when that pipeline
 *  ran but found no recent, mature, CV-gated jump (→ no drivers, lower
 *  confidence — never a silent "no neural fatigue"). */
export type CmjFatigueEvidence = {
  hasData: boolean;
  neuralDrivers: CmjDriverSeed[];
  tissueDrivers: CmjDriverSeed[];
  recoverySlope: CmjRecoverySlope;
};
export type TrainingModifier =
  | "NEURAL_LOW_DENSITY"
  | "NEURAL_LOW_CONTACT"
  | "NEURAL_EXTENDED_REST"
  | "KEEP_QUALITY_HIGH"
  | "ADD_NEURAL_RESET"
  | "TISSUE_SWAP_BALLISTIC"
  | "TISSUE_PROTECT_ACHILLES"
  | "TISSUE_PROTECT_HAMSTRING"
  | "TISSUE_PROTECT_PATELLAR"
  | "ADD_TENDON_RELOAD"
  | "SYSTEMIC_REDUCE_VOLUME"
  | "SYSTEMIC_SIMPLIFY_SESSION"
  | "SYSTEMIC_RECOVERY_BIAS";

export type PainLocation =
  | "ACHILLES"
  | "HAMSTRING"
  | "PATELLAR"
  | "GROIN"
  | "CALF"
  | "ADDUCTOR"
  | "OTHER"
  | null;

export type FatigueInput = {
  playerId: string;
  playerName?: string;

  energy: number | null;
  sleepQuality: number | null;
  sleepDuration: number | null;
  stress: number | null;
  soreness: number | null;

  totalScore: number | null;
  sten: number | null;
  zReadiness: number | null;
  deltaZ: number | null;

  lowStenDays: number;
  poorWellnessCount: number | null;

  hsrHighYesterday: boolean;
  accelHighYesterday: boolean;
  decelHighYesterday: boolean;
  totalDistanceHighYesterday: boolean;
  intensityHighYesterday: boolean;
  matchMinutesHigh: boolean;
  /** Actual minutes played in the most recent match (null = unknown). */
  matchMinutesPlayed: number | null;
  scheduleCongestion: boolean;
  travelFlag: boolean;

  hasPainFlag: boolean;
  painLocation: PainLocation;
  repeatedSameComplaint: boolean;
  localComplaintMatchesLoad: boolean;

  mdDay: string | null;
  teamVolatilityHigh: boolean;

  hasWellnessData: boolean;
  hasLoadData: boolean;

  /** Measured-CMJ evidence (from `vald/phaseChange` via `cmjEvidence.ts`). Optional:
   *  undefined = no CMJ pipeline for this player (non-VALD team; confidence
   *  unaffected). Provided-but-hasData-false = VALD team with no recent jump
   *  (confidence lowered). Descriptive only — never moves the readiness colour. */
  cmj?: CmjFatigueEvidence;
};

/** One driver in the compact, coach-facing neuromuscular-fatigue read. */
export type NeuromuscularFatigueDriver = {
  category: FatigueDriverCategory;
  labelEn: string;
  labelIs?: string;
  metric?: string;
  citation?: string;
  detail?: string;
};

/** Compact, descriptive neuromuscular-fatigue read surfaced on the coach decision
 *  response. The CMJ-fused NEURAL/TISSUE/SYSTEMIC classification — a labelled
 *  interpretation layer that NEVER moves the readiness colour. */
export type NeuromuscularFatigueRead = {
  primaryType: FatigueType;
  secondaryType: FatigueType;
  severity: FatigueSeverity;
  confidence: FatigueConfidence;
  /** True when a measured CMJ actually contributed to the split. */
  usedCmj: boolean;
  drivers: NeuromuscularFatigueDriver[];
};

export type FatigueClassification = {
  playerId: string;
  neuralScore: number;
  tissueScore: number;
  systemicScore: number;
  primaryFatigueType: FatigueType;
  secondaryFatigueType: FatigueType;
  severity: FatigueSeverity;
  confidence: FatigueConfidence;
  score: number;
  drivers: FatigueDriver[];
  recommendedModifiers: TrainingModifier[];
  debug: {
    dataCompleteness: number;
    scoreGap: number;
    mixedState: boolean;
  };
};
