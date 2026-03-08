import type { CalibrationConfig, DeepPartial } from "@/lib/calibration/config";
import { resolveCalibrationConfig } from "@/lib/calibration/config";
import type { FatigueSeverity, FatigueType, TrainingModifier } from "@/lib/fatigue/types";
import type { NeuralAdaptationBias } from "@/lib/neuralLoad/bias";

export type TrainingAction = "FULL" | "REDUCED" | "RECOVERY";
export type ExceptionAction = "NORMAL" | "NO_SPRINT" | "REDUCE_VOLUME" | "RECOVERY_ONLY";

export type TissueTarget = "ACHILLES" | "HAMSTRING" | "PATELLAR" | null;

export type TrainingAdaptation = {
  reduceVolumePct?: number;
  reduceContactsPct?: number;
  extendRest?: boolean;
  simplifySession?: boolean;
  recoveryBias?: boolean;
  swapBallistic?: boolean;
  protectTissue?: TissueTarget;
  addTendonReload?: boolean;
  addNeuralReset?: boolean;
  notes?: string[];
};

export type AdaptiveInput = {
  team_action: TrainingAction;
  exception_action: ExceptionAction;
  fatigue_type: FatigueType;
  fatigue_severity: FatigueSeverity;
  recommended_modifiers: TrainingModifier[];
  neural_bias?: NeuralAdaptationBias | null;
  calibration_config?: DeepPartial<CalibrationConfig>;
};

function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function maxPct(a?: number, b?: number): number | undefined {
  if (a == null) return b;
  if (b == null) return a;
  return Math.max(a, b);
}

function chooseTissueTarget(current: TissueTarget, next: TissueTarget): TissueTarget {
  if (current && current !== "ACHILLES") return current;
  if (next === "ACHILLES") return "ACHILLES";
  if (current) return current;
  return next;
}

function mergeAdaptations(parts: TrainingAdaptation[]): TrainingAdaptation {
  const out: TrainingAdaptation = {};
  const notes: string[] = [];

  for (const p of parts) {
    out.reduceVolumePct = maxPct(out.reduceVolumePct, p.reduceVolumePct);
    out.reduceContactsPct = maxPct(out.reduceContactsPct, p.reduceContactsPct);
    out.extendRest = !!(out.extendRest || p.extendRest);
    out.simplifySession = !!(out.simplifySession || p.simplifySession);
    out.recoveryBias = !!(out.recoveryBias || p.recoveryBias);
    out.swapBallistic = !!(out.swapBallistic || p.swapBallistic);
    out.protectTissue = chooseTissueTarget(out.protectTissue ?? null, p.protectTissue ?? null);
    out.addTendonReload = !!(out.addTendonReload || p.addTendonReload);
    out.addNeuralReset = !!(out.addNeuralReset || p.addNeuralReset);
    if (p.notes?.length) notes.push(...p.notes);
  }

  if (notes.length) out.notes = unique(notes);
  return out;
}

function fromModifier(mod: TrainingModifier): TrainingAdaptation {
  switch (mod) {
    case "NEURAL_LOW_DENSITY":
      return { reduceVolumePct: 25 };
    case "NEURAL_LOW_CONTACT":
      return { reduceContactsPct: 40 };
    case "NEURAL_EXTENDED_REST":
      return { extendRest: true };
    case "KEEP_QUALITY_HIGH":
      return { notes: ["Maintain quality, reduce density"] };
    case "ADD_NEURAL_RESET":
      return { addNeuralReset: true };

    case "TISSUE_SWAP_BALLISTIC":
      return { swapBallistic: true };
    case "TISSUE_PROTECT_ACHILLES":
      return { protectTissue: "ACHILLES" };
    case "TISSUE_PROTECT_HAMSTRING":
      return { protectTissue: "HAMSTRING" };
    case "TISSUE_PROTECT_PATELLAR":
      return { protectTissue: "PATELLAR" };
    case "ADD_TENDON_RELOAD":
      return { addTendonReload: true };

    case "SYSTEMIC_REDUCE_VOLUME":
      return { reduceVolumePct: 35 };
    case "SYSTEMIC_SIMPLIFY_SESSION":
      return { simplifySession: true };
    case "SYSTEMIC_RECOVERY_BIAS":
      return { recoveryBias: true };
    default:
      return {};
  }
}

