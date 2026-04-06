import { buildLightAteDecision } from "./decision";
import { buildDailyTrainingGraphFromLightAte } from "../trainingGraph/integration";
import type { LightAteDecisionInput } from "./types";

export type LightAteValidationCaseResult = {
  id: string;
  title: string;
  pass: boolean;
  notes: string[];
};

export type LightAteValidationSuiteResult = {
  total: number;
  passed: number;
  failed: number;
  cases: LightAteValidationCaseResult[];
};

function runCaseArnorStrongGreenMissingContext(): LightAteValidationCaseResult {
  const input: LightAteDecisionInput = {
    readinessScore: 87.5, // z=1.75 equivalent strong day support
    neuralFatigueBand: null,
    yesterdayLoadBand: null,
    mdContext: "UNKNOWN",
  };

  const decision = buildLightAteDecision(input);
  const graph = buildDailyTrainingGraphFromLightAte(input);

  const notes: string[] = [];
  const notRed = decision.athleteState !== "RED" && decision.templateId !== "red_reset_session";
  const noMajorReduction =
    !(typeof decision.modifiers.reduceSetsBy === "number" && decision.modifiers.reduceSetsBy >= 2) &&
    decision.modifiers.disableContrast !== true &&
    decision.modifiers.replaceBallisticPrimer !== true;
  const graphNonRecovery =
    graph.ok && graph.resolvedSession.intent !== "RESET" && graph.resolvedSession.blueprintId !== "red_reset_session";

  notes.push(notRed ? "PASS: no reset template/state" : "FAIL: reset template/state selected");
  notes.push(noMajorReduction ? "PASS: no major reduction package" : "FAIL: major reduction package applied");
  notes.push(graphNonRecovery ? "PASS: graph intent is non-recovery" : "FAIL: graph intent resolved to recovery/reset");

  return {
    id: "ARNOR_STRONG_GREEN_MISSING_CONTEXT",
    title: "Strong GREEN + missing context should not force recovery bias/reset",
    pass: notRed && noMajorReduction && graphNonRecovery,
    notes,
  };
}

export function runLightAteValidationSuite(): LightAteValidationSuiteResult {
  const cases = [runCaseArnorStrongGreenMissingContext()];
  const passed = cases.filter((c) => c.pass).length;
  return {
    total: cases.length,
    passed,
    failed: cases.length - passed,
    cases,
  };
}
