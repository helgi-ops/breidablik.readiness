export type CatapultAthlete = {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
};

export type CatapultActivity = {
  id: string;
  date: string;
  name?: string | null;
};

export type CatapultSessionMetric = {
  athleteId: string;
  date: string;
  totalDistance: number;
  highSpeedDistance: number;
  sprintDistance: number;
  accelerations: number;
  decelerations: number;
  playerLoad: number;
  maxVelocity: number;
  velocityBand5TotalDistance?: number | null;
  velocityBand6TotalDistance?: number | null;
  velocityBand4TotalEffortsGen2?: number | null;
  velocityBand5TotalEffortsGen2?: number | null;
  velocityBand6TotalEffortsGen2?: number | null;
  hirDist?: number | null;
  maxVel?: number | null;
  accelB23TotEffsGen2?: number | null;
  totAs?: number | null;
  decelB23TotEffsGen2?: number | null;
  totDs?: number | null;
  totalPlayerLoad?: number | null;
  playerLoadPerMinute?: number | null;
  metabolicPower?: number | null;       // avg metabolic power W/kg
  metabolicPowerPeak?: number | null;   // peak metabolic power W/kg
  highMetabolicLoadDistanceM?: number | null; // HMLD metres
  metabolicEnergyKj?: number | null;    // energy expenditure kJ
  timeAboveHmlThresholdS?: number | null; // seconds above HML threshold
  metabolicPowerGen?: string | null;    // 'gen1' | 'gen2' | 'unknown'
  metabolicDataValid?: boolean;         // true only when ≥1 major field present + GNSS valid
  explosiveDistance?: number | null;
  imaAccel?: number | null;
  imaDecel?: number | null;
  imaCod?: number | null;
  imaTotal?: number | null;
  codEvents?: number | null;
  impacts?: number | null;
  imaDebug?: {
    interestingKeys: string[];
    matched: {
      accel: string[];
      decel: string[];
      cod: string[];
      impacts: string[];
      playerloadPerMin: string[];
      imaTotal: string[];
      codEvents: string[];
    };
    derived: {
      imaTotal: "direct" | "fallback_sum" | "missing";
      codEvents: "direct" | "fallback_from_ima_cod" | "missing";
      playerloadPerMin: "direct" | "derived_from_playerload_duration" | "missing";
    };
  };
  activityId?: string | null;
  // Football Movement Profile (FMP) — inertial sensor, works indoors
  fmpVeryLowS?: number | null;
  fmpLowIntensityS?: number | null;
  fmpRunningMediumS?: number | null;
  fmpRunningHighS?: number | null;
  fmpDynamicLowS?: number | null;
  fmpDynamicMediumS?: number | null;
  fmpDynamicHighS?: number | null;
  fmpTotalDurationS?: number | null;
  // Heart Rate
  avgHeartRate?: number | null;
  maxHeartRate?: number | null;
  hrZone1TimeS?: number | null;
  hrZone2TimeS?: number | null;
  hrZone3TimeS?: number | null;
  hrZone4TimeS?: number | null;
  hrZone5TimeS?: number | null;
  // Session duration in minutes (from Catapult GPS)
  durationMinutes?: number | null;
  // IMA Free Running 8-band pipeline (indoor stride detail, IMU-only, no GPS required)
  imaFrBand1StrideCount?: number | null;
  imaFrBand1AvgStrideRate?: number | null;
  imaFrBand1TotalPlayerLoad?: number | null;
  imaFrBand2StrideCount?: number | null;
  imaFrBand2AvgStrideRate?: number | null;
  imaFrBand2TotalPlayerLoad?: number | null;
  imaFrBand3StrideCount?: number | null;
  imaFrBand3AvgStrideRate?: number | null;
  imaFrBand3TotalPlayerLoad?: number | null;
  imaFrBand4StrideCount?: number | null;
  imaFrBand4AvgStrideRate?: number | null;
  imaFrBand4TotalPlayerLoad?: number | null;
  imaFrBand5StrideCount?: number | null;
  imaFrBand5AvgStrideRate?: number | null;
  imaFrBand5TotalPlayerLoad?: number | null;
  imaFrBand6StrideCount?: number | null;
  imaFrBand6AvgStrideRate?: number | null;
  imaFrBand6TotalPlayerLoad?: number | null;
  imaFrBand7StrideCount?: number | null;
  imaFrBand7AvgStrideRate?: number | null;
  imaFrBand7TotalPlayerLoad?: number | null;
  imaFrBand8StrideCount?: number | null;
  imaFrBand8AvgStrideRate?: number | null;
  imaFrBand8TotalPlayerLoad?: number | null;
};

