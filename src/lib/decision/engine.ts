import type { CalibrationConfig, DeepPartial } from "@/lib/calibration/config";
import { resolveCalibrationConfig } from "@/lib/calibration/config";
import { classifyFatigue } from "@/lib/fatigue/classify";
import { buildTeamFatigueSummary } from "@/lib/fatigue/teamSummary";
import type { CmjFatigueEvidence, FatigueClassification, FatigueInput } from "@/lib/fatigue/types";
import { getPlayerNeuralBias, getTeamNeuralBias } from "@/lib/neuralLoad/bias";
import { classifyNeuralLoad } from "@/lib/neuralLoad/classify";
import { buildTeamNeuralLoadSummary } from "@/lib/neuralLoad/teamSummary";
import type { NeuralLoadClassification, NeuralLoadInput, TeamNeuralLoadSummary } from "@/lib/neuralLoad/types";
import { buildAdaptivePlan, formatAdaptiveSummary, type TrainingAdaptation } from "@/lib/training/adaptiveEngine";

export type TrainingAction = "FULL" | "REDUCED" | "RECOVERY";
export type ExceptionAction = "NORMAL" | "NO_SPRINT" | "REDUCE_VOLUME" | "RECOVERY_ONLY";

export type PlayerSignal = {
  player_id: string;
  z: number | null;
  z_prev: number | null;
  deltaZ?: number | null;
  is_medical?: boolean | null;

  player_name?: string | null;
  energy?: number | null;
  sleep_quality?: number | null;
  sleep_duration?: number | null;
  stress?: number | null;
  soreness?: number | null;

  total_score?: number | null;
  sten_score?: number | null;
  z_readiness?: number | null;
  delta_z?: number | null;
  low_sten_days?: number | null;

  has_pain_flag?: boolean | null;
  pain_location?: string | null;
  repeated_same_complaint?: boolean | null;
  local_complaint_matches_load?: boolean | null;

  /** Measured-CMJ evidence for the fatigue-type split, derived upstream by
   *  `deriveCmjFatigueEvidence()` from this player's VALD phase-change results.
   *  Absent for non-VALD teams (fatigue confidence then unaffected). */
  cmj_evidence?: CmjFatigueEvidence | null;

  id?: string | null;
  name?: string | null;
};

export type SessionContext = {
  hsr_m?: number | null;
  acc_dec_total?: number | null;
  total_distance_m?: number | null;
  max_velocity_pct?: number | null;
  intensity?: "LOW" | "MEDIUM" | "HIGH" | null;

  md_day?: string | null;
  match_minutes_high?: boolean | null;
  /** Actual minutes played by this player in the most recent match. */
  match_minutes_played?: number | null;
  schedule_congestion?: boolean | null;
  travel_flag?: boolean | null;
  team_volatility_high?: boolean | null;
};

export type PlayerException = {
  player_id: string;
  action: ExceptionAction;
  reason_codes: string[];
  fatigue?: FatigueClassification;
  neural_load?: NeuralLoadClassification;
  neural_bias_applied?: boolean;
  neural_bias_reason_codes?: string[];
  adaptation?: TrainingAdaptation;
  adaptation_summary?: string;
};

export type TeamDecisionResult = {
  team_action: TrainingAction;
  decision_score: number;
  reasons: string[];
  exceptions: PlayerException[];
  teamFatigueSummary?: ReturnType<typeof buildTeamFatigueSummary>;
  teamNeuralLoadSummary?: TeamNeuralLoadSummary;
  neural_bias_applied?: boolean;
  neural_bias_reason_codes?: string[];
};

export function computeDeltaZ(z: number | null, zPrev: number | null): number | null {
  if (z == null || zPrev == null) return null;
  return z - zPrev;
}

