import { buildDecisionInputFromReadinessContext } from "./adapters";
import { buildTrainingRecommendation } from "./rules";
import type { DecisionState } from "./types";

type ValidationCaseResult = {
  name: string;
  passed: boolean;
  recommendation: {
    state: DecisionState;
    sessionMode: string;
    loadAdjustment: number | null;
    riskFlags: string[];
  };
};

export type TrainingRecommendationValidationSuite = {
  passed: boolean;
  cases: ValidationCaseResult[];
};

function runCase(name: string, builder: Parameters<typeof buildDecisionInputFromReadinessContext>[0], assert: (state: ReturnType<typeof buildTrainingRecommendation>) => boolean): ValidationCaseResult {
  const recommendation = buildTrainingRecommendation(buildDecisionInputFromReadinessContext(builder));
  return {
    name,
    passed: assert(recommendation),
    recommendation: {
      state: recommendation.state,
      sessionMode: recommendation.sessionMode,
      loadAdjustment: recommendation.loadAdjustment,
      riskFlags: recommendation.riskFlags,
    },
  };
}

export function runTrainingRecommendationValidationSuite(): TrainingRecommendationValidationSuite {
  const athleteId = "athlete-1";
  const date = "2026-03-17";

  const cases: ValidationCaseResult[] = [
    runCase(
      "CASE 1 GREEN stable",
      {
        athleteId,
        date,
        readinessDecision: { athleteState: "GREEN", sessionMode: "full", confidence: "high", why: [], coachAction: [], riskFactors: [], score: 82 },
        injuryDecision: { injuryRiskLevel: "LOW", confidence: "high", why: [], modifiableDrivers: [], recommendation: [], riskScore: 0.22 },
        monitoringInput: { readinessScore: 82, sorenessScore: 4, sleepScore: 4, acuteLoad: 320, chronicLoad: 330, acwr: 1.05 },
      },
      (recommendation) => recommendation.state === "GREEN" && recommendation.sessionMode === "full" && recommendation.loadAdjustment === 0
    ),
    runCase(
      "CASE 2 YELLOW soreness + ACWR",
      {
        athleteId,
        date,
        readinessDecision: { athleteState: "YELLOW", sessionMode: "modified", confidence: "medium", why: [], coachAction: [], riskFactors: [], score: 63 },
        injuryDecision: { injuryRiskLevel: "LOW", confidence: "medium", why: [], modifiableDrivers: [], recommendation: [], riskScore: 0.3 },
        monitoringInput: { readinessScore: 63, sorenessScore: 2, sleepScore: 3, acuteLoad: 400, chronicLoad: 295, acwr: 1.35 },
      },
      (recommendation) =>
        recommendation.state === "YELLOW" &&
        recommendation.sessionMode === "modified" &&
        (recommendation.loadAdjustment ?? 0) <= -0.25 &&
        recommendation.constraints.includes("limit_total_volume")
    ),
    runCase(
      "CASE 3 injury red overrides",
      {
        athleteId,
        date,
        readinessDecision: { athleteState: "GREEN", sessionMode: "full", confidence: "medium", why: [], coachAction: [], riskFactors: [], score: 79 },
        injuryDecision: { injuryRiskLevel: "HIGH", confidence: "high", why: [], modifiableDrivers: [], recommendation: [], riskScore: 0.82 },
        monitoringInput: { readinessScore: 79, sorenessScore: 4, sleepScore: 4, acuteLoad: 310, chronicLoad: 300, acwr: 1.03 },
      },
      (recommendation) => recommendation.state === "RED" && recommendation.sessionMode === "recovery"
    ),
    runCase(
      "CASE 4 Light ATE fallback green",
      {
        athleteId,
        date,
        lightAteState: "GREEN",
        injuryDecision: { injuryRiskLevel: "LOW", confidence: "medium", why: [], modifiableDrivers: [], recommendation: [], riskScore: 0.2 },
        monitoringInput: { sorenessScore: 4, sleepScore: 4, acuteLoad: 290, chronicLoad: 280, acwr: 1.04 },
      },
      (recommendation) =>
        recommendation.state === "GREEN" &&
        recommendation.dataQuality.usedLightAteFallback === true &&
        (recommendation.confidence.band === "medium" || recommendation.confidence.band === "high")
    ),
    runCase(
      "CASE 5 high ACWR + poor soreness/recovery",
      {
        athleteId,
        date,
        readinessDecision: { athleteState: "GREEN", sessionMode: "full", confidence: "high", why: [], coachAction: [], riskFactors: [], score: 76 },
        injuryDecision: { injuryRiskLevel: "MODERATE", confidence: "high", why: [], modifiableDrivers: [], recommendation: [], riskScore: 0.63 },
        monitoringInput: { sorenessScore: 2, sleepScore: 3, acuteLoad: 510, chronicLoad: 315, acwr: 1.6 },
      },
      (recommendation) =>
        recommendation.state === "RED" &&
        recommendation.constraints.includes("recovery_only") &&
        recommendation.constraints.includes("limit_high_speed_running") &&
        recommendation.constraints.includes("avoid_eccentric_overload")
    ),
    runCase(
      "CASE 6 missing load + wellness + readiness",
      {
        athleteId,
        date,
      },
      (recommendation) => (recommendation.state === "GRAY" || recommendation.state === "YELLOW") && recommendation.confidence.band === "low"
    ),
    runCase(
      "CASE 7 accel decel stress",
      {
        athleteId,
        date,
        readinessDecision: { athleteState: "GREEN", sessionMode: "full", confidence: "medium", why: [], coachAction: [], riskFactors: [], score: 73 },
        injuryDecision: { injuryRiskLevel: "LOW", confidence: "medium", why: [], modifiableDrivers: [], recommendation: [], riskScore: 0.31 },
        monitoringInput: { sorenessScore: 3, sleepScore: 4, acuteLoad: 350, chronicLoad: 320, acwr: 1.09 },
        catapultDailyLoad: {
          playerId: athleteId,
          teamId: null,
          date,
          totalDistance: 7000,
          hirDist: 650,
          maxVelocity: 28.2,
          accelerations: 82,
          decelerations: 77,
          playerLoad: 500,
          playerLoadPerMinute: 8.2,
          velocityBand5TotalDistance: 400,
          velocityBand6TotalDistance: 250,
          accelBand2to3Efforts: 24,
          decelBand2to3Efforts: 22,
          totalAccelerations: 82,
          totalDecelerations: 77,
        },
      },
      (recommendation) => recommendation.state === "YELLOW" && recommendation.constraints.includes("limit_accel_decel_density")
    ),
    runCase(
      "CASE 8 recent load drop",
      {
        athleteId,
        date,
        readinessDecision: { athleteState: "GREEN", sessionMode: "full", confidence: "medium", why: [], coachAction: [], riskFactors: [], score: 74 },
        injuryDecision: { injuryRiskLevel: "LOW", confidence: "medium", why: [], modifiableDrivers: [], recommendation: [], riskScore: 0.28 },
        monitoringInput: { sorenessScore: 4, sleepScore: 4, acuteLoad: 140, chronicLoad: 310, acwr: 0.65 },
      },
      (recommendation) => recommendation.riskFlags.includes("recent_load_drop")
    ),
  ];

  return {
    passed: cases.every((item) => item.passed),
    cases,
  };
}
