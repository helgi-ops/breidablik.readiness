export type GymAwareAthlete = {
  id: string;
  firstName: string;
  lastName: string;
};

export type GymAwareSet = {
  setId: string;
  athleteId: string;
  athleteName: string | null;
  exerciseName: string;
  date: string; // YYYY-MM-DD
  loadKg: number | null;
  reps: number | null;
  concMeanVelocity: number | null; // m/s
  concPeakVelocity: number | null; // m/s
  concMeanPower: number | null; // watts
  concPeakPower: number | null; // watts
  eccMeanVelocity: number | null; // m/s
  eccPeakVelocity: number | null; // m/s
  height: number | null; // m displacement
  dip: number | null; // m countermovement
  isVbt: boolean;
  raw: Record<string, unknown>;
};

export type GymAwareSyncResult = {
  date: string;
  setsFetched: number;
  setsStored: number;
  athletesMatched: number;
  unmatchedCount: number;
  warnings: string[];
};

export type GymAwareAthleteMapRecord = {
  gymAwareAthleteId: string;
  micropulsePlayerId: string;
  gymAwareAthleteName: string | null;
  matchMethod: "manual" | "name";
  confidence: number;
};