export function loadScore(ctx: SessionContext): { score: number; reason?: string } {
  if (
    ctx.hsr_m == null &&
    ctx.acc_dec_total == null &&
    ctx.total_distance_m == null &&
    ctx.max_velocity_pct == null
  ) {
    const intensity = ctx.intensity ?? null;
    if (intensity === "LOW") return { score: 20, reason: "YDAY_LOAD_LOW" };
    if (intensity === "MEDIUM") return { score: 50, reason: "YDAY_LOAD_MEDIUM" };
    if (intensity === "HIGH") return { score: 80, reason: "YDAY_LOAD_HIGH" };
    return { score: 40, reason: "YDAY_LOAD_UNKNOWN" };
  }

  const hsr = Math.min(Math.max((ctx.hsr_m ?? 0) / 1200, 0), 1);
  const acc = Math.min(Math.max((ctx.acc_dec_total ?? 0) / 140, 0), 1);
  const dist = Math.min(Math.max((ctx.total_distance_m ?? 0) / 10000, 0), 1);
  const vmax = Math.min(Math.max(((ctx.max_velocity_pct ?? 0) - 70) / 30, 0), 1);

  const score = Math.round(hsr * 35 + acc * 35 + dist * 20 + vmax * 10);

  let reason = "YDAY_LOAD_MEDIUM";
  if (score >= 70) reason = "YDAY_LOAD_HIGH";
  else if (score <= 30) reason = "YDAY_LOAD_LOW";

  return { score, reason };
}

export function teamReadinessScore(players: PlayerSignal[]): { score: number; reason?: string } {
  const zs = players.map((p) => p.z).filter((v): v is number => v != null);
  if (zs.length === 0) return { score: 55, reason: "READINESS_UNKNOWN" };

  const sorted = [...zs].sort((a, b) => a - b);
  const trim = Math.floor(sorted.length * 0.1);
  const trimmed = sorted.slice(trim, Math.max(trim + 1, sorted.length - trim));
  const avg = trimmed.reduce((s, v) => s + v, 0) / trimmed.length;

  const score = Math.round(Math.max(0, Math.min(100, 60 + avg * 15)));

  let reason = "READINESS_OK";
  if (avg <= -1.0) reason = "READINESS_LOW";
  if (avg <= -1.7) reason = "READINESS_VERY_LOW";
  if (avg >= 0.8) reason = "READINESS_HIGH";

  return { score, reason };
}

export function teamDeltaSignal(players: PlayerSignal[]): { dropFlag: boolean; reason?: string } {
  const d = players
    .map((p) => p.deltaZ ?? p.delta_z ?? computeDeltaZ(p.z, p.z_prev))
    .filter((v): v is number => v != null);

  if (d.length === 0) return { dropFlag: false };

  const sorted = [...d].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];

  if (median <= -0.8) return { dropFlag: true, reason: "TEAM_DROP_FAST" };
  return { dropFlag: false };
}

function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function normalizePainLocation(value: string | null | undefined) {
  if (!value) return null;
  const v = value.toUpperCase();

  if (v.includes("ACHILLES")) return "ACHILLES" as const;
  if (v.includes("HAMSTRING")) return "HAMSTRING" as const;
  if (v.includes("PATELLAR")) return "PATELLAR" as const;
  if (v.includes("GROIN")) return "GROIN" as const;
  if (v.includes("CALF")) return "CALF" as const;
  if (v.includes("ADDUCTOR")) return "ADDUCTOR" as const;
  return "OTHER" as const;
}

function buildFatigueInput(
  player: PlayerSignal,
  ctx: SessionContext,
  cfg: CalibrationConfig
): FatigueInput {
  const load = loadScore(ctx);

  return {
    playerId: player.player_id ?? player.id ?? "",
    playerName: player.player_name ?? player.name ?? undefined,

    energy: player.energy ?? null,
    sleepQuality: player.sleep_quality ?? null,
    sleepDuration: player.sleep_duration ?? null,
    stress: player.stress ?? null,
    soreness: player.soreness ?? null,

    totalScore: player.total_score ?? null,
    sten: player.sten_score ?? null,
    zReadiness: player.z_readiness ?? player.z ?? null,
    deltaZ: player.delta_z ?? player.deltaZ ?? computeDeltaZ(player.z, player.z_prev),

    lowStenDays: player.low_sten_days ?? 0,
    poorWellnessCount: null,

    hsrHighYesterday: (ctx.hsr_m ?? 0) >= cfg.loadExposure.hsrHighYesterday,
    accelHighYesterday: (ctx.acc_dec_total ?? 0) >= cfg.loadExposure.accDecHighYesterday,
    decelHighYesterday: (ctx.acc_dec_total ?? 0) >= cfg.loadExposure.accDecHighYesterday,
    totalDistanceHighYesterday: (ctx.total_distance_m ?? 0) >= cfg.loadExposure.totalDistanceHighYesterday,
    intensityHighYesterday: ctx.intensity === "HIGH" || load.score >= 70,
    matchMinutesHigh: !!ctx.match_minutes_high,
    matchMinutesPlayed: ctx.match_minutes_played ?? null,
    scheduleCongestion: !!ctx.schedule_congestion,
    travelFlag: !!ctx.travel_flag,

    hasPainFlag: !!player.has_pain_flag,
    painLocation: normalizePainLocation(player.pain_location),
    repeatedSameComplaint: !!player.repeated_same_complaint,
    localComplaintMatchesLoad: !!player.local_complaint_matches_load,

    mdDay: ctx.md_day ?? null,
    teamVolatilityHigh: !!ctx.team_volatility_high,

    hasWellnessData: [
      player.energy,
      player.sleep_quality,
      player.sleep_duration,
      player.stress,
      player.soreness,
    ].some((v) => v != null),

    hasLoadData:
      ctx.hsr_m != null ||
      ctx.acc_dec_total != null ||
      ctx.total_distance_m != null ||
      ctx.max_velocity_pct != null ||
      ctx.intensity != null,

    // Measured-CMJ evidence when the upstream VALD pipeline attached it (via
    // deriveCmjFatigueEvidence). undefined for non-VALD players — confidence
    // then unchanged; never treated as "no neural fatigue".
    cmj: player.cmj_evidence ?? undefined,
  };
}

