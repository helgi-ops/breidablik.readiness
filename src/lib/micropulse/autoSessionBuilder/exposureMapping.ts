import type { ExposureGuidanceTag } from "@/lib/micropulse/prescriptionEngine";
import type { ExposureConstraints, SessionDraftBlock, SessionExposureTag } from "./types";

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

/** Maps prescription exposure guidance into block-level constraints. */
export function mapExposureGuidanceToConstraints(guidance: ExposureGuidanceTag[]): ExposureConstraints {
  const tagsToRemove: SessionExposureTag[] = [];
  const tagsToDowngrade: SessionExposureTag[] = [];
  let technicalOnly = false;
  let recoveryOnly = false;
  let reduceFieldMinutes = false;
  let reduceGymIntensity = false;

  for (const tag of guidance) {
    if (tag === "LIMIT_MAX_SPEED") tagsToRemove.push("MAX_SPEED");
    if (tag === "LIMIT_DECELS") tagsToRemove.push("HIGH_DECEL");
    if (tag === "LIMIT_CONTACT") tagsToRemove.push("CONTACT");
    if (tag === "LIMIT_PLYOS") tagsToRemove.push("PLYOS");
    if (tag === "LIMIT_FIELD_MINUTES") reduceFieldMinutes = true;
    if (tag === "LIMIT_GYM_INTENSITY") reduceGymIntensity = true;
    if (tag === "SKILL_ONLY") technicalOnly = true;
    if (tag === "RECOVERY_MODALITIES") recoveryOnly = true;
  }

  if (reduceFieldMinutes) tagsToDowngrade.push("FIELD_MINUTES");

  return {
    blockTagsToRemove: unique(tagsToRemove),
    blockTagsToDowngrade: unique(tagsToDowngrade),
    technicalOnly,
    recoveryOnly,
    reduceFieldMinutes,
    reduceGymIntensity,
  };
}

export function blockViolatesConstraint(block: SessionDraftBlock, constraints: ExposureConstraints): boolean {
  const tags = block.exposureTags ?? [];
  if (constraints.technicalOnly && block.type !== "PREP" && block.type !== "SKILL" && block.type !== "MOBILITY" && block.type !== "DOWNREGULATION") {
    return true;
  }

  return tags.some((tag) => constraints.blockTagsToRemove.includes(tag));
}

export function reduceBlockForConstraint(block: SessionDraftBlock, constraints: ExposureConstraints): SessionDraftBlock {
  const next = { ...block };
  if (constraints.reduceFieldMinutes && next.durationMin) {
    next.durationMin = Math.max(6, Math.round(next.durationMin * 0.75));
    next.modificationReason = "Field minutes reduced by exposure constraint.";
  }

  if (constraints.reduceGymIntensity && (next.type === "STRENGTH" || next.type === "POWER")) {
    next.intensity = "MODERATE";
    next.modificationReason = "Gym intensity reduced by exposure constraint.";
  }

  if ((next.exposureTags ?? []).some((tag) => constraints.blockTagsToDowngrade.includes(tag)) && next.durationMin) {
    next.durationMin = Math.max(5, Math.round(next.durationMin * 0.8));
    next.modificationReason = next.modificationReason ?? "Exposure load downgraded.";
  }

  return next;
}