function fromDecisionContext(input: AdaptiveInput): TrainingAdaptation {
  const out: TrainingAdaptation = {};
  const notes: string[] = [];

  if (input.team_action === "RECOVERY") {
    out.recoveryBias = true;
    out.reduceVolumePct = maxPct(out.reduceVolumePct, 40);
  } else if (input.team_action === "REDUCED") {
    out.reduceVolumePct = maxPct(out.reduceVolumePct, 20);
  }

  if (input.exception_action === "NO_SPRINT") {
    out.reduceContactsPct = maxPct(out.reduceContactsPct, 35);
    notes.push("No sprint exposure");
  } else if (input.exception_action === "REDUCE_VOLUME") {
    out.reduceVolumePct = maxPct(out.reduceVolumePct, 20);
  } else if (input.exception_action === "RECOVERY_ONLY") {
    out.recoveryBias = true;
    out.reduceVolumePct = maxPct(out.reduceVolumePct, 40);
    notes.push("Recovery-only individual plan");
  }

  if (input.fatigue_type === "MIXED" && input.fatigue_severity !== "LOW") {
    out.reduceVolumePct = maxPct(out.reduceVolumePct, 30);
    out.simplifySession = true;
  }

  if (notes.length) out.notes = unique(notes);
  return out;
}

function fromNeuralBias(
  bias: NeuralAdaptationBias | null | undefined,
  cfg: CalibrationConfig
): TrainingAdaptation {
  if (!bias) return {};

  const out: TrainingAdaptation = {};
  const notes: string[] = [];

  if (typeof bias.extraReduceVolumePct === "number" && bias.extraReduceVolumePct > 0) {
    const pct = Math.min(cfg.adaptation.maxExtraVolumePct, bias.extraReduceVolumePct);
    out.reduceVolumePct = pct;
    notes.push(`Neural bias: -${pct}% volume`);
  }

  if (typeof bias.extraReduceContactsPct === "number" && bias.extraReduceContactsPct > 0) {
    const pct = Math.min(cfg.adaptation.maxExtraContactsPct, bias.extraReduceContactsPct);
    out.reduceContactsPct = pct;
    notes.push(`Neural bias: -${pct}% contacts`);
  }

  if (bias.forceExtendRest) {
    out.extendRest = true;
    notes.push("Neural bias: extend rest");
  }
  if (bias.preferSimplifySession) {
    out.simplifySession = true;
    notes.push("Neural bias: simplify session");
  }
  if (bias.preferRecoveryBias) {
    out.recoveryBias = true;
    notes.push("Neural bias: recovery emphasis");
  }

  if (notes.length) out.notes = notes;
  return out;
}

export function buildAdaptivePlan(input: AdaptiveInput): TrainingAdaptation {
  const cfg = resolveCalibrationConfig(input.calibration_config);
  const modifierParts = unique(input.recommended_modifiers).map(fromModifier);
  const contextPart = fromDecisionContext(input);
  const neuralBiasPart = fromNeuralBias(input.neural_bias, cfg);
  return mergeAdaptations([contextPart, ...modifierParts, neuralBiasPart]);
}

export function formatAdaptiveSummary(adaptation: TrainingAdaptation): string {
  const parts: string[] = [];
  if (typeof adaptation.reduceVolumePct === "number") parts.push(`-${adaptation.reduceVolumePct}% volume`);
  if (typeof adaptation.reduceContactsPct === "number") parts.push(`-${adaptation.reduceContactsPct}% contacts`);
  if (adaptation.extendRest) parts.push("extended rest");
  if (adaptation.simplifySession) parts.push("simplify session");
  if (adaptation.recoveryBias) parts.push("recovery bias");
  if (adaptation.swapBallistic) parts.push("swap ballistic");
  if (adaptation.protectTissue) parts.push(`protect ${adaptation.protectTissue.toLowerCase()}`);
  if (adaptation.addTendonReload) parts.push("add tendon reload");
  if (adaptation.addNeuralReset) parts.push("add neural reset");
  if (parts.length === 0) return "No adaptation";
  return `Adaptive: ${parts.join(", ")}`;
}