function buildNeuralLoadInput(
  player: PlayerSignal,
  ctx: SessionContext,
  fatigue: FatigueClassification,
  cfg: CalibrationConfig
): NeuralLoadInput {
  return {
    playerId: player.player_id ?? player.id ?? "",
    z: player.z ?? null,
    zPrev: player.z_prev ?? null,
    deltaZ: player.delta_z ?? player.deltaZ ?? computeDeltaZ(player.z, player.z_prev),
    sten: player.sten_score ?? null,
    lowStenDays: player.low_sten_days ?? 0,
    totalScore: player.total_score ?? null,
    energy: player.energy ?? null,
    sleepQuality: player.sleep_quality ?? null,
    sleepDuration: player.sleep_duration ?? null,
    stress: player.stress ?? null,
    soreness: player.soreness ?? null,
    zHistory: null,
    volatility: null,
    hsrHighYesterday: (ctx.hsr_m ?? 0) >= cfg.loadExposure.hsrHighYesterday,
    maxVelocityHighYesterday: (ctx.max_velocity_pct ?? 0) >= cfg.loadExposure.maxVelocityHighYesterdayPct,
    scheduleCongestion: !!ctx.schedule_congestion,
    travelFlag: !!ctx.travel_flag,
    matchMinutesHigh: !!ctx.match_minutes_high,
    teamVolatilityHigh: !!ctx.team_volatility_high,
    fatigue: {
      primaryFatigueType: fatigue.primaryFatigueType ?? "NONE",
      severity: fatigue.severity ?? "LOW",
    },
  };
}

function applyPlayerNeuralBiasToAction(
  action: ExceptionAction,
  reasonCodes: string[],
  bias: ReturnType<typeof getPlayerNeuralBias>,
  cfg: CalibrationConfig
): ExceptionAction {
  if (action === "RECOVERY_ONLY") return action;
  if (bias.decisionPenalty <= 0) return action;

  const boostedReasons = unique([...reasonCodes, ...bias.addReasonCodes]);

  if (action === "NORMAL") {
    if (
      (bias.adaptationBias.extraReduceContactsPct ?? 0) >=
      cfg.neuralBias.player.actionNudgeThresholds.noSprintContactsPctMin
    ) {
      boostedReasons.push("PLAYER_NEURAL_BIAS_NO_SPRINT");
      reasonCodes.splice(0, reasonCodes.length, ...unique(boostedReasons));
      return "NO_SPRINT";
    }
    if (
      bias.decisionPenalty >=
      cfg.neuralBias.player.actionNudgeThresholds.reduceDecisionPenaltyMin
    ) {
      boostedReasons.push("PLAYER_NEURAL_BIAS_REDUCE");
      reasonCodes.splice(0, reasonCodes.length, ...unique(boostedReasons));
      return "REDUCE_VOLUME";
    }
  }

  if (
    action === "REDUCE_VOLUME" &&
    (bias.adaptationBias.extraReduceContactsPct ?? 0) >=
      cfg.neuralBias.player.actionNudgeThresholds.noSprintContactsPctMin
  ) {
    boostedReasons.push("PLAYER_NEURAL_BIAS_NO_SPRINT");
    reasonCodes.splice(0, reasonCodes.length, ...unique(boostedReasons));
    return "NO_SPRINT";
  }

  reasonCodes.splice(0, reasonCodes.length, ...unique(boostedReasons));
  return action;
}

