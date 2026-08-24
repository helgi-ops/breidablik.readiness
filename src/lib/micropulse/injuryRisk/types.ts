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

  // ── Robustness (#5) mechanical & neuromuscular inputs ──────────────
  // All personal-norm z-scores (vs the player's own 28-day baseline via
  // flagAgainstBaseline). Null until the Catapult re-sync lands the new
  // Reporting_Parameters (running_symmetry/imbalance, footstrikes, RHIE)
  // or a CMJ baseline exists. Descriptive early-warning signals only —
  // they never touch the readiness colour or the daily decision. Weights
  // are deliberately conservative (mostly +1) to avoid the over-flagging
  // the ML literature warns about at small squad size (Haller 2023).

  /**
   * Running bilateral asymmetry, personal z (POSITIVE = MORE asymmetric
   * than his norm). From running_symmetry / running_imbalance. ≥ +1.5σ =
   * a mechanical-stress / compensation contributor. Cite: bilateral
   * asymmetry as early tissue-overload signal. Null until re-sync.
   */
  runningAsymmetryZ?: number | null;
  /**
   * Footstrike volume, personal z (POSITIVE = more impacts than his norm).
   * A supporting impact-load signal, not a headline — gated conservatively
   * (≥ +2σ) so it only contributes on a clear spike. Null until re-sync.
   */
  footstrikesZ?: number | null;
  /**
   * RHIE bouts, personal z (POSITIVE = more repeated-sprint bouts than his
   * norm). A load-SHAPE modifier (clustered high-intensity efforts) that
   * complements the ACWR volume signal. ≥ +1.5σ. Null until re-sync.
   */
  rhieBoutsZ?: number | null;
  /**
   * CMJ multi-day fatigue slope, personal z (NEGATIVE = declining jump
   * height/power vs his norm). Read the SLOPE, not today's value
   * (Neyroud 2016). ≤ -1.0σ = neuromuscular-fatigue contributor. Null
   * until a CMJ baseline exists (vald_forcedecks_results).
   */
  cmjSlopeZ?: number | null;
  /**
   * CMJ recovery deficit (0–1): how far observed CMJ sits BELOW the
   * expected post-match recovery curve personalised by match HSR
   * (Hader 2019 — HSR, not total distance, drives post-match fatigue).
   * ≥ 0.05 elevated, ≥ 0.10 high. Null until a CMJ recovery baseline
   * exists.
   */
  cmjRecoveryDeficit?: number | null;
};
