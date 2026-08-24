/** One clock direction's event counts by intensity. */
export type ImaClockCell = { high: number | null; medium: number | null; low: number | null };
/** IMA directional grid: keys "1".."12" (clock o'clock direction) → intensity cell. */
export type ImaClock = Record<string, ImaClockCell>;

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
  /**
   * High-intensity-only decel count (band 3+, >3 m/s²) from Catapult's
   * "Decel B3+ Total # Efforts (Gen 2)" reporting parameter. Preferred by
   * McBurnie 2022 framework over the combined b2-3 metric because b2
   * (moderate, 2-3 m/s²) decels are biomechanical noise — only high-intensity
   * eccentric loading matches the injury-relevant demand of sprint braking.
   * Falls back to decelB23TotEffsGen2 in McBurnie SQL until populated.
   */
  decelB3PlusTotEffsGen2?: number | null;
  /**
   * IMA-based per-band decel counts. Catapult IMU exposes these as
   * ima_band1_decel_count / ima_band2_decel_count / ima_band3_decel_count.
   * Band 3 = high-intensity (>3 m/s²) — McBurnie 2022 preferred input.
   * Discovered 28 Apr 2026 via debug-fields probe when GPS-Gen2 b3 came back
   * empty but IMA band 3 was already in the base payload.
   */
  imaBand1DecelCount?: number | null;
  imaBand2DecelCount?: number | null;
  imaBand3DecelCount?: number | null;
  /**
   * Symmetric IMA accel counts. Required for McBurnie A:D coupling to pair
   * Band 3 vs Band 3 (apples-to-apples). Without these the engine compares
   * high-intensity decels to combined-intensity accels and ratios drop
   * artificially.
   */
  imaBand1AccelCount?: number | null;
  imaBand2AccelCount?: number | null;
  imaBand3AccelCount?: number | null;
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
  /** L/R CoD splits — sum of Left Low + Medium + High counts. Used for Bishop 2020 asymmetry. */
  imaCodLeft?: number | null;
  /** L/R CoD splits — sum of Right Low + Medium + High counts. */
  imaCodRight?: number | null;
  /** Per-intensity L/R CoD counts (Bishop 2020 — high-intensity asymmetry is
   *  the injury-relevant signal; low-tier is often a positional habit).
   *  Catapult intensity → numeric band: low=1, medium=2, high=3. */
  imaCodLeftHigh?: number | null;
  imaCodLeftMedium?: number | null;
  imaCodLeftLow?: number | null;
  imaCodRightHigh?: number | null;
  imaCodRightMedium?: number | null;
  imaCodRightLow?: number | null;
  imaClock?: ImaClock | null;
  imaTotal?: number | null;
  codEvents?: number | null;
  impacts?: number | null;
  jumps?: number | null;
  // Newly-added Reporting_Parameters (24 Aug 2026): RHIE + running mechanical.
  rhieBouts?: number | null;
  rhieEffortsPerBoutMean?: number | null;
  rhieEffortsPerBoutMax?: number | null;
  rhieEffortsPerBoutMin?: number | null;
  rhieEffortDurationMeanS?: number | null;
  rhieEffortRecoveryMeanS?: number | null;
  rhieBoutRecoveryMeanS?: number | null;
  runningSymmetry?: number | null;
  runningDeviation?: number | null;
  runningImbalance?: number | null;
  runningSeriesCount?: number | null;
  footstrikes?: number | null;
  imaDebug?: {
    interestingKeys: string[];
    matched: {
      accel: string[];
      decel: string[];
      cod: string[];
      codLeft?: string[];
      codRight?: string[];
      impacts: string[];
      jumps?: string[];
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
  /**
   * DIAGNOSTIC ONLY — not read by any feature. The source per-athlete parameter
   * object (`rawParams`, one athlete-activity, bounded) and the flattened key
   * names the mapper matched against (`paramKeys`). Persisted to
   * `raw_payload_json` + logged per sync run so we can SEE which OpenField
   * parameter names actually arrive — e.g. why avg HR / HR zones don't map
   * despite comprehensive aliases. Capture first, add the right alias second.
   */
  rawParams?: Record<string, unknown> | null;
  paramKeys?: string[] | null;
  // Football Movement Profile (FMP) — inertial sensor, works indoors
  fmpVeryLowS?: number | null;
  fmpLowIntensityS?: number | null;
  fmpRunningMediumS?: number | null;
  fmpRunningHighS?: number | null;
  fmpDynamicLowS?: number | null;
  fmpDynamicMediumS?: number | null;
  fmpDynamicHighS?: number | null;
  fmpTotalDurationS?: number | null;
  // Heart Rate — Catapult sends 8 HR bands (heart_rate_bandN_total_duration, s),
  // avg = mean_heart_rate, plus min HR and %HRmax/%HRavg (HRex submaximal signal).
  avgHeartRate?: number | null;
  maxHeartRate?: number | null;
  minHeartRate?: number | null;
  hrZone1TimeS?: number | null;
  hrZone2TimeS?: number | null;
  hrZone3TimeS?: number | null;
  hrZone4TimeS?: number | null;
  hrZone5TimeS?: number | null;
  hrZone6TimeS?: number | null;
  hrZone7TimeS?: number | null;
  hrZone8TimeS?: number | null;
  // Per-band average bpm — label so time-in-band reads as an HR range.
  hrZone1AvgBpm?: number | null;
  hrZone2AvgBpm?: number | null;
  hrZone3AvgBpm?: number | null;
  hrZone4AvgBpm?: number | null;
  hrZone5AvgBpm?: number | null;
  hrZone6AvgBpm?: number | null;
  hrZone7AvgBpm?: number | null;
  hrZone8AvgBpm?: number | null;
  pctMaxHeartRate?: number | null;
  pctAvgHeartRate?: number | null;
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

  /**
   * Metres run inside each high-cadence band (5-8). Never previously requested
   * from Catapult, yet read by six features via ima_fr_band58_total_distance.
   */
  imaFrBand5TotalDistance?: number | null;
  imaFrBand6TotalDistance?: number | null;
  imaFrBand7TotalDistance?: number | null;
  imaFrBand8TotalDistance?: number | null;
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
    /** High-intensity-only decel count (band 3+, >3 m/s²). See CatapultSessionMetric. */
    decelB3PlusTotEffsGen2?: number | null;
    /** IMA-based per-band decel counts. Band 3 = high-intensity. See CatapultSessionMetric. */
    imaBand1DecelCount?: number | null;
    imaBand2DecelCount?: number | null;
    imaBand3DecelCount?: number | null;
    /** Symmetric IMA accel counts for valid A:D coupling. See CatapultSessionMetric. */
    imaBand1AccelCount?: number | null;
    imaBand2AccelCount?: number | null;
    imaBand3AccelCount?: number | null;
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
    imaCodLeft?: number | null;
    imaCodRight?: number | null;
    imaCodLeftHigh?: number | null;
    imaCodLeftMedium?: number | null;
    imaCodLeftLow?: number | null;
    imaCodRightHigh?: number | null;
    imaCodRightMedium?: number | null;
    imaCodRightLow?: number | null;
    imaClock?: ImaClock | null;
    imaTotal?: number | null;
    codEvents?: number | null;
    impacts?: number | null;
    jumps?: number | null;
    // Newly-added Reporting_Parameters (24 Aug 2026): RHIE + running mechanical.
    rhieBouts?: number | null;
    rhieEffortsPerBoutMean?: number | null;
    rhieEffortsPerBoutMax?: number | null;
    rhieEffortsPerBoutMin?: number | null;
    rhieEffortDurationMeanS?: number | null;
    rhieEffortRecoveryMeanS?: number | null;
    rhieBoutRecoveryMeanS?: number | null;
    runningSymmetry?: number | null;
    runningDeviation?: number | null;
    runningImbalance?: number | null;
    runningSeriesCount?: number | null;
    footstrikes?: number | null;
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
    minHeartRate?: number | null;
    hrZone1TimeS?: number | null;
    hrZone2TimeS?: number | null;
    hrZone3TimeS?: number | null;
    hrZone4TimeS?: number | null;
    hrZone5TimeS?: number | null;
    hrZone6TimeS?: number | null;
    hrZone7TimeS?: number | null;
    hrZone8TimeS?: number | null;
    hrZone1AvgBpm?: number | null;
    hrZone2AvgBpm?: number | null;
    hrZone3AvgBpm?: number | null;
    hrZone4AvgBpm?: number | null;
    hrZone5AvgBpm?: number | null;
    hrZone6AvgBpm?: number | null;
    hrZone7AvgBpm?: number | null;
    hrZone8AvgBpm?: number | null;
    pctMaxHeartRate?: number | null;
    pctAvgHeartRate?: number | null;
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
    imaFrBand5TotalDistance?: number | null;
    imaFrBand6TotalDistance?: number | null;
    imaFrBand7TotalDistance?: number | null;
    imaFrBand8TotalDistance?: number | null;
  };
  // DIAGNOSTIC ONLY — see CatapultSessionMetric.rawParams. rawPayload → the
  // bounded source param object stored in raw_payload_json; paramKeys → the
  // flattened parameter names seen, unioned per sync run for the log.
  rawPayload?: unknown;
  paramKeys?: string[] | null;
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
  /** Peak-period (MII power-curve) rows upserted this run. Descriptive; best-effort. */
  peakPeriodCount?: number;
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
      jumps: number | null;
      playerload_per_min: number | null;
    };
  }>;
};
