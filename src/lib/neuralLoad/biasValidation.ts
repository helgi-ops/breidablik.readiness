import { getPlayerNeuralBias, getTeamNeuralBias } from "@/lib/neuralLoad/bias";
import type { NeuralLoadState, NextDayRisk, ReadinessTrajectory, TeamNeuralLoadSummary } from "@/lib/neuralLoad/types";
import { buildAdaptivePlan } from "@/lib/training/adaptiveEngine";

type PlayerCase = {
  id: string;
  neuralLoadState: NeuralLoadState;
  readinessTrajectory: ReadinessTrajectory;
  nextDayRisk: NextDayRisk;
  expectPenaltyMin: number;
  expectRest?: boolean;
};

type TeamCase = {
  id: string;
  summary: TeamNeuralLoadSummary;
  expectPenaltyMin: number;
};

export type NeuralBiasValidationCaseResult = {
  id: string;
  pass: boolean;
  details: string[];
};

export type NeuralBiasValidationSuiteResult = {
  total: number;
  passed: number;
  failed: number;
  cases: NeuralBiasValidationCaseResult[];
};

function validatePlayerCase(c: PlayerCase): NeuralBiasValidationCaseResult {
  const b1 = getPlayerNeuralBias(c);
  const b2 = getPlayerNeuralBias(c);

  const details: string[] = [];
  details.push(JSON.stringify(b1) === JSON.stringify(b2) ? "Deterministic: PASS" : "Deterministic: FAIL");
  details.push(b1.decisionPenalty >= c.expectPenaltyMin ? "Penalty: PASS" : "Penalty: FAIL");
  if (c.expectRest) {
    details.push(b1.adaptationBias.forceExtendRest ? "Rest bias: PASS" : "Rest bias: FAIL");
  }

  const adaptation = buildAdaptivePlan({
    team_action: "REDUCED",
    exception_action: "NORMAL",
    fatigue_type: "NEURAL",
    fatigue_severity: "MODERATE",
    recommended_modifiers: ["NEURAL_LOW_DENSITY"],
    neural_bias: b1.adaptationBias,
  });

  if ((b1.adaptationBias.extraReduceVolumePct ?? 0) > 0) {
    details.push(
      (adaptation.reduceVolumePct ?? 0) >= (b1.adaptationBias.extraReduceVolumePct ?? 0)
        ? "Adaptation merge volume: PASS"
        : "Adaptation merge volume: FAIL"
    );
  }
  if ((b1.adaptationBias.extraReduceContactsPct ?? 0) > 0) {
    details.push(
      (adaptation.reduceContactsPct ?? 0) >= (b1.adaptationBias.extraReduceContactsPct ?? 0)
        ? "Adaptation merge contacts: PASS"
        : "Adaptation merge contacts: FAIL"
    );
  }

  const pass = details.every((d) => d.includes("PASS"));
  return { id: c.id, pass, details };
}

function validateTeamCase(c: TeamCase): NeuralBiasValidationCaseResult {
  const b1 = getTeamNeuralBias(c.summary);
  const b2 = getTeamNeuralBias(c.summary);
  const details: string[] = [];

  details.push(JSON.stringify(b1) === JSON.stringify(b2) ? "Deterministic: PASS" : "Deterministic: FAIL");
  details.push(b1.scorePenalty >= c.expectPenaltyMin ? "Penalty: PASS" : "Penalty: FAIL");
  details.push(b1.reasonCodes.length > 0 || c.expectPenaltyMin === 0 ? "Reasons: PASS" : "Reasons: FAIL");

  const pass = details.every((d) => d.includes("PASS"));
  return { id: c.id, pass, details };
}

export function runNeuralBiasValidationSuite(): NeuralBiasValidationSuiteResult {
  const playerCases: PlayerCase[] = [
    {
      id: "P-STABLE",
      neuralLoadState: "STABLE",
      readinessTrajectory: "FLAT",
      nextDayRisk: "LOW",
      expectPenaltyMin: 0,
    },
    {
      id: "P-RISING",
      neuralLoadState: "RISING",
      readinessTrajectory: "DECLINING",
      nextDayRisk: "MODERATE",
      expectPenaltyMin: 4,
    },
    {
      id: "P-HIGH",
      neuralLoadState: "HIGH",
      readinessTrajectory: "DECLINING",
      nextDayRisk: "HIGH",
      expectPenaltyMin: 8,
      expectRest: true,
    },
    {
      id: "P-CRITICAL",
      neuralLoadState: "CRITICAL",
      readinessTrajectory: "DECLINING",
      nextDayRisk: "HIGH",
      expectPenaltyMin: 12,
      expectRest: true,
    },
  ];

  const teamCases: TeamCase[] = [
    {
      id: "T-STABLE",
      summary: {
        dominantState: "STABLE",
        trajectorySummary: "FLAT",
        nextDayRiskSummary: "LOW",
        counts: { STABLE: 8, RISING: 2, HIGH: 0, CRITICAL: 0 },
        highRiskCount: 0,
        summaryText: "Stable.",
      },
      expectPenaltyMin: 0,
    },
    {
      id: "T-RISING",
      summary: {
        dominantState: "RISING",
        trajectorySummary: "DECLINING",
        nextDayRiskSummary: "MODERATE",
        counts: { STABLE: 2, RISING: 6, HIGH: 2, CRITICAL: 0 },
        highRiskCount: 1,
        summaryText: "Rising.",
      },
      expectPenaltyMin: 4,
    },
    {
      id: "T-HIGH",
      summary: {
        dominantState: "HIGH",
        trajectorySummary: "DECLINING",
        nextDayRiskSummary: "HIGH",
        counts: { STABLE: 1, RISING: 3, HIGH: 5, CRITICAL: 1 },
        highRiskCount: 4,
        summaryText: "High.",
      },
      expectPenaltyMin: 8,
    },
  ];

  const results: NeuralBiasValidationCaseResult[] = [];
  for (const c of playerCases) results.push(validatePlayerCase(c));
  for (const c of teamCases) results.push(validateTeamCase(c));

  const passed = results.filter((r) => r.pass).length;
  return {
    total: results.length,
    passed,
    failed: results.length - passed,
    cases: results,
  };
}