export type NormalizedExternalLoad = {
  playerId: string;
  date: string;
  source: "catapult";
  externalAthleteId: string;
  externalLoad: {
    totalDistance: number | null;
    highSpeedDistance: number | null;
    sprintDistance: number | null;
    accelerations: number | null;
    decelerations: number | null;
    playerLoad: number | null;
    maxVelocity: number | null;
    velocityBand5TotalDistance?: number | null;
    velocityBand6TotalDistance?: number | null;
    velocityBand4TotalEffortsGen2?: number | null;
    velocityBand5TotalEffortsGen2?: number | null;
    velocityBand6TotalEffortsGen2?: number | null;
    hirDist?: number | null;
    maxVel?: number | null;
    accelB23TotEffsGen2?: number | null;
    totAs?: number | null;
    decelB23TotEffsGen2?: number | null;
    totDs?: number | null;
    totalPlayerLoad?: number | null;
    playerLoadPerMinute?: number | null;
    metabolicPower?: number | null;
    metabolicPowerPeak?: number | null;
    highMetabolicLoadDistanceM?: number | null;
    metabolicEnergyKj?: number | null;
    timeAboveHmlThresholdS?: number | null;
    metabolicPowerGen?: string | null;
    metabolicDataValid?: boolean;
    explosiveDistance?: number | null;
    imaAccel?: number | null;
    imaDecel?: number | null;
    imaCod?: number | null;
    imaTotal?: number | null;
    codEvents?: number | null;
    impacts?: number | null;
    // Football Movement Profile (FMP)
    fmpVeryLowS?: number | null;
    fmpLowIntensityS?: number | null;
    fmpRunningMediumS?: number | null;
    fmpRunningHighS?: number | null;
    fmpDynamicLowS?: number | null;
    fmpDynamicMediumS?: number | null;
    fmpDynamicHighS?: number | null;
    fmpTotalDurationS?: number | null;
    fmpDynamicMediumPct?: number | null;
    fmpDynamicHighPct?: number | null;
    fmpRunningHighPct?: number | null;
    // Heart Rate
    avgHeartRate?: number | null;
    maxHeartRate?: number | null;
    hrZone1TimeS?: number | null;
    hrZone2TimeS?: number | null;
    hrZone3TimeS?: number | null;
    hrZone4TimeS?: number | null;
    hrZone5TimeS?: number | null;
    // Session duration in minutes
    durationMinutes?: number | null;
    // IMA Free Running 8-band pipeline (indoor stride detail, IMU-only)
    imaFrBand1StrideCount?: number | null;
    imaFrBand1AvgStrideRate?: number | null;
    imaFrBand1TotalPlayerLoad?: number | null;
    imaFrBand2StrideCount?: number | null;
    imaFrBand2AvgStrideRate?: number | null;
    imaFrBand2TotalPlayerLoad?: number | null;
    imaFrBand3StrideCount?: number | null;
    imaFrBand3AvgStrideRate?: number | null;
    imaFrBand3TotalPlayerLoad?: number | null;
    imaFrBand4StrideCount?: number | null;
    imaFrBand4AvgStrideRate?: number | null;
    imaFrBand4TotalPlayerLoad?: number | null;
    imaFrBand5StrideCount?: number | null;
    imaFrBand5AvgStrideRate?: number | null;
    imaFrBand5TotalPlayerLoad?: number | null;
    imaFrBand6StrideCount?: number | null;
    imaFrBand6AvgStrideRate?: number | null;
    imaFrBand6TotalPlayerLoad?: number | null;
    imaFrBand7StrideCount?: number | null;
    imaFrBand7AvgStrideRate?: number | null;
    imaFrBand7TotalPlayerLoad?: number | null;
    imaFrBand8StrideCount?: number | null;
    imaFrBand8AvgStrideRate?: number | null;
    imaFrBand8TotalPlayerLoad?: number | null;
  };
  rawPayload?: unknown;
  activityCount?: number;
};

export type CatapultAthleteMapRecord = {
  catapultAthleteId: string;
  micropulsePlayerId: string;
  matchMethod: "manual" | "email" | "name";
  confidence: number;
  catapultAthleteName?: string | null;
  catapultEmail?: string | null;
  /** Team that owns the Catapult account this athlete_id came from. Required once multiple teams each run their own Catapult account to prevent athlete_id collisions across accounts. */
  sourceTeamId?: string | null;
};

export type CatapultSyncResult = {
  date: string;
  athletesFetched: number;
  activitiesFetched: number;
  statsFetched: number;
  normalizedCount: number;
  storedCount: number;
  unmatchedCount: number;
  warnings: string[];
  imaDebug?: Array<{
    athleteId: string;
    activityId?: string | null;
    matchedFields: CatapultSessionMetric["imaDebug"];
    normalized: {
      ima_accel: number | null;
      ima_decel: number | null;
      ima_cod: number | null;
      ima_total: number | null;
      cod_events: number | null;
      impacts: number | null;
      playerload_per_min: number | null;
    };
  }>;
};
