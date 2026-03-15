import { buildInjuryRiskDecision } from "./index";

type InjuryValidationCase = {
  id: string;
  title: string;
  input: Parameters<typeof buildInjuryRiskDecision>[0];
  readinessState: "GREEN" | "YELLOW" | "RED" | "GRAY";
  assert: (decision: ReturnType<typeof buildInjuryRiskDecision>) => { pass: boolean; notes: string[] };
};

export type InjuryValidationResult = {
  id: string;
  title: string;
  pass: boolean;
  level: ReturnType<typeof buildInjuryRiskDecision>["injuryRiskLevel"];
  notes: string[];
};

export type InjuryValidationSuite = {
  total: number;
  passed: number;
  failed: number;
  results: InjuryValidationResult[];
};

function buildCases(): InjuryValidationCase[] {
  return [
    {
      id: "A",
      title: "High volatility + strong readiness + soreness 4 should not force high risk",
      input: {
        acwr: 1.05,
        zScore: 1.7,
        deltaZ: 0.2,
        volatility: 45,
        sleepScore: 4,
        hrvChangePct: 1,
        sorenessScore: 4,
        sorenessFlag: false,
        painFlag: false,
      },
      readinessState: "GREEN",
      assert: (decision) => {
        const notes: string[] = [];
        const pass = decision.injuryRiskLevel !== "HIGH";
        notes.push(pass ? "PASS: no high-risk escalation" : "FAIL: incorrectly escalated to HIGH");
        return { pass, notes };
      },
    },
    {
      id: "B",
      title: "Low soreness + poor recovery should raise risk",
      input: {
        acwr: 1.35,
        zScore: -0.8,
        deltaZ: -0.3,
        volatility: 38,
        sleepScore: 2,
        hrvChangePct: -10,
        sorenessScore: 1,
        sorenessFlag: true,
        painFlag: false,
      },
      readinessState: "YELLOW",
      assert: (decision) => {
        const notes: string[] = [];
        const pass = decision.injuryRiskLevel === "MODERATE" || decision.injuryRiskLevel === "HIGH";
        notes.push(pass ? "PASS: risk elevated appropriately" : "FAIL: risk not elevated");
        return { pass, notes };
      },
    },
  ];
}

export function runInjuryRiskValidationSuite(): InjuryValidationSuite {
  const results: InjuryValidationResult[] = buildCases().map((testCase) => {
    const decision = buildInjuryRiskDecision(testCase.input, { athleteState: testCase.readinessState });
    const outcome = testCase.assert(decision);
    return {
      id: testCase.id,
      title: testCase.title,
      pass: outcome.pass,
      level: decision.injuryRiskLevel,
      notes: outcome.notes,
    };
  });

  const passed = results.filter((r) => r.pass).length;
  return {
    total: results.length,
    passed,
    failed: results.length - passed,
    results,
  };
}
