import { EXPLANATION_IMPACT } from "./constants";
import {
  dedupeStringArray,
  formatNullableNumber,
  formatPercent,
  normalizeFatigue,
  normalizeRecovery,
  normalizeSleepQuality,
  normalizeSoreness,
  sortExplanationFactors,
} from "./helpers";
import type {
  DecisionConstraint,
  DecisionFocus,
  DecisionInput,
  ExplanationFactor,
  RiskFlag,
  SessionMode,
  TrainingRecommendation,
} from "./types";

type ExplanationContext = {
  input: DecisionInput;
  finalState: TrainingRecommendation["state"];
  matchedRules: string[];
  riskFlags: RiskFlag[];
};

export function buildExplanationFactors({ input, finalState, matchedRules, riskFlags }: ExplanationContext): ExplanationFactor[] {
  const factors: ExplanationFactor[] = [];

  if (input.readinessState) {
    factors.push({
      key: "readiness_state",
      label: "Readiness state",
      value: input.readinessState,
      impactScore: finalState === "GREEN" ? EXPLANATION_IMPACT.LOW : EXPLANATION_IMPACT.HIGH,
      direction: finalState === "GREEN" ? "positive" : "negative",
      summary:
        finalState === "GREEN"
          ? "Readiness state supports normal training."
          : `Readiness state increases today's caution level.`,
    });
  }

  if (input.injuryRiskState || typeof input.injuryRiskScore === "number") {
    factors.push({
      key: "injury_risk",
      label: "Injury risk",
      value: input.injuryRiskState ?? input.injuryRiskScore ?? null,
      impactScore:
        input.injuryRiskState === "RED" || (input.injuryRiskScore ?? 0) >= 0.75
          ? EXPLANATION_IMPACT.HIGH
          : EXPLANATION_IMPACT.MODERATE,
      direction:
        input.injuryRiskState === "GREEN" || (typeof input.injuryRiskScore === "number" && input.injuryRiskScore < 0.5)
          ? "neutral"
          : "negative",
      summary:
        input.injuryRiskState === "RED" || (input.injuryRiskScore ?? 0) >= 0.75
          ? "Injury risk is elevated and materially increases the need for caution."
          : "Injury risk contributes to today's recommendation.",
    });
  }

  if (typeof input.load?.acwr === "number") {
    factors.push({
      key: "acwr",
      label: "ACWR",
      value: formatNullableNumber(input.load.acwr),
      impactScore: input.load.acwr >= 1.5 ? EXPLANATION_IMPACT.HIGH : EXPLANATION_IMPACT.MODERATE,
      direction: input.load.acwr >= 1.3 || input.load.acwr <= 0.8 ? "negative" : "neutral",
      summary:
        input.load.acwr >= 1.5
          ? "Acute:chronic workload ratio is elevated and increases current load-related risk."
          : input.load.acwr >= 1.3
          ? "Acute:chronic workload ratio is moderately elevated."
          : input.load.acwr <= 0.8
          ? "Recent load has dropped compared with the chronic baseline."
          : "Acute:chronic workload ratio is within a manageable range.",
    });
  }

  if (typeof input.load?.loadDeltaVs7dAvg === "number") {
    factors.push({
      key: "load_delta",
      label: "Load vs 7-day average",
      value: formatPercent(input.load.loadDeltaVs7dAvg),
      impactScore:
        Math.abs(input.load.loadDeltaVs7dAvg) >= 0.3 ? EXPLANATION_IMPACT.HIGH : EXPLANATION_IMPACT.MODERATE,
      direction: input.load.loadDeltaVs7dAvg > 0.2 || input.load.loadDeltaVs7dAvg < -0.3 ? "negative" : "neutral",
      summary:
        input.load.loadDeltaVs7dAvg >= 0.3
          ? "Daily load is clearly above the recent 7-day norm."
          : input.load.loadDeltaVs7dAvg >= 0.2
          ? "Daily load is moderately above the recent 7-day norm."
          : input.load.loadDeltaVs7dAvg <= -0.3
          ? "Daily load is materially below the recent 7-day norm."
          : "Daily load is close to the recent 7-day norm.",
    });
  }

  if (typeof input.wellness?.soreness === "number") {
    const soreness = normalizeSoreness(input.wellness.soreness);
    factors.push({
      key: "soreness",
      label: "Soreness",
      value: input.wellness.soreness,
      impactScore: soreness === "poor" ? EXPLANATION_IMPACT.HIGH : soreness === "moderate" ? EXPLANATION_IMPACT.MODERATE : EXPLANATION_IMPACT.LOW,
      direction: soreness === "good" ? "positive" : soreness === "unknown" ? "neutral" : "negative",
      summary:
        soreness === "poor"
          ? "Soreness is elevated and increases today's caution level."
          : soreness === "moderate"
          ? "Soreness is slightly elevated."
          : "Soreness does not currently raise concern.",
    });
  }

  if (typeof input.wellness?.recovery === "number") {
    const recovery = normalizeRecovery(input.wellness.recovery);
    factors.push({
      key: "recovery",
      label: "Recovery",
      value: input.wellness.recovery,
      impactScore: recovery === "poor" ? EXPLANATION_IMPACT.HIGH : recovery === "moderate" ? EXPLANATION_IMPACT.MODERATE : EXPLANATION_IMPACT.LOW,
      direction: recovery === "good" ? "positive" : recovery === "unknown" ? "neutral" : "negative",
      summary:
        recovery === "poor"
          ? "Recovery is poor and limits today's training tolerance."
          : recovery === "moderate"
          ? "Recovery is mixed."
          : "Recovery supports today's training plan.",
    });
  }

  if (typeof input.wellness?.sleepQuality === "number") {
    const sleep = normalizeSleepQuality(input.wellness.sleepQuality);
    factors.push({
      key: "sleep_quality",
      label: "Sleep quality",
      value: input.wellness.sleepQuality,
      impactScore: sleep === "poor" ? EXPLANATION_IMPACT.MODERATE : EXPLANATION_IMPACT.LOW,
      direction: sleep === "good" ? "positive" : sleep === "unknown" ? "neutral" : "negative",
      summary:
        sleep === "poor"
          ? "Sleep quality is low and reduces readiness."
          : sleep === "moderate"
          ? "Sleep quality is acceptable but not optimal."
          : "Sleep quality supports normal training.",
    });
  }

  if (typeof input.wellness?.fatigue === "number") {
    const fatigue = normalizeFatigue(input.wellness.fatigue);
    factors.push({
      key: "fatigue",
      label: "Fatigue",
      value: input.wellness.fatigue,
      impactScore: fatigue === "poor" ? EXPLANATION_IMPACT.MODERATE : EXPLANATION_IMPACT.LOW,
      direction: fatigue === "good" ? "positive" : fatigue === "unknown" ? "neutral" : "negative",
      summary:
        fatigue === "poor"
          ? "Fatigue is elevated and reduces tolerance for loading."
          : fatigue === "moderate"
          ? "Fatigue is slightly elevated."
          : "Fatigue appears manageable.",
    });
  }

  if (riskFlags.includes("high_accel_decel_exposure")) {
    factors.push({
      key: "accel_decel",
      label: "Acceleration / deceleration exposure",
      value: input.load?.totalAccelerations ?? input.load?.totalDecelerations ?? null,
      impactScore: EXPLANATION_IMPACT.MODERATE,
      direction: "negative",
      summary: "Acceleration and deceleration exposure is elevated and adds mechanical stress.",
    });
  }

  if (riskFlags.includes("high_hsr_exposure")) {
    factors.push({
      key: "hsr",
      label: "High-speed running",
      value: input.load?.highSpeedRunningDistance ?? null,
      impactScore: EXPLANATION_IMPACT.MODERATE,
      direction: "negative",
      summary: "High-speed running exposure is elevated versus the recent norm.",
    });
  }

  if (riskFlags.includes("missing_load_data")) {
    factors.push({
      key: "missing_load",
      label: "Load data",
      value: null,
      impactScore: EXPLANATION_IMPACT.INFO,
      direction: "neutral",
      summary: "Load data is limited today, so the recommendation is more conservative.",
    });
  }

  if (riskFlags.includes("missing_wellness")) {
    factors.push({
      key: "missing_wellness",
      label: "Wellness",
      value: null,
      impactScore: EXPLANATION_IMPACT.INFO,
      direction: "neutral",
      summary: "Wellness input is limited today, so the recommendation is more conservative.",
    });
  }

  const matched = new Set(matchedRules);
  if (matched.has("manual_review")) {
    factors.push({
      key: "manual_review",
      label: "Manual review",
      value: null,
      impactScore: EXPLANATION_IMPACT.INFO,
      direction: "neutral",
      summary: "Manual review is recommended before pushing load higher.",
    });
  }

  return sortExplanationFactors(factors).slice(0, 5);
}

