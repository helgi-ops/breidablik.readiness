import type {
  FatigueInput,
  FatigueSeverity,
  FatigueType,
  ModifierCode,
} from "./types";

interface ModifierInput {
  primaryFatigueType: FatigueType;
  secondaryFatigueType: FatigueType;
  severity: FatigueSeverity;
  painLocation: FatigueInput["painLocation"];
  mdDay: string | null;
}

export function getRecommendedModifiers(input: ModifierInput): ModifierCode[] {
  const mods = new Set<ModifierCode>();

  switch (input.primaryFatigueType) {
    case "NEURAL":
      mods.add("NEURAL_LOW_DENSITY");
      mods.add("NEURAL_LOW_CONTACT");
      mods.add("KEEP_QUALITY_HIGH");
      if (input.severity !== "LOW") mods.add("NEURAL_EXTENDED_REST");
      if (input.severity === "HIGH") mods.add("ADD_NEURAL_RESET");
      break;

    case "TISSUE":
      mods.add("TISSUE_SWAP_BALLISTIC");
      if (input.painLocation === "ACHILLES") mods.add("TISSUE_PROTECT_ACHILLES");
      if (input.painLocation === "HAMSTRING") mods.add("TISSUE_PROTECT_HAMSTRING");
      if (input.painLocation === "PATELLAR") mods.add("TISSUE_PROTECT_PATELLAR");
      mods.add("ADD_TENDON_RELOAD");
      break;

    case "SYSTEMIC":
      mods.add("SYSTEMIC_REDUCE_VOLUME");
      mods.add("SYSTEMIC_SIMPLIFY_SESSION");
      if (input.severity !== "LOW") mods.add("SYSTEMIC_RECOVERY_BIAS");
      break;

    case "MIXED":
      mods.add("SYSTEMIC_REDUCE_VOLUME");
      mods.add("KEEP_QUALITY_HIGH");
      break;
  }

  return Array.from(mods);
}