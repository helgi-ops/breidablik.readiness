import { EXERCISE_LIBRARY } from "./schema";
import { formatIsoPrescriptionLines } from "../isometrics/engine";
import type { IsoPrescription } from "../isometrics/types";
import type {
  ExerciseDefinition,
  ResolvedNode,
  ResolvedSession,
  RestPrescription,
  RuleReasonCode,
  SetRepPrescription,
  VelocityPrescription,
} from "./types";

export interface CoachResolvedNodeViewModel {
  nodeId: string;
  title: string;
  status: string;
  exercises: string[];
  prescriptionLines: string[];
  notes: string[];
  reasons: string[];
}

export interface CoachResolvedSessionViewModel {
  title: string;
  subtitle: string;
  badges: string[];
  sessionSummaryLines: string[];
  nodes: CoachResolvedNodeViewModel[];
}

export interface PlayerResolvedNodeViewModel {
  nodeId: string;
  title: string;
  exercises: string[];
  prescriptionLines: string[];
}

export interface PlayerResolvedSessionViewModel {
  title: string;
  subtitle: string;
  blocks: PlayerResolvedNodeViewModel[];
  note?: string | null;
}

function uniq(lines: string[]): string[] {
  return Array.from(new Set(lines.map((line) => line.trim()).filter(Boolean)));
}

function formatSetRepLine(setRep: SetRepPrescription | null | undefined): string | null {
  if (!setRep) return null;

  if (typeof setRep.fixedTotalReps === "number") return `${setRep.fixedTotalReps} total reps`;

  if (typeof setRep.fixedSets === "number") {
    if (typeof setRep.fixedReps === "number") return `${setRep.fixedSets} sets x ${setRep.fixedReps} reps`;

    if (typeof setRep.repsMin === "number" || typeof setRep.repsMax === "number") {
      const repMin = setRep.repsMin ?? setRep.repsMax;
      const repMax = setRep.repsMax ?? setRep.repsMin;
      if (typeof repMin === "number" && typeof repMax === "number") {
        return repMin === repMax
          ? `${setRep.fixedSets} sets x ${repMin} reps`
          : `${setRep.fixedSets} sets x ${repMin}-${repMax} reps`;
      }
    }

    return `${setRep.fixedSets} sets`;
  }

  if (typeof setRep.setsMin === "number" || typeof setRep.setsMax === "number") {
    const setsMin = setRep.setsMin ?? setRep.setsMax;
    const setsMax = setRep.setsMax ?? setRep.setsMin;
    if (typeof setsMin === "number" && typeof setsMax === "number") {
      const setText = setsMin === setsMax ? `${setsMin} sets` : `${setsMin}-${setsMax} sets`;
      if (typeof setRep.repsMin === "number" || typeof setRep.repsMax === "number") {
        const repsMin = setRep.repsMin ?? setRep.repsMax;
        const repsMax = setRep.repsMax ?? setRep.repsMin;
        if (typeof repsMin === "number" && typeof repsMax === "number") {
          const repText = repsMin === repsMax ? `${repsMin} reps` : `${repsMin}-${repsMax} reps`;
          return `${setText} x ${repText}`;
        }
      }
      return setText;
    }
  }

  return null;
}

function formatVelocityLines(velocity: VelocityPrescription | null | undefined): string[] {
  if (!velocity) return [];

  const lines: string[] = [];
  if (typeof velocity.targetMin === "number" || typeof velocity.targetMax === "number") {
    const lo = velocity.targetMin;
    const hi = velocity.targetMax;
    if (typeof lo === "number" && typeof hi === "number") lines.push(`Target velocity: ${lo.toFixed(2)}-${hi.toFixed(2)} m/s`);
    else if (typeof lo === "number") lines.push(`Target velocity: >= ${lo.toFixed(2)} m/s`);
    else if (typeof hi === "number") lines.push(`Target velocity: <= ${hi.toFixed(2)} m/s`);
  }

  if (typeof velocity.velocityLossCap === "number") {
    lines.push(`Stop if velocity loss exceeds ${Math.round(velocity.velocityLossCap * 100)}%`);
  }

  return lines;
}

function formatRestLines(rest: RestPrescription | null | undefined): string[] {
  if (!rest) return [];
  const lines: string[] = [];

  if (typeof rest.fixedBetweenSetSeconds === "number") {
    lines.push(`Rest ${Math.round(rest.fixedBetweenSetSeconds / 60)} min`);
  } else if (typeof rest.betweenSetSecondsMin === "number" || typeof rest.betweenSetSecondsMax === "number") {
    const min = rest.betweenSetSecondsMin ?? rest.betweenSetSecondsMax;
    const max = rest.betweenSetSecondsMax ?? rest.betweenSetSecondsMin;
    if (typeof min === "number" && typeof max === "number") {
      lines.push(min === max ? `Rest ${Math.round(min / 60)} min` : `Rest ${Math.round(min / 60)}-${Math.round(max / 60)} min`);
    }
  }

  if (typeof rest.intraSetSeconds === "number") lines.push(`${rest.intraSetSeconds} sec intra-set rest`);

  return lines;
}

