import type { InjuryRiskInput } from "./types";

export type InjuryRiskRuleResult = {
  injuryRiskLevel: "LOW" | "MODERATE" | "HIGH";
  confidence: "low" | "medium" | "high";
  riskScore: number;
  triggeredRules: string[];
  missingInputs: string[];
};

function hasNumber(v: unknown): boolean {
  return typeof v === "number" && Number.isFinite(v);
}

export function evaluateInjuryRiskRules(
  input: InjuryRiskInput,
  readinessDecision?: { athleteState: "GREEN" | "YELLOW" | "RED" | "GRAY" } | null
): InjuryRiskRuleResult {
  const triggeredRules: string[] = [];
  const missingInputs: string[] = [];

  if (!hasNumber(input.acwr)) missingInputs.push("acwr");
  if (!hasNumber(input.deltaZ)) missingInputs.push("deltaZ");
  if (!hasNumber(input.volatility)) missingInputs.push("volatility");
  if (!hasNumber(input.sleepScore)) missingInputs.push("sleepScore");
  if (!hasNumber(input.hrvChangePct)) missingInputs.push("hrvChangePct");
  if (!hasNumber(input.sorenessScore)) missingInputs.push("sorenessScore");

  const lowReadinessState =
    readinessDecision?.athleteState === "RED" ||
    readinessDecision?.athleteState === "YELLOW" ||
    readinessDecision?.athleteState === "GRAY";
  const acuteWorkloadSpike =
    (hasNumber(input.highSpeedRunning) && (input.highSpeedRunning as number) >= 800) || input.gpsSpike === true;
  const elevatedAcwr = hasNumber(input.acwr) && (input.acwr as number) >= 1.3;
  const negativeDeltaZ = hasNumber(input.deltaZ) && (input.deltaZ as number) <= -0.25;

  // ── Recovery / soreness — personal-baseline aware (Robertson 2017) ──
  // Prefer personal z-score when available. When absent, fall back to
  // the global Likert cutoff so existing behaviour is preserved for
  // players without a baseline yet (< 7 obs).
  // sleepZ ≤ -1.0 ≈ same statistical strength as the old "sleep ≤ 2"
  // rule but normalised against each player's own norm.
  const sleepBelowPersonal = hasNumber(input.sleepZ) && (input.sleepZ as number) <= -1.0;
  const sleepBelowGlobal = !hasNumber(input.sleepZ) &&
    hasNumber(input.sleepScore) && (input.sleepScore as number) <= 2;
  const poorRecovery =
    sleepBelowPersonal ||
    sleepBelowGlobal ||
    (hasNumber(input.hrvChangePct) && (input.hrvChangePct as number) <= -8);
  const highVolatility = hasNumber(input.volatility) && (input.volatility as number) >= 35;
  const repeatedWarningDays =
    ((input.recentYellowDays ?? 0) + (input.recentRedDays ?? 0)) >= 2 ||
    (input.recentRedDays ?? 0) >= 1;

  const sorenessBelowPersonal = hasNumber(input.sorenessZ) && (input.sorenessZ as number) <= -1.0;
  const sorenessBelowGlobal = !hasNumber(input.sorenessZ) &&
    hasNumber(input.sorenessScore) && (input.sorenessScore as number) <= 2;
  const lowSorenessCaution = sorenessBelowPersonal || sorenessBelowGlobal || input.sorenessFlag === true;
  const goodSorenessSignal = hasNumber(input.sorenessScore) && (input.sorenessScore as number) >= 4 && input.painFlag !== true;
  const sorenessPain = lowSorenessCaution || input.painFlag === true;
  const congestionTravel = input.matchCongestion === true || input.travelLoad === true;
  const gpsSpikeRecovery = input.gpsSpike === true && poorRecovery;
  const valdHamstring = input.valdHamstringRiskFlag === true;
  const valdGroin = input.valdGroinRiskFlag === true;
  const valdNeuromuscular = input.valdNeuromuscularRiskFlag === true;
  const strongReadinessDay =
    hasNumber(input.zScore) &&
    (input.zScore as number) > 1.5 &&
    goodSorenessSignal &&
    !poorRecovery &&
    !lowReadinessState &&
    input.painFlag !== true;

  let riskScore = 0;
  if (acuteWorkloadSpike) {
    triggeredRules.push("RAPID_WORKLOAD_INCREASE");
    riskScore += 2;
  }
  if (elevatedAcwr) {
    triggeredRules.push("ELEVATED_ACWR");
    riskScore += 2;
  }
  if (lowReadinessState) {
    triggeredRules.push("LOW_READINESS_STATE");
    riskScore += 1;
  }
  if (negativeDeltaZ) {
    triggeredRules.push("NEGATIVE_DELTA_Z");
    riskScore += 1;
  }
  if (poorRecovery) {
    triggeredRules.push("POOR_RECOVERY_MARKERS");
    riskScore += 2;
  }
  if (highVolatility && !strongReadinessDay) {
    triggeredRules.push("HIGH_VOLATILITY");
    riskScore += 1;
  }
  if (repeatedWarningDays) {
    triggeredRules.push("REPEATED_WARNING_DAYS");
    riskScore += 2;
  }
  if (sorenessPain) {
    triggeredRules.push("SORENESS_PAIN_FLAG");
    riskScore += 2;
  }
  if (goodSorenessSignal) {
    triggeredRules.push("GOOD_SORENESS_SIGNAL");
    riskScore = Math.max(0, riskScore - 1);
  }
  if (congestionTravel && poorRecovery) {
    triggeredRules.push("CONGESTION_TRAVEL_RECOVERY_STRAIN");
    riskScore += 2;
  }
  if (gpsSpikeRecovery) {
    triggeredRules.push("GPS_SPIKE_POOR_RECOVERY");
    riskScore += 2;
  }
  if (valdHamstring) {
    triggeredRules.push("VALD_HAMSTRING_RISK");
    riskScore += 2;
  }
  if (valdGroin) {
    triggeredRules.push("VALD_GROIN_RISK");
    riskScore += 2;
  }
  if (valdNeuromuscular) {
    triggeredRules.push("VALD_NEUROMUSCULAR_CAUTION");
    riskScore += 1;
  }

  // Global fatigue: both mechanical and metabolic systems under high stress
  if (input.globalFatigueFlag === true) {
    triggeredRules.push("GLOBAL_FATIGUE");
    riskScore += 2;
  }

  // Residual MLI accumulation: multi-day mechanical stress buildup
  if (input.residualMliBand === "HIGH") {
    triggeredRules.push("RESIDUAL_MLI_HIGH");
    riskScore += 2;
  } else if (input.residualMliBand === "CAUTION") {
    triggeredRules.push("RESIDUAL_MLI_CAUTION");
    riskScore += 1;
  }

  // Deceleration-specific rules (McBurnie et al. 2022)
  // High decel burden → tissue damage, CK elevation, mechanical fatigue failure
  if (hasNumber(input.decelBurdenScore) && (input.decelBurdenScore as number) >= 0.70) {
    triggeredRules.push("DECEL_BURDEN_HIGH");
    riskScore += 2;
  } else if (hasNumber(input.decelBurdenScore) && (input.decelBurdenScore as number) >= 0.45) {
    triggeredRules.push("DECEL_BURDEN_ELEVATED");
    riskScore += 1;
  }

  // Residual Decel accumulation: multi-day eccentric stress buildup
  if (input.residualDecelBand === "HIGH") {
    triggeredRules.push("RESIDUAL_DECEL_HIGH");
    riskScore += 2;
  } else if (input.residualDecelBand === "CAUTION") {
    triggeredRules.push("RESIDUAL_DECEL_CAUTION");
    riskScore += 1;
  }

  // HID% fatigue trend (Harper et al. 2019 meta-analysis)
  // Declining high-intensity distance with stable total distance signals
  // neuromuscular fatigue — inability to reach high speeds increases
  // compensatory movement patterns and soft-tissue injury risk.
  if (input.hidFatigueFlag === true) {
    triggeredRules.push("HID_DECLINE_FATIGUE");
    riskScore += 1;
  }

  // Eccentric-dominant load profile: high hamstring/calf strain risk
  // Especially dangerous when combined with soreness or poor recovery
  if (hasNumber(input.accelDecelRatio) && (input.accelDecelRatio as number) < 0.7) {
    if (sorenessPain || poorRecovery) {
      triggeredRules.push("ECCENTRIC_DOMINANT_WITH_SORENESS");
      riskScore += 2;
    } else {
      triggeredRules.push("ECCENTRIC_DOMINANT_LOAD");
      riskScore += 1;
    }
  }

  // Tier C — chronic-low personal baselines (sleep / soreness mean ≤ 2.5
  // across 28d). These players are running with depleted recovery
  // capacity at all times, so any acute spike is more dangerous than
  // for a player whose personal mean is 4. Light bonus (+1 each) so it
  // does not double-count an already poor recovery day.
  if (input.sleepChronicLow === true) {
    triggeredRules.push("CHRONIC_LOW_SLEEP_BASELINE");
    riskScore += 1;
  }
  if (input.sorenessChronicLow === true) {
    triggeredRules.push("CHRONIC_LOW_SORENESS_BASELINE");
    riskScore += 1;
  }

  // ── Robustness (#5) mechanical & neuromuscular signals ─────────────
  // Personal-norm z-scores, conservative weights (mostly +1), escalating
  // to +2 ONLY in combination with poor recovery/soreness (the same
  // pattern as the eccentric-dominant rule). Deliberately specificity-
  // biased to avoid the small-squad over-flagging the ML literature warns
  // about (Haller 2023). Null inputs simply skip — never fabricated.

  // Running bilateral asymmetry rising vs personal norm (mechanical stress
  // / compensation). More dangerous under existing recovery strain.
  if (hasNumber(input.runningAsymmetryZ) && (input.runningAsymmetryZ as number) >= 1.5) {
    if (sorenessPain || poorRecovery) {
      triggeredRules.push("RUNNING_ASYMMETRY_WITH_STRAIN");
      riskScore += 2;
    } else {
      triggeredRules.push("RUNNING_ASYMMETRY_RISING");
      riskScore += 1;
    }
  }

  // Footstrike-volume spike vs personal norm — supporting impact-load
  // signal only, gated hard (≥ +2σ) so it contributes on a clear spike.
  if (hasNumber(input.footstrikesZ) && (input.footstrikesZ as number) >= 2.0) {
    triggeredRules.push("FOOTSTRIKE_VOLUME_SPIKE");
    riskScore += 1;
  }

  // RHIE (repeated-sprint) bout spike vs personal norm — a load-SHAPE
  // signal; escalates only alongside an ACWR/HSR volume spike.
  if (hasNumber(input.rhieBoutsZ) && (input.rhieBoutsZ as number) >= 1.5) {
    if (acuteWorkloadSpike || elevatedAcwr) {
      triggeredRules.push("RHIE_SPIKE_WITH_LOAD");
      riskScore += 2;
    } else {
      triggeredRules.push("RHIE_SPIKE");
      riskScore += 1;
    }
  }

  // CMJ neuromuscular-fatigue trend (Neyroud 2016 — read the multi-day
  // slope, not today's value). Worse under poor recovery.
  if (hasNumber(input.cmjSlopeZ) && (input.cmjSlopeZ as number) <= -1.0) {
    if (poorRecovery || sorenessPain) {
      triggeredRules.push("CMJ_FATIGUE_TREND_WITH_STRAIN");
      riskScore += 2;
    } else {
      triggeredRules.push("CMJ_FATIGUE_TREND");
      riskScore += 1;
    }
  }

  // CMJ recovery deficit vs expected post-match curve (Hader 2019 — HSR
  // drives post-match fatigue). Two-tier by deficit size.
  if (hasNumber(input.cmjRecoveryDeficit) && (input.cmjRecoveryDeficit as number) >= 0.10) {
    triggeredRules.push("CMJ_RECOVERY_DEFICIT_HIGH");
    riskScore += 2;
  } else if (hasNumber(input.cmjRecoveryDeficit) && (input.cmjRecoveryDeficit as number) >= 0.05) {
    triggeredRules.push("CMJ_RECOVERY_DEFICIT");
    riskScore += 1;
  }

  let injuryRiskLevel: "LOW" | "MODERATE" | "HIGH" = "LOW";
  if (riskScore >= 8) injuryRiskLevel = "HIGH";
  else if (riskScore >= 4) injuryRiskLevel = "MODERATE";

  const presentCount = [
    hasNumber(input.acwr),
    hasNumber(input.deltaZ),
    hasNumber(input.volatility),
    hasNumber(input.sleepScore),
    hasNumber(input.hrvChangePct),
    hasNumber(input.highSpeedRunning),
  ].filter(Boolean).length;

  let confidence: "low" | "medium" | "high" = "medium";
  if (presentCount <= 2) confidence = "low";
  if (presentCount >= 4 && triggeredRules.length >= 2) confidence = "high";
  if (injuryRiskLevel === "HIGH" && triggeredRules.length <= 1) confidence = "low";

  return { injuryRiskLevel, confidence, riskScore, triggeredRules, missingInputs };
}
