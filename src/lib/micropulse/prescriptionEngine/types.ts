export type PrescriptionState = "GREEN" | "YELLOW" | "RED" | "GRAY";
export type PrescriptionSessionMode = "full" | "modified" | "recovery" | "pending";

export type DriverContribution = {
  key: string;
  label: string;
  contribution: number;
  direction: "risk" | "protective" | "positive" | "negative";
  value?: number | null;
  note?: string;
};

export type TrainingAction = "FULL" | "MODIFIED" | "RECOVERY" | "HOLD";
export type ModificationLevel = "NONE" | "LIGHT" | "MODERATE" | "HEAVY";
export type IntensityCapBand = "NO_CAP" | "CAP_HIGH" | "CAP_MODERATE" | "CAP_LOW" | "RECOVERY_ONLY";
export type VolumeAdjustmentBand = "NO_REDUCTION" | "REDUCE_10" | "REDUCE_20" | "REDUCE_30" | "REDUCE_50";

export type ExposureGuidanceTag =
  | "ALLOW_MAX_SPEED"
  | "LIMIT_MAX_SPEED"
  | "LIMIT_DECELS"
  | "LIMIT_CONTACT"
  | "LIMIT_PLYOS"
  | "LIMIT_FIELD_MINUTES"
  | "LIMIT_GYM_INTENSITY"
  | "SKILL_ONLY"
  | "RECOVERY_MODALITIES";

export type RecoveryFocusTag =
  | "SLEEP"
  | "HYDRATION"
  | "SOFT_TISSUE"
  | "LOW_INTENSITY_AEROBIC"
  | "MOBILITY"
  | "DOWNREGULATION"
  | "TRAVEL_RECOVERY"
  | "NUTRITION"
  | "NO_EXTRA_RECOVERY_NEEDED";

export type MatchContextTag =
  | "PROTECT_FOR_MATCH"
  | "PUSH_TRAINING_ADAPTATION"
  | "MAINTAIN_READINESS"
  | "DELOAD_ACCUMULATION"
  | "RESTORE_AFTER_MATCH";

export type PrescriptionRuleHints = {
  // Future hook for team-specific rule customization without changing public output contract.
  teamRuleProfile?: string | null;
  sportProfile?: string | null;
  coachOverridePriority?: "strict_safety" | "balanced" | "aggressive" | null;
};

export type NormalizedPrescriptionInput = {
  playerId?: string;
  date?: string;

  readinessScore?: number | null;
  readinessState?: PrescriptionState | null;
  athleteState?: PrescriptionState | null;
  sessionMode?: PrescriptionSessionMode | null;

  injuryRiskScore?: number | null;
  injuryRiskBand?: "LOW" | "MODERATE" | "HIGH" | "CRITICAL" | null;
  performanceScore?: number | null;
  performanceBand?: "PEAK" | "READY" | "MANAGEABLE" | "FATIGUED" | "AT_RISK" | null;
  loadToleranceScore?: number | null;
  loadToleranceBand?: "TOLERATES_HIGH" | "TOLERATES_MODERATE" | "TOLERATES_LOW" | "RECOVERY_ONLY" | null;

  fatigueAccumulationScore?: number | null;
  fatigueAccumulationBand?: "LOW" | "BUILDING" | "ELEVATED" | "HEAVY" | null;
  instabilityWindowScore?: number | null;
  instabilityWindowBand?: "STABLE" | "WATCH" | "UNSTABLE" | "HIGHLY_UNSTABLE" | null;
  collapseRiskScore?: number | null;
  collapseRiskBand?: "LOW" | "WATCH" | "HIGH" | "CRITICAL" | null;
  peakWindowScore?: number | null;
  peakWindowBand?: "NOT_READY" | "APPROACHING" | "OPEN" | "PEAK" | null;
  trendDirection?: "IMPROVING" | "STABLE" | "WORSENING" | "SHARPLY_WORSENING" | null;

  neuralFatigueScore?: number | null;
  sorenessScore?: number | null;
  sleepScore?: number | null;
  stressScore?: number | null;
  energyScore?: number | null;
  moodScore?: number | null;
  rpe?: number | null;
  sessionLoad?: number | null;
  acuteLoad?: number | null;
  chronicLoad?: number | null;
  acuteChronicRatio?: number | null;
  zScore?: number | null;
  deltaZ?: number | null;
  volatility5d?: number | null;
  volatility7d?: number | null;
  matchCongestionScore?: number | null;
  travelLoadScore?: number | null;
  upcomingMatchInDays?: number | null;

  plannedSessionType?: "gym" | "field" | "match" | "recovery" | "mixed" | null;
  plannedSessionIntensity?: "low" | "moderate" | "high" | null;
  dayType?: "matchday" | "md+1" | "md+2" | "md-3" | "md-2" | "md-1" | "training" | "off" | null;
  weekDensity?: "low" | "normal" | "congested" | null;

  dataConfidence?: number | null;
  ruleHints?: PrescriptionRuleHints | null;
};

export type PrescriptionDecision = {
  action: TrainingAction;
  modificationLevel: ModificationLevel;
  intensityCap: IntensityCapBand;
  volumeAdjustment: VolumeAdjustmentBand;
  exposureGuidance: ExposureGuidanceTag[];
  recoveryFocus: RecoveryFocusTag[];
  matchContext: MatchContextTag[];
  coachInstruction: string;
  staffSummary: string;
  primaryDrivers: DriverContribution[];
  secondaryDrivers: DriverContribution[];
  confidence: number;
};

export type TeamPrescriptionSummary = {
  fullCount: number;
  modifiedCount: number;
  recoveryCount: number;
  holdCount: number;
  protectForMatchCount: number;
  recoveryFocusCount: number;
  limitedExposureCount: number;
  summaryText: string;
  actionGroups: {
    full: Array<{ playerId?: string; playerName?: string }>;
    modified: Array<{ playerId?: string; playerName?: string }>;
    recovery: Array<{ playerId?: string; playerName?: string }>;
    hold: Array<{ playerId?: string; playerName?: string }>;
  };
  highestConcernPlayers: Array<{ playerId?: string; playerName?: string; action: TrainingAction; severity: number }>;
};
