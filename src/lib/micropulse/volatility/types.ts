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

export type VolatilityLevel = "LOW" | "MODERATE" | "HIGH" | "INSUFFICIENT";

export interface VolatilityCounterfactual {
  /** The single signal contributing most to the volatility. */
  driverKey: string;
  driverLabel: string;
  /** Overall score with that driver held steady (the other drivers only). */
  newScore: number;
  /** Level the player would fall to if that driver were stable. */
  newLevel: VolatilityLevel;
}

export interface PlayerVolatilitySummary {
  sampleSize: number;
  windowDays: number;
  hasEnoughData: boolean;
  overallScore: number | null;
  level: VolatilityLevel;
  interpretation: string;
  /** Top contributing drivers (most-volatile first, capped for display). */
  drivers: VolatilityDriverScore[];
  dayLabels: string[];
  dailyComposite: number[];
  currentVsTrendNote?: string | null;
  /**
   * "If the biggest driver were steady → this level" — the counterfactual the
   * manifesto requires for every flagged player. Null when there is too little
   * data or only one usable driver.
   */
  counterfactual?: VolatilityCounterfactual | null;
}
