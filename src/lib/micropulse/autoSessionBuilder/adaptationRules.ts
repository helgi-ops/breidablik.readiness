import type { IntensityCapBand, VolumeAdjustmentBand } from "@/lib/micropulse/prescriptionEngine";
import { blockViolatesConstraint, reduceBlockForConstraint } from "./exposureMapping";
import type { ExposureConstraints, SessionDraftBlock } from "./types";

const VOLUME_REDUCTION_PERCENT: Record<VolumeAdjustmentBand, number> = {
  NO_REDUCTION: 0,
  REDUCE_10: 10,
  REDUCE_20: 20,
  REDUCE_30: 30,
  REDUCE_50: 50,
};

export function volumeAdjustmentToPercent(volumeAdjustment: VolumeAdjustmentBand | null | undefined): number {
  if (!volumeAdjustment) return 0;
  return VOLUME_REDUCTION_PERCENT[volumeAdjustment] ?? 0;
}

export function applyVolumeReduction(blocks: SessionDraftBlock[], percent: number): SessionDraftBlock[] {
  if (percent <= 0) return blocks;
  const ratio = Math.max(0.45, 1 - percent / 100);

  return blocks.map((block) => {
    const next = { ...block };
    if (next.sets && next.sets > 1) {
      next.sets = Math.max(1, Math.round(next.sets * ratio));
      next.modificationReason = "Sets reduced by volume adjustment.";
    }
    if (next.durationMin && next.durationMin > 6) {
      next.durationMin = Math.max(6, Math.round(next.durationMin * ratio));
      next.modificationReason = next.modificationReason ?? "Duration reduced by volume adjustment.";
    }
    return next;
  });
}

export function applyIntensityCap(blocks: SessionDraftBlock[], cap: IntensityCapBand | null | undefined): SessionDraftBlock[] {
  if (!cap || cap === "NO_CAP") return blocks;

  return blocks.map((block) => {
    const next = { ...block };
    if (cap === "CAP_HIGH") {
      if (next.intensity === "HIGH" && (next.type === "POWER" || next.type === "SPEED")) {
        next.intensity = "MODERATE";
        next.modificationReason = "Intensity capped (high).";
      }
      return next;
    }

    if (cap === "CAP_MODERATE") {
      if (next.intensity === "HIGH") {
        next.intensity = "MODERATE";
        next.modificationReason = "Intensity capped (moderate).";
      }
      return next;
    }

    if (cap === "CAP_LOW" || cap === "RECOVERY_ONLY") {
      if (next.intensity && next.intensity !== "LOW") {
        next.intensity = "LOW";
        next.modificationReason = cap === "RECOVERY_ONLY" ? "Recovery-only cap applied." : "Intensity capped (low).";
      }
      return next;
    }

    return next;
  });
}

export function buildRecoverySubstitution(source: SessionDraftBlock, reason: string): SessionDraftBlock {
  return {
    id: `${source.id}-recovery-sub`,
    type: source.type === "PREP" ? "PREP" : "RECOVERY",
    title: source.type === "PREP" ? source.title : "Recovery substitution",
    description: "Protective replacement block",
    durationMin: Math.max(6, Math.round((source.durationMin ?? 10) * 0.7)),
    sets: source.sets ? Math.max(1, source.sets - 1) : null,
    reps: source.reps ?? null,
    intensity: "LOW",
    exposureTags: ["RECOVERY_ONLY"],
    included: true,
    modificationReason: reason,
  };
}

export function adaptBlocksForAction(
  blocks: SessionDraftBlock[],
  args: {
    action: "FULL" | "MODIFIED" | "RECOVERY" | "HOLD";
    constraints: ExposureConstraints;
  },
): {
  blocks: SessionDraftBlock[];
  removed: SessionDraftBlock[];
  added: SessionDraftBlock[];
  modified: SessionDraftBlock[];
} {
  const removed: SessionDraftBlock[] = [];
  const added: SessionDraftBlock[] = [];
  const modified: SessionDraftBlock[] = [];

  const mapped = blocks.flatMap<SessionDraftBlock>((block) => {
    const violates = blockViolatesConstraint(block, args.constraints);
    if (violates || args.constraints.recoveryOnly || args.action === "RECOVERY" || args.action === "HOLD") {
      const out = { ...block, included: false, modificationReason: "Removed by protective/session constraints." };
      removed.push(out);
      if (block.type === "PREP" || block.type === "MOBILITY" || block.type === "DOWNREGULATION") {
        const retained: SessionDraftBlock = {
          ...block,
          included: true,
          intensity: "LOW",
          modificationReason: "Retained as low-risk anchor.",
        };
        modified.push(retained);
        return [retained];
      }

      if (args.action === "MODIFIED" || args.action === "RECOVERY") {
        const sub = buildRecoverySubstitution(block, "Replaced due to constraints.");
        added.push(sub);
        return [sub];
      }

      return [];
    }

    const reduced = reduceBlockForConstraint(block, args.constraints);
    if (reduced.modificationReason && reduced.modificationReason !== block.modificationReason) modified.push(reduced);
    return [reduced];
  });

  return { blocks: mapped, removed, added, modified };
}

export function buildHoldDraftNote(): string {
  return "HOLD state: only protective/recovery modalities kept in draft.";
}
