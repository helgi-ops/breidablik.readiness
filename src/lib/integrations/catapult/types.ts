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
  hirDist?: number | null;
  maxVel?: number | null;
  accelB23TotEffsGen2?: number | null;
  totAs?: number | null;
  decelB23TotEffsGen2?: number | null;
  totDs?: number | null;
  totalPlayerLoad?: number | null;
  playerLoadPerMinute?: number | null;
  metabolicPower?: number | null;
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
    hirDist?: number | null;
    maxVel?: number | null;
    accelB23TotEffsGen2?: number | null;
    totAs?: number | null;
    decelB23TotEffsGen2?: number | null;
    totDs?: number | null;
    totalPlayerLoad?: number | null;
    playerLoadPerMinute?: number | null;
    metabolicPower?: number | null;
    explosiveDistance?: number | null;
    imaAccel?: number | null;
    imaDecel?: number | null;
    imaCod?: number | null;
    imaTotal?: number | null;
    codEvents?: number | null;
    impacts?: number | null;
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
