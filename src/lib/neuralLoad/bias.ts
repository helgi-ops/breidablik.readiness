import type { NeuralLoadState, NextDayRisk, ReadinessTrajectory, TeamNeuralLoadSummary } from "@/lib/neuralLoad/types";
import type { CalibrationConfig, DeepPartial } from "@/lib/calibration/config";
import { resolveCalibrationConfig } from "@/lib/calibration/config";

export type NeuralAdaptationBias = {
  extraReduceVolumePct?: number;
  extraReduceContactsPct?: number;
  forceExtendRest?: boolean;
  preferSimplifySession?: boolean;
  preferRecoveryBias?: boolean;
};

export type PlayerNeuralBias = {
  decisionPenalty: number;
  addReasonCodes: string[];
  adaptationBias: NeuralAdaptationBias;
};

export type TeamNeuralBias = {
  scorePenalty: number;
  reasonCodes: string[];
};

function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

export function getPlayerNeuralBias(input: {
  neuralLoadState: NeuralLoadState;
  readinessTrajectory: ReadinessTrajectory;
  nextDayRisk: NextDayRisk;
}, calibrationConfig?: DeepPartial<CalibrationConfig>): PlayerNeuralBias {
  const cfg = resolveCalibrationConfig(calibrationConfig);
  const reasonCodes: string[] = [];
  const adaptationBias: NeuralAdaptationBias = {};
  let decisionPenalty = 0;

  const s = input.neuralLoadState;
  const t = input.readinessTrajectory;
  const r = input.nextDayRisk;

  if (!cfg.neuralBias.enabled) {
    return {
      decisionPenalty,
      addReasonCodes: [],
      adaptationBias,
    };
  }

  if (s === "RISING" && (t === "DECLINING" || t === "FLAT") && r === "MODERATE") {
    decisionPenalty = cfg.neuralBias.player.risingModerate.decisionPenalty;
    adaptationBias.extraReduceVolumePct = cfg.neuralBias.player.risingModerate.extraReduceVolumePct;
    reasonCodes.push("PLAYER_NEURAL_LOAD_RISING", "PLAYER_NEXT_DAY_RISK_MODERATE");
  }

  if (s === "HIGH" && t === "DECLINING" && (r === "MODERATE" || r === "HIGH")) {
    decisionPenalty = Math.max(decisionPenalty, cfg.neuralBias.player.high.decisionPenalty);
    adaptationBias.extraReduceVolumePct = cfg.neuralBias.player.high.extraReduceVolumePct;
    adaptationBias.extraReduceContactsPct = cfg.neuralBias.player.high.extraReduceContactsPct;
    adaptationBias.forceExtendRest = cfg.neuralBias.player.high.forceExtendRest;
    reasonCodes.push("PLAYER_NEURAL_LOAD_HIGH", "PLAYER_TRAJECTORY_DECLINING");
    if (r === "HIGH") reasonCodes.push("PLAYER_NEXT_DAY_RISK_HIGH");
  }

  if (s === "CRITICAL" && t === "DECLINING" && r === "HIGH") {
    decisionPenalty = Math.max(decisionPenalty, cfg.neuralBias.player.critical.decisionPenalty);
    adaptationBias.extraReduceVolumePct = cfg.neuralBias.player.critical.extraReduceVolumePct;
    adaptationBias.extraReduceContactsPct = cfg.neuralBias.player.critical.extraReduceContactsPct;
    adaptationBias.forceExtendRest = cfg.neuralBias.player.critical.forceExtendRest;
    adaptationBias.preferSimplifySession = cfg.neuralBias.player.critical.preferSimplifySession;
    adaptationBias.preferRecoveryBias = cfg.neuralBias.player.critical.preferRecoveryBias;
    reasonCodes.push(
      "PLAYER_NEURAL_LOAD_CRITICAL",
      "PLAYER_TRAJECTORY_DECLINING",
      "PLAYER_NEXT_DAY_RISK_HIGH"
    );
  }

  return {
    decisionPenalty,
    addReasonCodes: unique(reasonCodes),
    adaptationBias,
  };
}

export function getTeamNeuralBias(
  summary: TeamNeuralLoadSummary | null | undefined,
  calibrationConfig?: DeepPartial<CalibrationConfig>
): TeamNeuralBias {
  const cfg = resolveCalibrationConfig(calibrationConfig);
  if (!summary) return { scorePenalty: 0, reasonCodes: [] };
  if (!cfg.neuralBias.enabled) return { scorePenalty: 0, reasonCodes: [] };

  let scorePenalty = 0;
  const reasonCodes: string[] = [];

  if (
    summary.dominantState === "RISING" &&
    (summary.nextDayRiskSummary === "MODERATE" || summary.nextDayRiskSummary === "HIGH")
  ) {
    scorePenalty = Math.max(scorePenalty, cfg.neuralBias.team.risingPenalty);
    reasonCodes.push("TEAM_NEURAL_LOAD_RISING");
  }

  if (
    summary.dominantState === "HIGH" &&
    (summary.nextDayRiskSummary === "MODERATE" || summary.nextDayRiskSummary === "HIGH")
  ) {
    scorePenalty = Math.max(scorePenalty, cfg.neuralBias.team.highPenalty);
    reasonCodes.push("TEAM_NEURAL_LOAD_HIGH");
  }

  if (
    summary.dominantState === "CRITICAL" &&
    summary.nextDayRiskSummary === "HIGH" &&
    summary.highRiskCount >= cfg.neuralBias.team.criticalMinHighRiskCount
  ) {
    scorePenalty = Math.max(scorePenalty, cfg.neuralBias.team.criticalPenalty);
    reasonCodes.push("TEAM_NEURAL_LOAD_CRITICAL");
  }

  if (summary.nextDayRiskSummary === "MODERATE") {
    reasonCodes.push("TEAM_NEXT_DAY_RISK_MODERATE");
  } else if (summary.nextDayRiskSummary === "HIGH") {
    reasonCodes.push("TEAM_NEXT_DAY_RISK_HIGH");
  }

  return {
    scorePenalty,
    reasonCodes: unique(reasonCodes),
  };
}