export function buildCoachSummary(args: {
  state: TrainingRecommendation["state"];
  sessionMode: SessionMode;
  topFactors: ExplanationFactor[];
  constraints: DecisionConstraint[];
  loadAdjustment: number | null;
}): string {
  const lead =
    args.state === "RED"
      ? "Recovery-focused day recommended."
      : args.state === "YELLOW"
      ? "Modified training recommended."
      : args.state === "GREEN"
      ? "Full training recommended."
      : "Manual review recommended before finalizing training.";

  const cause = args.topFactors.slice(0, 2).map((item) => item.summary).join(" ");
  const action =
    args.state === "RED"
      ? "Prioritize recovery work and remove high-cost loading."
      : args.constraints.includes("limit_high_speed_running")
      ? "Limit high-speed running and control total loading."
      : args.constraints.includes("limit_accel_decel_density")
      ? "Control acceleration, deceleration, and eccentric stress."
      : typeof args.loadAdjustment === "number" && args.loadAdjustment < 0
      ? `Reduce planned load by roughly ${Math.round(Math.abs(args.loadAdjustment) * 100)}%.`
      : "Proceed with the planned session.";

  return dedupeStringArray([lead, cause, action]).join(" ");
}

export function buildPlayerSummary(args: {
  state: TrainingRecommendation["state"];
  topFactors: ExplanationFactor[];
  focus: DecisionFocus[];
}): string {
  if (args.state === "RED") {
    return "Your data suggests recovery should be the priority today. Keep work light and focus on feeling better for the next session.";
  }
  if (args.state === "YELLOW") {
    return "Today looks more like a reduced-load day. Focus on quality movement, controlled work, and recovery support.";
  }
  if (args.state === "GRAY") {
    return "We need a little more information before setting today's training load. Use normal coaching judgement until that is confirmed.";
  }
  return args.topFactors.some((factor) => factor.direction === "positive")
    ? "You look ready for normal training today. Focus on executing the session well."
    : "You look ready to train today. Stay sharp and keep the session controlled.";
}