function buildExceptions(
  players: PlayerSignal[],
  yday: SessionContext,
  teamAction: TrainingAction,
  cfg: CalibrationConfig
): PlayerException[] {
  const l = loadScore(yday);

  return players.map((p) => {
    const dz = p.deltaZ ?? p.delta_z ?? computeDeltaZ(p.z, p.z_prev);

    const reason_codes: string[] = [];
    let action: ExceptionAction = "NORMAL";

    const fatigueInput = buildFatigueInput(p, yday, cfg);
    const fatigue = classifyFatigue(fatigueInput);
    const neuralLoad = classifyNeuralLoad(buildNeuralLoadInput(p, yday, fatigue, cfg));
    const neuralBias = getPlayerNeuralBias({
      neuralLoadState: neuralLoad.neuralLoadState,
      readinessTrajectory: neuralLoad.readinessTrajectory,
      nextDayRisk: neuralLoad.nextDayRisk,
    }, cfg);

    if (p.is_medical) {
      const adaptation = buildAdaptivePlan({
        team_action: teamAction,
        exception_action: "RECOVERY_ONLY",
        fatigue_type: fatigue.primaryFatigueType,
        fatigue_severity: fatigue.severity,
        recommended_modifiers: fatigue.recommendedModifiers ?? [],
        neural_bias: neuralBias.adaptationBias,
        calibration_config: cfg,
      });
      action = "RECOVERY_ONLY";
      reason_codes.push("MEDICAL_FLAG");
      return {
        player_id: p.player_id,
        action,
        reason_codes,
        fatigue,
        neural_load: neuralLoad,
        neural_bias_applied: neuralBias.decisionPenalty > 0,
        neural_bias_reason_codes: neuralBias.addReasonCodes,
        adaptation,
        adaptation_summary: formatAdaptiveSummary(adaptation),
      };
    }

    if ((p.z ?? 0) <= -2.0) {
      action = "RECOVERY_ONLY";
      reason_codes.push("Z_DEEP_RED");
    } else if ((p.z ?? 0) <= -1.4) {
      action = "REDUCE_VOLUME";
      reason_codes.push("Z_LOW");
    }

    if (dz != null && dz <= -1.0) {
      reason_codes.push("DELTAZ_DROP");
      if (l.score >= 70) {
        action = action === "RECOVERY_ONLY" ? action : "NO_SPRINT";
        reason_codes.push("LOAD_HIGH_PLUS_DROP");
      }
    }

    if (fatigue.primaryFatigueType === "TISSUE" && action === "NORMAL") {
      action = "REDUCE_VOLUME";
      reason_codes.push("FATIGUE_TISSUE");
    }

    if (
      fatigue.primaryFatigueType === "SYSTEMIC" &&
      fatigue.severity === "HIGH" &&
      action === "NORMAL"
    ) {
      action = "REDUCE_VOLUME";
      reason_codes.push("FATIGUE_SYSTEMIC_HIGH");
    }

    if (
      fatigue.primaryFatigueType === "NEURAL" &&
      fatigue.severity === "HIGH" &&
      l.score >= 70
    ) {
      action = action === "RECOVERY_ONLY" ? action : "NO_SPRINT";
      reason_codes.push("FATIGUE_NEURAL_HIGH");
    }

    if (teamAction === "RECOVERY" && action === "NORMAL") {
      action = "REDUCE_VOLUME";
      reason_codes.push("TEAM_RECOVERY_DAY");
    }

    action = applyPlayerNeuralBiasToAction(action, reason_codes, neuralBias, cfg);

    const adaptation = buildAdaptivePlan({
      team_action: teamAction,
      exception_action: action,
      fatigue_type: fatigue.primaryFatigueType,
      fatigue_severity: fatigue.severity,
      recommended_modifiers: fatigue.recommendedModifiers ?? [],
      neural_bias: neuralBias.adaptationBias,
      calibration_config: cfg,
    });

    return {
      player_id: p.player_id,
      action,
      reason_codes: unique(reason_codes),
      fatigue,
      neural_load: neuralLoad,
      neural_bias_applied: neuralBias.decisionPenalty > 0,
      neural_bias_reason_codes: neuralBias.addReasonCodes,
      adaptation,
      adaptation_summary: formatAdaptiveSummary(adaptation),
    };
  });
}