function reasonLabel(reason: RuleReasonCode): string {
  const map: Record<RuleReasonCode, string> = {
    STATE_GREEN_PLUS: "Green+ profile applied",
    STATE_GREEN: "Green profile applied",
    STATE_YELLOW: "Yellow profile applied",
    STATE_RED: "Red profile applied",
    MD_VL_CAP: "MD velocity cap applied",
    LOW_READINESS: "Adjusted for low readiness",
    HIGH_NEURAL_FATIGUE: "Adjusted for neural fatigue",
    HIGH_YESTERDAY_LOAD: "Adjusted for yesterday load",
    REDUCED_VOLUME: "Volume reduced",
    NODE_DISABLED: "Node disabled",
    NODE_REPLACED: "Node replaced",
    VELOCITY_CLAMPED: "Velocity loss clamped",
    CONTRAST_LIMIT: "Contrast safety limit",
    SAFETY_RULE: "Safety rule",
    DEFAULT_RULE: "Default rule",
  };
  return map[reason] ?? reason;
}

function statusLabel(status: ResolvedNode["status"]): string {
  if (status === "active") return "Active";
  if (status === "reduced") return "Reduced";
  if (status === "replaced") return "Replaced";
  return "Disabled";
}

function resolveExerciseTitles(node: ResolvedNode, exerciseMap: Record<string, ExerciseDefinition>): string[] {
  return uniq(
    node.selectedExercises.flatMap((slot) => slot.selectedExerciseIds.map((exerciseId) => exerciseMap[exerciseId]?.title ?? exerciseId))
  );
}

function getPrimaryIsoPrescription(node: ResolvedNode): IsoPrescription | null {
  const entries = Object.values(node.isoPrescriptions ?? {});
  if (!entries.length) return null;
  return entries[0] ?? null;
}

function toCoachNode(node: ResolvedNode, exerciseMap: Record<string, ExerciseDefinition>): CoachResolvedNodeViewModel {
  const setRepLine = formatSetRepLine(node.setRep);
  const isoPrescription = getPrimaryIsoPrescription(node);
  const isoLines = isoPrescription ? formatIsoPrescriptionLines(isoPrescription, { concise: false }) : [];
  const defaultLines = uniq([...(setRepLine ? [setRepLine] : []), ...formatVelocityLines(node.velocity), ...formatRestLines(node.rest)]);
  return {
    nodeId: node.nodeId,
    title: node.label,
    status: statusLabel(node.status),
    exercises: resolveExerciseTitles(node, exerciseMap),
    prescriptionLines: isoLines.length ? isoLines : defaultLines,
    notes: uniq(node.notes ?? []),
    reasons: uniq((node.reasons ?? []).map(reasonLabel)),
  };
}

function toPlayerNode(node: ResolvedNode, exerciseMap: Record<string, ExerciseDefinition>): PlayerResolvedNodeViewModel {
  const setRepLine = formatSetRepLine(node.setRep);
  const isoPrescription = getPrimaryIsoPrescription(node);
  const isoLines = isoPrescription ? formatIsoPrescriptionLines(isoPrescription, { concise: true }) : [];
  const defaultLines = uniq([...(setRepLine ? [setRepLine] : []), ...formatVelocityLines(node.velocity), ...formatRestLines(node.rest)]);
  return {
    nodeId: node.nodeId,
    title: node.label,
    exercises: resolveExerciseTitles(node, exerciseMap),
    prescriptionLines: isoLines.length ? isoLines : defaultLines,
  };
}

export function flattenResolvedSessionForCoach(
  resolved: ResolvedSession,
  exerciseMap: Record<string, ExerciseDefinition> = EXERCISE_LIBRARY
): CoachResolvedSessionViewModel {
  return {
    title: resolved.blueprintTitle,
    subtitle: `${resolved.athleteState} · ${resolved.mdContext}`,
    badges: [resolved.intent, `Nodes ${resolved.nodes.length}`],
    sessionSummaryLines: uniq((resolved.sessionReasons ?? []).map(reasonLabel)),
    nodes: resolved.nodes.map((node) => toCoachNode(node, exerciseMap)),
  };
}

export function flattenResolvedSessionForPlayer(
  resolved: ResolvedSession,
  exerciseMap: Record<string, ExerciseDefinition> = EXERCISE_LIBRARY
): PlayerResolvedSessionViewModel {
  const activeNodes = resolved.nodes.filter((node) => node.status !== "disabled");
  return {
    title: resolved.blueprintTitle,
    subtitle: "Adjusted for today",
    blocks: activeNodes.map((node) => toPlayerNode(node, exerciseMap)),
    note: "Built from Training Graph rules for today's readiness and MD context.",
  };
}
