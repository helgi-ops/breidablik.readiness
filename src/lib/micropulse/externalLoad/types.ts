export type ExternalLoadState = "normal" | "elevated" | "high" | "unknown";
export type ExternalLoadDataQuality = "good" | "partial" | "insufficient";

export type CatapultDailyLoadRow = {
  playerId: string;
  teamId: string | null;
  date: string;
  totalDistance: number | null;
  hirDist: number | null;
  maxVelocity: number | null;
  accelerations: number | null;
  decelerations: number | null;
  playerLoad: number | null;
  playerLoadPerMinute: number | null;
  velocityBand5TotalDistance: number | null;
  velocityBand6TotalDistance: number | null;
  accelBand2to3Efforts: number | null;
  decelBand2to3Efforts: number | null;
  totalAccelerations: number | null;
  totalDecelerations: number | null;
  // FMP (Football Movement Profile) — inertial sensor, works indoors
  fmpDynamicMediumS: number | null;
  fmpDynamicHighS: number | null;
  fmpRunningHighS: number | null;
  fmpTotalDurationS: number | null;
  // IMA (also works indoors)
  imaTotal: number | null;
};

export type CatapultExternalLoadBaseline = {
  acute3d: {
    playerLoad: number;
    hirDist: number;
    decelLoad: number;
    accelLoad: number;
  };
  acute7d: {
    playerLoad: number;
    hirDist: number;
    decelLoad: number;
    accelLoad: number;
  };
  chronic28dAvg: {
    playerLoad: number;
    hirDist: number;
    decelLoad: number;
    accelLoad: number;
    maxVelocity: number;
    densityStress: number;
    band6Distance: number;
    /** High-intensity decel efforts (Band 2-3), 28d average. */
    highDecelEfforts: number;
    /** High-intensity accel efforts (Band 2-3), 28d average. */
    highAccelEfforts: number;
    /** Total distance 28d average (for HID% baseline). */
    totalDistance: number;
    // FMP (Indoor Mode)
    fmpDynamicHighS: number;
    fmpDynamicMediumS: number;
    fmpRunningHighS: number;
    imaTotal: number;
  };
  availability: {
    daysAvailable7d: number;
    daysAvailable28d: number;
  };
};

/** Load profile classification based on accel:decel ratio. */
export type LoadProfileType = "eccentric_dominant" | "balanced" | "concentric_dominant";

/** Deceleration burden band (independent from NBS). */
export type DecelBurdenBand = "low" | "moderate" | "elevated" | "high";

/** Residual Decel Index band (3-day weighted accumulation). */
export type ResidualDecelBand = "NORMAL" | "ELEVATED" | "CAUTION" | "HIGH";

export type CatapultExternalLoadSignals = {
  playerLoadSpike: number | null;
  hirSpike: number | null;
  decelSpike: number | null;
  accelSpike: number | null;
  maxVelocityExposureRatio: number | null;
  densityStressRatio: number | null;
  band6ExposureRatio: number | null;
  neuromuscularBurdenScore: number | null;
  externalLoadState: ExternalLoadState;
  dataQuality: ExternalLoadDataQuality;
  // FMP indoor signals (only populated when indoor_mode = true)
  fmpDynamicHighSpike: number | null;
  fmpDynamicMediumSpike: number | null;
  fmpRunningHighSpike: number | null;
  imaTotalSpike: number | null;

  // ── Deceleration-specific metrics (McBurnie et al. 2022) ──────────

  /**
   * Standalone high-intensity deceleration burden score (0–1).
   * Unlike NBS (which blends decel into a composite), this isolates
   * the eccentric/braking load as an independent KPI.
   * Driven by high-intensity decel spike (Band 2-3 efforts) and
   * total decel spike relative to 28d baseline.
   */
  decelBurdenScore: number | null;
  /** Categorical band for decel burden. */
  decelBurdenBand: DecelBurdenBand | null;

  /**
   * Accel ÷ Decel ratio from high-intensity band efforts.
   * < 0.7  → eccentric-dominant (COD/stopping heavy, hamstring/calf risk)
   * 0.7–1.3 → balanced
   * > 1.3  → concentric-dominant (sprint/accel heavy, glute/quad load)
   * Null when either effort count is zero or unavailable.
   */
  accelDecelRatio: number | null;
  /** Load profile classification from accel:decel ratio. */
  loadProfile: LoadProfileType | null;

  /**
   * High-Intensity Distance as percentage of total distance (0–1).
   * HIR (Band5 + Band6) ÷ totalDistance.
   * Declining HID% over time with stable total distance signals fatigue.
   */
  hidPercentage: number | null;
};

export type ExternalLoadExplanation = {
  code: string;
  severity: "info" | "moderate" | "high";
  message: string;
};

export type CatapultReadinessModifier = {
  scoreDelta: number;
  suggestedStateShift: 0 | 1 | 2;
  cautionFlags: string[];
  explanations: ExternalLoadExplanation[];
};

export type ResidualDecelResult = {
  /** Weighted 3-day decel accumulation score. */
  residualDecel: number | null;
  /** Band classification. */
  residualDecelBand: ResidualDecelBand | null;
};

/** HID% fatigue trend result (today vs 7-day rolling average). */
export type HidTrendResult = {
  /** Today's HID% (0–1). */
  hidToday: number | null;
  /** 7-day rolling average HID% (0–1). */
  hidAvg7d: number | null;
  /**
   * Relative decline percentage (0–1 scale, e.g. 0.25 = 25% drop).
   * Positive means today is LOWER than average (fatigue signal).
   * Null when either today or avg is unavailable.
   */
  hidDeclinePct: number | null;
  /** True when decline ≥ 20% AND total distance is stable (not a rest day). */
  hidFatigueFlag: boolean;
};

export type CatapultReadinessContext = {
  today: CatapultDailyLoadRow | null;
  baseline: CatapultExternalLoadBaseline;
  signals: CatapultExternalLoadSignals;
  modifier: CatapultReadinessModifier;
};
