import { buildExplainableReadinessDecision } from "./index";
import type { ExplainableReadinessDecision, NormalizedPlayerMonitoringInput } from "./types";

type ReadinessValidationCase = {
  id: string;
  title: string;
  input: NormalizedPlayerMonitoringInput;
  assert: (decision: ExplainableReadinessDecision) => { pass: boolean; notes: string[] };
};

export type ReadinessValidationResult = {
  id: string;
  title: string;
  pass: boolean;
  state: ExplainableReadinessDecision["athleteState"];
  sessionMode: ExplainableReadinessDecision["sessionMode"];
  notes: string[];
};

export type ReadinessValidationSuite = {
  total: number;
  passed: number;
  failed: number;
  results: ReadinessValidationResult[];
};

function buildCases(): ReadinessValidationCase[] {
  return [
    {
      id: "A",
      title: "Good readiness + soreness 4 + high volatility should not force recovery",
      input: {
        playerId: "A",
        playerName: "Case A",
        date: "2026-03-12",
        readinessScore: 78,
        zScore: 1.7,
        deltaZ: 0.2,
        volatility: 48,
        sleepScore: 4,
        hrvChangePct: 2,
        acwr: 1.02,
        sorenessScore: 4,
        lightAteState: null,
      },
      assert: (decision) => {
        const notes: string[] = [];
        const recoveryForced = decision.athleteState === "RED" || decision.sessionMode === "recovery";
        const volatilityOverrode = decision.riskFactors.includes("high_volatility");
        notes.push(recoveryForced ? "FAIL: recovery forced" : "PASS: no recovery force");
        notes.push(volatilityOverrode ? "FAIL: volatility dominated" : "PASS: volatility de-emphasized");
        return { pass: !recoveryForced && !volatilityOverrode, notes };
      },
    },
    {
      id: "B",
      title: "Good readiness + low soreness still keeps caution",
      input: {
        playerId: "B",
        playerName: "Case B",
        date: "2026-03-12",
        readinessScore: 80,
        zScore: 1.8,
        deltaZ: 0.1,
        volatility: 20,
        sleepScore: 4,
        hrvChangePct: 1,
        acwr: 1.0,
        sorenessScore: 2,
        lightAteState: null,
      },
      assert: (decision) => {
        const notes: string[] = [];
        const cautious = decision.athleteState === "YELLOW" || decision.riskFactors.includes("low_soreness_caution");
        notes.push(cautious ? "PASS: low soreness caution applied" : "FAIL: low soreness caution missing");
        return { pass: cautious, notes };
      },
    },
    {
      id: "C",
      title: "Poor readiness + low soreness should be conservative",
      input: {
        playerId: "C",
        playerName: "Case C",
        date: "2026-03-12",
        readinessScore: 32,
        zScore: -1.2,
        deltaZ: -0.5,
        volatility: 30,
        sleepScore: 2,
        hrvChangePct: -12,
        acwr: 1.3,
        sorenessScore: 1,
        lightAteState: null,
      },
      assert: (decision) => {
        const notes: string[] = [];
        const conservative = decision.athleteState === "RED" || decision.sessionMode === "recovery";
        notes.push(conservative ? "PASS: conservative decision applied" : "FAIL: conservative decision missing");
        return { pass: conservative, notes };
      },
    },
    {
      id: "D",
      title: "Soreness 4/5 should never be treated as elevated soreness risk",
      input: {
        playerId: "D",
        playerName: "Case D",
        date: "2026-03-12",
        readinessScore: 72,
        zScore: 1.6,
        deltaZ: 0.1,
        volatility: 22,
        sleepScore: 4,
        hrvChangePct: 0,
        acwr: 1.0,
        sorenessScore: 5,
        lightAteState: null,
      },
      assert: (decision) => {
        const notes: string[] = [];
        const hasPositiveSorenessCopy = decision.why.some((line) =>
          line.toLowerCase().includes("muscle soreness does not currently suggest elevated recovery concern")
        );
        notes.push(hasPositiveSorenessCopy ? "PASS: positive soreness explanation present" : "FAIL: positive soreness explanation missing");
        return { pass: hasPositiveSorenessCopy, notes };
      },
    },
    {
      id: "E",
      title: "Low tissue severity + strong readiness guardrail must not force RED",
      input: {
        playerId: "E",
        playerName: "Case E",
        date: "2026-03-12",
        readinessScore: 74,
        zScore: 1.75,
        stenScore: 9,
        deltaZ: 0.15,
        volatility: 42,
        sleepScore: 4,
        hrvChangePct: 1,
        acwr: 1.0,
        sorenessScore: 4,
        tissueSignal: true,
        tissueSeverity: "LOW",
        painFlag: true,
        lightAteState: null,
      },
      assert: (decision) => {
        const notes: string[] = [];
        const noRed = decision.athleteState !== "RED" && decision.sessionMode !== "recovery";
        const noPainProtectionCopy = !decision.why.some((line) =>
          line.toLowerCase().includes("pain-related protection is active")
        );
        notes.push(noRed ? "PASS: not forced to RED" : "FAIL: forced to RED");
        notes.push(noPainProtectionCopy ? "PASS: no pain-protection wording" : "FAIL: pain-protection wording shown");
        return { pass: noRed && noPainProtectionCopy, notes };
      },
    },
  ];
}

export function runReadinessValidationSuite(): ReadinessValidationSuite {
  const results: ReadinessValidationResult[] = buildCases().map((testCase) => {
    const decision = buildExplainableReadinessDecision(testCase.input);
    const outcome = testCase.assert(decision);
    return {
      id: testCase.id,
      title: testCase.title,
      pass: outcome.pass,
      state: decision.athleteState,
      sessionMode: decision.sessionMode,
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
