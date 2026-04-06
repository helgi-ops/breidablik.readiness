import type { CalibrationConfig, DeepPartial } from "@/lib/calibration/config";
import { resolveCalibrationConfig } from "@/lib/calibration/config";
import {
  compareBaselineVsTunedCase,
  runDecisionWithConfig,
  runDecisionWithNeuralBiasDisabled,
  type CaseComparisonReport,
} from "@/lib/calibration/compare";
import { calibrationFixtures } from "@/lib/calibration/fixtures";

export type CalibrationSuiteMetrics = {
  totalCases: number;
  teamActionChanged: number;
  playerActionChanged: number;
  neuralBiasAppliedBase: number;
  neuralBiasAppliedTuned: number;
  averageDecisionScoreDelta: number;
  scoreDeltaOver10Count: number;
  noSprintCountBase: number;
  noSprintCountTuned: number;
  recoveryOnlyCountBase: number;
  recoveryOnlyCountTuned: number;
  adaptationChanged: number;
};

export type NeuralBiasToggleReport = {
  caseId: string;
  title: string;
  withBias: {
    teamAction: string;
    decisionScore: number;
    focusPlayerAction: string | null;
    neuralBiasApplied: boolean;
  };
  withoutBias: {
    teamAction: string;
    decisionScore: number;
    focusPlayerAction: string | null;
    neuralBiasApplied: boolean;
  };
  differences: string[];
};

export type CalibrationSuiteResult = {
  configLabel: string;
  baseConfig: CalibrationConfig;
  tunedConfig: CalibrationConfig;
  comparisons: CaseComparisonReport[];
  metrics: CalibrationSuiteMetrics;
  neuralBiasOnOff: NeuralBiasToggleReport[];
  warnings: string[];
};

function avg(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function countByAction(exceptions: Array<{ action: string }>, action: string): number {
  return exceptions.filter((e) => e.action === action).length;
}

function buildMetrics(comparisons: CaseComparisonReport[]): CalibrationSuiteMetrics {
  const scoreDeltas = comparisons.map((c) => c.tuned.decisionScore - c.base.decisionScore);
  return {
    totalCases: comparisons.length,
    teamActionChanged: comparisons.filter((c) => c.base.teamAction !== c.tuned.teamAction).length,
    playerActionChanged: comparisons.filter((c) => (c.base.playerAction ?? "") !== (c.tuned.playerAction ?? "")).length,
    neuralBiasAppliedBase: comparisons.filter((c) => c.base.neuralBiasApplied).length,
    neuralBiasAppliedTuned: comparisons.filter((c) => c.tuned.neuralBiasApplied).length,
    averageDecisionScoreDelta: Number(avg(scoreDeltas).toFixed(2)),
    scoreDeltaOver10Count: scoreDeltas.filter((d) => Math.abs(d) > 10).length,
    noSprintCountBase: 0,
    noSprintCountTuned: 0,
    recoveryOnlyCountBase: 0,
    recoveryOnlyCountTuned: 0,
    adaptationChanged: comparisons.filter((c) => (c.base.adaptationSummary ?? "") !== (c.tuned.adaptationSummary ?? "")).length,
  };
}

function suspiciousWarnings(metrics: CalibrationSuiteMetrics): string[] {
  const out: string[] = [];
  if (metrics.totalCases === 0) return out;

  if (metrics.teamActionChanged / metrics.totalCases > 0.5) {
    out.push("High volatility: more than 50% of cases changed team action.");
  }
  if (metrics.playerActionChanged / metrics.totalCases > 0.6) {
    out.push("High player-action drift: more than 60% of cases changed player action.");
  }
  if (metrics.scoreDeltaOver10Count / metrics.totalCases > 0.4) {
    out.push("Large score swings detected (>10 points) in many cases.");
  }
  if (metrics.neuralBiasAppliedTuned > metrics.neuralBiasAppliedBase + 3) {
    out.push("Tuned config applies neural bias substantially more often.");
  }
  return out;
}

function buildNeuralBiasOnOffReports(config?: DeepPartial<CalibrationConfig>): NeuralBiasToggleReport[] {
  const cases = calibrationFixtures();
  const out: NeuralBiasToggleReport[] = [];
  for (const c of cases) {
    const withBias = runDecisionWithConfig(c, config);
    const withoutBias = runDecisionWithNeuralBiasDisabled(c, config);
    const diffs: string[] = [];

    if (withBias.result.team_action !== withoutBias.result.team_action) {
      diffs.push(`team action ${withBias.result.team_action} -> ${withoutBias.result.team_action}`);
    }
    if (withBias.result.decision_score !== withoutBias.result.decision_score) {
      diffs.push(`score ${withBias.result.decision_score} -> ${withoutBias.result.decision_score}`);
    }

    const withPlayer = withBias.focusException?.action ?? null;
    const withoutPlayer = withoutBias.focusException?.action ?? null;
    if ((withPlayer ?? "") !== (withoutPlayer ?? "")) {
      diffs.push(`focus player action ${withPlayer ?? "—"} -> ${withoutPlayer ?? "—"}`);
    }

    out.push({
      caseId: c.caseId,
      title: c.title,
      withBias: {
        teamAction: withBias.result.team_action,
        decisionScore: withBias.result.decision_score,
        focusPlayerAction: withPlayer,
        neuralBiasApplied: !!withBias.result.neural_bias_applied || !!withBias.focusException?.neural_bias_applied,
      },
      withoutBias: {
        teamAction: withoutBias.result.team_action,
        decisionScore: withoutBias.result.decision_score,
        focusPlayerAction: withoutPlayer,
        neuralBiasApplied:
          !!withoutBias.result.neural_bias_applied || !!withoutBias.focusException?.neural_bias_applied,
      },
      differences: diffs,
    });
  }
  return out;
}

export function runCalibrationSuite(input?: {
  configLabel?: string;
  tunedConfig?: DeepPartial<CalibrationConfig>;
  baseConfig?: DeepPartial<CalibrationConfig>;
}): CalibrationSuiteResult {
  const configLabel = input?.configLabel ?? "default";
  const cases = calibrationFixtures();
  const tunedConfig = resolveCalibrationConfig(input?.tunedConfig);
  const baseConfig = resolveCalibrationConfig(input?.baseConfig);

  const comparisons = cases.map((c) =>
    compareBaselineVsTunedCase(c, tunedConfig, baseConfig)
  );

  const metrics = buildMetrics(comparisons);

  for (const c of cases) {
    const baseRun = runDecisionWithConfig(c, baseConfig);
    const tunedRun = runDecisionWithConfig(c, tunedConfig);
    metrics.noSprintCountBase += countByAction(baseRun.result.exceptions as Array<{ action: string }>, "NO_SPRINT");
    metrics.noSprintCountTuned += countByAction(tunedRun.result.exceptions as Array<{ action: string }>, "NO_SPRINT");
    metrics.recoveryOnlyCountBase += countByAction(baseRun.result.exceptions as Array<{ action: string }>, "RECOVERY_ONLY");
    metrics.recoveryOnlyCountTuned += countByAction(
      tunedRun.result.exceptions as Array<{ action: string }>,
      "RECOVERY_ONLY"
    );
  }

  const warnings = suspiciousWarnings(metrics);
  const neuralBiasOnOff = buildNeuralBiasOnOffReports(tunedConfig);

  return {
    configLabel,
    baseConfig,
    tunedConfig,
    comparisons,
    metrics,
    neuralBiasOnOff,
    warnings,
  };
}
