import type { FatigueInput, FatigueSeverity, FatigueType, TrainingModifier } from "@/lib/fatigue/types";

const NEURAL_BASE: TrainingModifier[] = [
  "NEURAL_LOW_DENSITY",
  "NEURAL_LOW_CONTACT",
  "KEEP_QUALITY_HIGH",
];

const TISSUE_BASE: TrainingModifier[] = [
  "TISSUE_SWAP_BALLISTIC",
  "ADD_TENDON_RELOAD",
];

const SYSTEMIC_BASE: TrainingModifier[] = [
  "SYSTEMIC_REDUCE_VOLUME",
  "SYSTEMIC_SIMPLIFY_SESSION",
  "SYSTEMIC_RECOVERY_BIAS",
];

export function getRecommendedModifiers(
  primary: FatigueType,
  severity: FatigueSeverity,
  input: Pick<FatigueInput, "painLocation" | "hasPainFlag">,
): TrainingModifier[] {
  const out: TrainingModifier[] = [];

  if (primary === "NEURAL" || primary === "MIXED") {
    out.push(...NEURAL_BASE);
    if (severity === "HIGH") out.push("NEURAL_EXTENDED_REST", "ADD_NEURAL_RESET");
  }

  if (primary === "TISSUE" || primary === "MIXED") {
    out.push(...TISSUE_BASE);
    if (input.hasPainFlag) {
      if (input.painLocation === "ACHILLES") out.push("TISSUE_PROTECT_ACHILLES");
      if (input.painLocation === "HAMSTRING") out.push("TISSUE_PROTECT_HAMSTRING");
      if (input.painLocation === "PATELLAR") out.push("TISSUE_PROTECT_PATELLAR");
    }
  }

  if (primary === "SYSTEMIC" || primary === "MIXED") {
    out.push(...SYSTEMIC_BASE);
  }

  return Array.from(new Set(out));
}
