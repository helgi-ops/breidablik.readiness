export type DecisionState = "GREEN" | "YELLOW" | "RED" | "GRAY";

export type SessionMode = "full" | "modified" | "recovery" | "pending";

export type RiskFlag =
  | "high_acwr"
  | "acwr_spike"
  | "load_spike"
  | "high_soreness"
  | "low_sleep"
  | "low_recovery"
  | "high_fatigue"
  | "high_stress"
  | "high_neural_strain"
  | "high_mechanical_load"
  | "injury_risk_elevated"
  | "injury_risk_high"
  | "missing_wellness"
  | "missing_load_data"
  | "recent_load_drop"
  | "high_hsr_exposure"
  | "high_accel_decel_exposure"
  | "manual_review"
  | "low_z";

export type DecisionConstraint =
  | "avoid_eccentric_overload"
  | "limit_high_speed_running"
  | "limit_total_volume"
  | "limit_accel_decel_density"
  | "avoid_max_intensity"
  | "technique_only"
  | "recovery_only"
  | "no_change";

export type DecisionFocus =
  | "full_training"
  | "reduced_volume"
  | "reduced_intensity"
  | "recovery_regeneration"
  | "mobility_and_activation"
  | "low_mechanical_stress"
  | "monitor_closely"
  | "sleep_recovery_emphasis"
  | "neural_reset"
  | "individual_modification";

export type ExplanationImpactDirection = "positive" | "negative" | "neutral";

export type ExplanationFactor = {
  key: string;
  label: string;
  value?: string | number | null;
  impactScore: number;
  direction: ExplanationImpactDirection;
  summary: string;
};

export type DecisionConfidenceBand = "low" | "medium" | "high";

export type DecisionConfidence = {
  score: number;
  band: DecisionConfidenceBand;
  reasons: string[];
};

export type DecisionInput = {
  athleteId: string;
  date: string;

  readinessState?: DecisionState | null;
  readinessScore?: number | null;

  injuryRiskState?: DecisionState | null;
  injuryRiskScore?: number | null;

  lightAteState?: DecisionState | null;

  wellness?: {
    soreness?: number | null;
    fatigue?: number | null;
    sleepQuality?: number | null;
    mood?: number | null;
    stress?: number | null;
    motivation?: number | null;
    recovery?: number | null;
    sessionRpePrevious?: number | null;
    missing?: boolean;
  } | null;

  load?: {
    dailyLoad?: number | null;
    weeklyLoad?: number | null;
    rolling7dAvg?: number | null;
    acuteLoad?: number | null;
    chronicLoad?: number | null;
    acwr?: number | null;
    loadDeltaVs7dAvg?: number | null;
    highSpeedRunningDistance?: number | null;
    velocityBand5Distance?: number | null;
    velocityBand6Distance?: number | null;
    totalAccelerations?: number | null;
    totalDecelerations?: number | null;
    accelDecelDensity?: number | null;
    zScore?: number | null;
    deltaZ?: number | null;
    missing?: boolean;
  } | null;

  context?: {
    sessionType?: string | null;
    phaseOfWeek?: string | null;
    daysToMatch?: number | null;
    daysSinceMatch?: number | null;
    manuallyFlagged?: boolean | null;
  } | null;
};

export type TrainingRecommendation = {
  state: DecisionState;
  sessionMode: SessionMode;
  loadAdjustment: number | null;
  constraints: DecisionConstraint[];
  focus: DecisionFocus[];
  riskFlags: RiskFlag[];

  explanationFactors: ExplanationFactor[];
  confidence: DecisionConfidence;

  coachSummary: string;
  playerSummary: string;

  dataQuality: {
    hasReadiness: boolean;
    hasInjuryRisk: boolean;
    hasWellness: boolean;
    hasLoad: boolean;
    usedLightAteFallback: boolean;
    requiresManualReview: boolean;
  };

  debug?: {
    inputStates: {
      readinessState?: DecisionState | null;
      injuryRiskState?: DecisionState | null;
      lightAteState?: DecisionState | null;
    };
    derived: Record<string, unknown>;
    matchedRules: string[];
  };
};
