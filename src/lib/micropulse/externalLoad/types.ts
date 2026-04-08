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

export type CatapultReadinessContext = {
  today: CatapultDailyLoadRow | null;
  baseline: CatapultExternalLoadBaseline;
  signals: CatapultExternalLoadSignals;
  modifier: CatapultReadinessModifier;
};
