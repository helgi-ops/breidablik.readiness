import type { CalibrationConfig, DeepPartial } from "@/lib/calibration/config";
import { DEFAULT_CALIBRATION_CONFIG, resolveCalibrationConfig, withNeuralBiasDisabled } from "@/lib/calibration/config";
import {
  computeTeamDecision,
  type PlayerException,
  type PlayerSignal,
  type SessionContext,
  type TeamDecisionResult,
} from "@/lib/decision/engine";
import { buildAdaptivePlan, formatAdaptiveSummary } from "@/lib/training/adaptiveEngine";
import type { FatigueSeverity, FatigueType, TrainingModifier } from "@/lib/fatigue/types";
import type { ExceptionAction, TrainingAction } from "@/lib/training/adaptiveEngine";
import type { NeuralAdaptationBias } from "@/lib/neuralLoad/bias";

export type CalibrationCaseInput = {
  caseId: string;
  title: string;
  players: PlayerSignal[];
  yday: SessionContext;
  focusPlayerId?: string;
  expectedOutcome?: string;
  acceptableRange?: string;
  reviewNotes?: string;
};

export type DecisionRunOutput = {
  result: TeamDecisionResult;
  focusException: PlayerException | null;
  config: CalibrationConfig;
};

export type CaseComparisonReport = {
  caseId: string;
  title: string;
  base: {
    teamAction: TeamDecisionResult["team_action"];
    decisionScore: number;
    playerAction: string | null;
    adaptationSummary: string | null;
    neuralBiasApplied: boolean;
  };
  tuned: {
    teamAction: TeamDecisionResult["team_action"];
    decisionScore: number;
    playerAction: string | null;
    adaptationSummary: string | null;
    neuralBiasApplied: boolean;
  };
  differences: string[];
  expectedOutcome?: string;
  acceptableRange?: string;
  reviewNotes?: string;
};

export type AdaptationCalibrationInput = {
  teamAction: TrainingAction;
  exceptionAction: ExceptionAction;
  fatigueType: FatigueType;
  fatigueSeverity: FatigueSeverity;
  modifiers: TrainingModifier[];
  neuralBias?: NeuralAdaptationBias | null;
};

export function runDecisionWithConfig(
  input: Pick<CalibrationCaseInput, "players" | "yday" | "focusPlayerId">,
  config?: DeepPartial<CalibrationConfig>
): DecisionRunOutput {
  const resolved = resolveCalibrationConfig(config);
  const result = computeTeamDecision(input.players, input.yday, { calibrationConfig: resolved });
  const focusException =
    input.focusPlayerId != null
      ? result.exceptions.find((x) => String(x.player_id) === String(input.focusPlayerId)) ?? null
      : null;
  return { result, focusException, config: resolved };
}

export function runDecisionWithNeuralBiasDisabled(
  input: Pick<CalibrationCaseInput, "players" | "yday" | "focusPlayerId">,
  config?: DeepPartial<CalibrationConfig>
): DecisionRunOutput {
  return runDecisionWithConfig(input, withNeuralBiasDisabled(config));
}

export function runAdaptationWithConfig(
  input: AdaptationCalibrationInput,
  config?: DeepPartial<CalibrationConfig>
) {
  const resolved = resolveCalibrationConfig(config);
  const adaptation = buildAdaptivePlan({
    team_action: input.teamAction,
    exception_action: input.exceptionAction,
    fatigue_type: input.fatigueType,
    fatigue_severity: input.fatigueSeverity,
    recommended_modifiers: input.modifiers,
    neural_bias: input.neuralBias ?? undefined,
    calibration_config: resolved,
  });
  return {
    adaptation,
    adaptationSummary: formatAdaptiveSummary(adaptation),
    config: resolved,
  };
}

export function compareBaselineVsTunedCase(
  input: CalibrationCaseInput,
  tunedConfig?: DeepPartial<CalibrationConfig>,
  baseConfig: DeepPartial<CalibrationConfig> = DEFAULT_CALIBRATION_CONFIG
): CaseComparisonReport {
  const base = runDecisionWithConfig(input, baseConfig);
  const tuned = runDecisionWithConfig(input, tunedConfig);
  const differences: string[] = [];

  if (base.result.team_action !== tuned.result.team_action) {
    differences.push(`teamAction changed ${base.result.team_action} -> ${tuned.result.team_action}`);
  }
  if (base.result.decision_score !== tuned.result.decision_score) {
    differences.push(
      `decisionScore changed ${base.result.decision_score} -> ${tuned.result.decision_score}`
    );
  }

  const basePlayerAction = base.focusException?.action ?? null;
  const tunedPlayerAction = tuned.focusException?.action ?? null;
  if (basePlayerAction !== tunedPlayerAction) {
    differences.push(`playerAction changed ${basePlayerAction ?? "—"} -> ${tunedPlayerAction ?? "—"}`);
  }

  const baseAdaptation = base.focusException?.adaptation_summary ?? null;
  const tunedAdaptation = tuned.focusException?.adaptation_summary ?? null;
  if ((baseAdaptation ?? "") !== (tunedAdaptation ?? "")) {
    differences.push(`adaptationSummary changed "${baseAdaptation ?? "—"}" -> "${tunedAdaptation ?? "—"}"`);
  }

  const baseBias = !!base.result.neural_bias_applied || !!base.focusException?.neural_bias_applied;
  const tunedBias = !!tuned.result.neural_bias_applied || !!tuned.focusException?.neural_bias_applied;
  if (baseBias !== tunedBias) {
    differences.push(`neuralBiasApplied changed ${baseBias ? "ON" : "OFF"} -> ${tunedBias ? "ON" : "OFF"}`);
  }

  return {
    caseId: input.caseId,
    title: input.title,
    base: {
      teamAction: base.result.team_action,
      decisionScore: base.result.decision_score,
      playerAction: basePlayerAction,
      adaptationSummary: baseAdaptation,
      neuralBiasApplied: baseBias,
    },
    tuned: {
      teamAction: tuned.result.team_action,
      decisionScore: tuned.result.decision_score,
      playerAction: tunedPlayerAction,
      adaptationSummary: tunedAdaptation,
      neuralBiasApplied: tunedBias,
    },
    differences,
    expectedOutcome: input.expectedOutcome,
    acceptableRange: input.acceptableRange,
    reviewNotes: input.reviewNotes,
  };
}

