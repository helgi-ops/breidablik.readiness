export interface VolatilityDailyPoint {
  date: string;
  checkInScore?: number | null;
  zScore?: number | null;
  deltaZ?: number | null;
  soreness?: number | null;
  sleepQuality?: number | null;
  mood?: number | null;
  energy?: number | null;
  stress?: number | null;
  readinessState?: string | null;
}

export interface VolatilityDriverScore {
  key: string;
  label: string;
  volatilityScore: number;
  normalizedScore: number;
}

export interface PlayerVolatilitySummary {
  sampleSize: number;
  windowDays: number;
  hasEnoughData: boolean;
  overallScore: number | null;
  level: "LOW" | "MODERATE" | "HIGH" | "INSUFFICIENT";
  interpretation: string;
  drivers: VolatilityDriverScore[];
  dayLabels: string[];
  dailyComposite: number[];
  currentVsTrendNote?: string | null;
}
