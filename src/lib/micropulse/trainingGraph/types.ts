import type { IsoPrescription } from "../isometrics/types";

export type AthleteState =
  | "GREEN_PLUS"
  | "GREEN"
  | "YELLOW"
  | "RED";

export type MdContext =
  | "MD5"
  | "MD4"
  | "MD3"
  | "MD2"
  | "MD1"
  | "MD_PLUS_1"
  | "OFF"
  | "UNKNOWN";

export type NodeType =
  | "warmup_neural"
  | "warmup_reset"
  | "primer_ballistic"
  | "primer_light"
  | "main_force"
  | "main_force_contrast"
  | "support_isometric"
  | "recovery_reset";

export type NodeStatus =
  | "active"
  | "reduced"
  | "disabled"
  | "replaced";

export type MovementPattern =
  | "hinge"
  | "squat"
  | "split_squat"
  | "jump"
  | "pull"
  | "push"
  | "core"
  | "ankle"
  | "hamstring"
  | "adductor"
  | "breathing"
  | "mixed";

export type ExerciseCategory =
  | "warmup"
  | "primer"
  | "strength"
  | "plyometric"
  | "isometric"
  | "recovery"
  | "mobility";

export type SessionIntent =
  | "POWER"
  | "FORCE"
  | "FORCE_POWER"
  | "RECOVERY"
  | "PRIMER"
  | "RESET";

export type VelocityZoneKey =
  | "MAX_STRENGTH"
  | "STRENGTH"
  | "STRENGTH_SPEED"
  | "POWER"
  | "BALLISTIC"
  | "NONE";

export type RuleReasonCode =
  | "STATE_GREEN_PLUS"
  | "STATE_GREEN"
  | "STATE_YELLOW"
  | "STATE_RED"
  | "MD_VL_CAP"
  | "LOW_READINESS"
  | "HIGH_NEURAL_FATIGUE"
  | "HIGH_YESTERDAY_LOAD"
  | "REDUCED_VOLUME"
  | "NODE_DISABLED"
  | "NODE_REPLACED"
  | "VELOCITY_CLAMPED"
  | "CONTRAST_LIMIT"
  | "SAFETY_RULE"
  | "DEFAULT_RULE";

export interface VelocityPrescription {
  zoneKey: VelocityZoneKey;
  targetMin?: number | null;
  targetMax?: number | null;
  velocityLossCap?: number | null; // 0.05 = 5%
  repCap?: number | null;
  stopSetOnVelocityLoss?: boolean;
}

export interface SetRepPrescription {
  setsMin?: number | null;
  setsMax?: number | null;
  repsMin?: number | null;
  repsMax?: number | null;
  fixedSets?: number | null;
  fixedReps?: number | null;
  fixedTotalReps?: number | null;
}

export interface RestPrescription {
  intraSetSeconds?: number | null;
  betweenSetSecondsMin?: number | null;
  betweenSetSecondsMax?: number | null;
  fixedBetweenSetSeconds?: number | null;
}

export interface ExerciseDefinition {
  id: string;
  title: string;
  category: ExerciseCategory;
  movementPattern: MovementPattern;
  nodeTypes: NodeType[];
  velocitySupported: boolean;
  unilateral?: boolean;
  bilateral?: boolean;
  defaultVelocity?: VelocityPrescription | null;
  approvedAlternatives?: string[];
  tags?: string[];
  constraints?: string[];
}

export interface NodeExerciseSlot {
  slotId: string;
  label: string;
  allowedCategories?: ExerciseCategory[];
  allowedMovementPatterns?: MovementPattern[];
  exercisePoolIds: string[];
  select: {
    mode: "single" | "multi";
    min?: number;
    max?: number;
  };
}

export interface NodeParameterProfile {
  status?: NodeStatus;
  setRep?: SetRepPrescription;
  velocity?: VelocityPrescription | null;
  rest?: RestPrescription | null;
  notes?: string[];
}

export interface NodeStateProfiles {
  GREEN_PLUS?: NodeParameterProfile;
  GREEN?: NodeParameterProfile;
  YELLOW?: NodeParameterProfile;
  RED?: NodeParameterProfile;
}

export interface NodeMdModifiers {
  MD5?: Partial<NodeParameterProfile>;
  MD4?: Partial<NodeParameterProfile>;
  MD3?: Partial<NodeParameterProfile>;
  MD2?: Partial<NodeParameterProfile>;
  MD1?: Partial<NodeParameterProfile>;
  MD_PLUS_1?: Partial<NodeParameterProfile>;
  OFF?: Partial<NodeParameterProfile>;
  UNKNOWN?: Partial<NodeParameterProfile>;
}

export interface TrainingNodeDefinition {
  id: string;
  type: NodeType;
  label: string;
  description?: string;
  intentTags: SessionIntent[];
  defaultOrder: number;
  required: boolean;
  exerciseSlots: NodeExerciseSlot[];
  baseProfile: NodeParameterProfile;
  stateProfiles: NodeStateProfiles;
  mdModifiers?: NodeMdModifiers;
  replacementNodeTypeForRed?: NodeType;
  replacementNodeTypeForYellow?: NodeType;
  hardRules?: string[];
}

export interface BlueprintNodeRef {
  nodeId: string;
  order: number;
  optional?: boolean;
}

export interface TrainingBlueprint {
  id: string;
  title: string;
  intent: SessionIntent;
  mdContexts: MdContext[];
  nodeRefs: BlueprintNodeRef[];
  tags?: string[];
}

export interface ResolverInput {
  blueprint: TrainingBlueprint;
  nodeMap: Record<string, TrainingNodeDefinition>;
  exerciseMap: Record<string, ExerciseDefinition>;
  athleteState: AthleteState;
  mdContext: MdContext;
  readinessScore?: number | null;
  neuralFatigueBand?: "LOW" | "MODERATE" | "HIGH" | "VERY_HIGH" | null;
  yesterdayLoadBand?: "LOW" | "MODERATE" | "HIGH" | null;
}

export interface ResolvedSlotExercise {
  slotId: string;
  selectedExerciseIds: string[];
}

export interface ResolvedNode {
  nodeId: string;
  nodeType: NodeType;
  label: string;
  order: number;
  status: NodeStatus;
  selectedExercises: ResolvedSlotExercise[];
  setRep: SetRepPrescription | null;
  velocity: VelocityPrescription | null;
  rest: RestPrescription | null;
  notes: string[];
  reasons: RuleReasonCode[];
  isoPrescriptions?: Record<string, IsoPrescription> | null;
}

export interface ResolvedSession {
  blueprintId: string;
  blueprintTitle: string;
  athleteState: AthleteState;
  mdContext: MdContext;
  intent: SessionIntent;
  nodes: ResolvedNode[];
  sessionReasons: RuleReasonCode[];
}