export function computeTeamDecision(
  players: PlayerSignal[],
  yday: SessionContext,
  opts?: { calibrationConfig?: DeepPartial<CalibrationConfig> }
): TeamDecisionResult {
  // TODO(session-rpe): include session_rpe_entries-derived load context (daily, 7d/28d, ACWR)
  // once validated in production. Keep current team decision behavior unchanged for now.
  const cfg = resolveCalibrationConfig(opts?.calibrationConfig);
  const r = teamReadinessScore(players);
  const l = loadScore(yday);
  const d = teamDeltaSignal(players);

  const fatigueItems: FatigueClassification[] = players.map((player) =>
    classifyFatigue(buildFatigueInput(player, yday, cfg))
  );
  const teamFatigueSummary = buildTeamFatigueSummary(fatigueItems);
  const neuralItems = players.map((player, idx) =>
    classifyNeuralLoad(buildNeuralLoadInput(player, yday, fatigueItems[idx], cfg))
  );
  const teamNeuralLoadSummary = buildTeamNeuralLoadSummary(neuralItems);
  const teamNeuralBias = getTeamNeuralBias(teamNeuralLoadSummary, cfg);

  const deepRed = players.filter((p) => (p.z ?? 0) <= -2.0).length;
  const medicalCount = players.filter((p) => p.is_medical).length;
  const highSystemicCount = fatigueItems.filter(
    (f) =>
      (f.primaryFatigueType === "SYSTEMIC" || f.primaryFatigueType === "MIXED") &&
      f.severity === "HIGH"
  ).length;

  const reasons: string[] = [];
  if (r.reason) reasons.push(r.reason);
  if (l.reason) reasons.push(l.reason);
  if (d.reason) reasons.push(d.reason);

  if (teamFatigueSummary.dominantType !== "NONE") {
    reasons.push(`FATIGUE_${teamFatigueSummary.dominantType}`);
  }
  if (teamNeuralBias.reasonCodes.length) {
    reasons.push(...teamNeuralBias.reasonCodes);
  }

  if (deepRed >= 4 || medicalCount >= 2 || highSystemicCount >= 4) {
    return {
      team_action: "RECOVERY",
      decision_score: 25,
      reasons: ["TEAM_SAFETY", ...unique(reasons)].slice(0, 3),
      exceptions: buildExceptions(players, yday, "RECOVERY", cfg),
      teamFatigueSummary,
      teamNeuralLoadSummary,
      neural_bias_applied: teamNeuralBias.scorePenalty > 0,
      neural_bias_reason_codes: teamNeuralBias.reasonCodes,
    };
  }

  let score = r.score * 0.55 + l.score * 0.3 + (d.dropFlag ? 15 : 0);

  if (teamFatigueSummary.dominantType === "SYSTEMIC") score -= cfg.decision.fatigueDominantPenalties.SYSTEMIC;
  else if (teamFatigueSummary.dominantType === "NEURAL") score -= cfg.decision.fatigueDominantPenalties.NEURAL;
  else if (teamFatigueSummary.dominantType === "TISSUE") score -= cfg.decision.fatigueDominantPenalties.TISSUE;
  else if (teamFatigueSummary.dominantType === "MIXED") score -= cfg.decision.fatigueDominantPenalties.MIXED;

  if (d.dropFlag) score -= 12;
  if (teamNeuralBias.scorePenalty > 0) score -= teamNeuralBias.scorePenalty;

  score = Math.round(Math.max(0, Math.min(100, score)));

  let team_action: TrainingAction = "FULL";
  if (score < cfg.decision.teamActionThresholds.recoveryBelow) team_action = "RECOVERY";
  else if (score < cfg.decision.teamActionThresholds.reducedBelow) team_action = "REDUCED";

  const why = unique(reasons).slice(0, 3);

  return {
    team_action,
    decision_score: score,
    reasons: why,
    exceptions: buildExceptions(players, yday, team_action, cfg),
    teamFatigueSummary,
    teamNeuralLoadSummary,
    neural_bias_applied: teamNeuralBias.scorePenalty > 0,
    neural_bias_reason_codes: teamNeuralBias.reasonCodes,
  };
}

export default computeTeamDecision;
