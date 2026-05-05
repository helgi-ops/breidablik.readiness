export type InjuryRiskDecision = {
  injuryRiskLevel: "LOW" | "MODERATE" | "HIGH";
  confidence: "low" | "medium" | "high";
  riskScore?: number;
  why: string[];
  modifiableDrivers: string[];
  recommendation: string[];
  supportingMetrics?: {
    acwr?: number;
    zScore?: number;
    deltaZ?: number;
    volatility?: number;
    recentYellowDays?: number;
    recentRedDays?: number;
    highSpeedRunning?: number;
    maxVelocityPct?: number;
  };
  debug?: {
    triggeredRules: string[];
    missingInputs: string[];
  };
};

export type InjuryRiskInput = {
  acwr?: number;
  zScore?: number;
  deltaZ?: number;
  volatility?: number;
  recentYellowDays?: number;
  recentRedDays?: number;
  highSpeedRunning?: number;
  maxVelocityPct?: number;
  sleepScore?: number;
  hrvChangePct?: number;
  sorenessScore?: number;
  sorenessFlag?: boolean;
  painFlag?: boolean;
  gpsSpike?: boolean;
  matchCongestion?: boolean;
  travelLoad?: boolean;
  valdHamstringRiskFlag?: boolean;
  valdGroinRiskFlag?: boolean;
  valdNeuromuscularRiskFlag?: boolean;
  valdReasons?: string[];
  /**
   * Global fatigue flag — true when both MLI ≥ 65 AND Metabolic ≥ 65.
   * Indicates full-body stress from both mechanical and metabolic systems.
   */
  globalFatigueFlag?: boolean;
  /**
   * Residual MLI band — accumulated mechanical stress over 3 days.
   * "CAUTION" (110–134) or "HIGH" (≥135) signals accumulated risk.
   */
  residualMliBand?: "NORMAL" | "ELEVATED" | "CAUTION" | "HIGH";

  // ── Deceleration-specific inputs (McBurnie et al. 2022) ──────────

  /** Standalone decel burden score (0–1). ≥0.70 = high eccentric load. */
  decelBurdenScore?: number;
  /** Residual Decel band — 3-day accumulated deceleration stress. */
  residualDecelBand?: "NORMAL" | "ELEVATED" | "CAUTION" | "HIGH";
  /** Accel:decel ratio. <0.7 = eccentric-dominant (ACL / quadriceps / patellar tendon risk — peak quad activation 161% MVC during decel + hamstring −87% co-activation per McBurnie 2022). >1.3 = concentric-dominant (hamstring strain risk on sprint side). */
  accelDecelRatio?: number;

  // ── HID% fatigue trend (Harper et al. 2019) ────────────────────────

  /**
   * Relative HID% decline vs 7-day average (0–1 scale).
   * ≥0.20 with stable total distance = neuromuscular fatigue signal.
   */
  hidDeclinePct?: number;
  /** True when HID% fatigue conditions met (decline ≥20% + stable distance). */
  hidFatigueFlag?: boolean;

  // ── Personal-baseline z-scores (Robertson 2017) ────────────────────
  // When present, the rules engine prefers these over the global Likert
  // thresholds (sleepScore ≤ 2, sorenessScore ≤ 2). A player whose
  // personal sleep mean is 4.5 should trigger "POOR_RECOVERY_MARKERS"
  // when sleep drops to 3 (z ≈ -1.5), even though 3 > the global cutoff.
  // Conversely, a player whose personal sleep mean is 2.7 should NOT
  // trigger every day at value 2 — that's normal for them.
  // Set by the caller using flagAgainstBaseline(); null when no
  // personal baseline exists (insufficient_data, < 7 obs).
  /** Personal z-score for tonight's sleep (negative = below personal norm). */
  sleepZ?: number | null;
  /** Personal z-score for today's soreness (negative = below personal norm). */
  sorenessZ?: number | null;
  /**
   * True when player's *personal sleep mean* across the 28-day baseline
   * window is itself ≤ 2.5 — Tier C chronic-low signal. These players
   * need long-term escalation even when their daily z stays green.
   */
  sleepChronicLow?: boolean;
  /** Tier C — personal soreness mean ≤ 2.5 across 28d. */
  sorenessChronicLow?: boolean;
};
