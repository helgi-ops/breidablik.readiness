export type StatSportAthlete = {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
};

export type StatSportActivity = {
  id: string;
  date: string;
  name?: string | null;
  type?: string | null; // "training" | "match"
};

export type StatSportSessionMetric = {
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
  metabolicPowerPeak?: number | null;
  highMetabolicLoadDistanceM?: number | null;
  metabolicEnergyKj?: number | null;
  timeAboveHmlThresholdS?: number | null;
  metabolicDataValid?: boolean;
  avgHeartRate?: number | null;
  maxHeartRate?: number | null;
  hrZone1TimeS?: number | null;
  hrZone2TimeS?: number | null;
  hrZone3TimeS?: number | null;
  hrZone4TimeS?: number | null;
  hrZone5TimeS?: number | null;
  activityId?: string | null;
};

export type NormalizedStatSportExternalLoad = {
  playerId: string;
  date: string;
  source: "statsport";
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
    metabolicPowerPeak?: number | null;
    highMetabolicLoadDistanceM?: number | null;
    metabolicEnergyKj?: number | null;
    timeAboveHmlThresholdS?: number | null;
    metabolicDataValid?: boolean;
    avgHeartRate?: number | null;
    maxHeartRate?: number | null;
    hrZone1TimeS?: number | null;
    hrZone2TimeS?: number | null;
    hrZone3TimeS?: number | null;
    hrZone4TimeS?: number | null;
    hrZone5TimeS?: number | null;
  };
  rawPayload?: unknown;
  activityCount?: number;
};

export type StatSportAthleteMapRecord = {
  statsportAthleteId: string;
  micropulsePlayerId: string;
  matchMethod: "manual" | "email" | "name";
  confidence: number;
  statsportAthleteName?: string | null;
  statsportEmail?: string | null;
};

export type StatSportSyncResult = {
  date: string;
  athletesFetched: number;
  activitiesFetched: number;
  statsFetched: number;
  normalizedCount: number;
  storedCount: number;
  unmatchedCount: number;
  warnings: string[];
};
