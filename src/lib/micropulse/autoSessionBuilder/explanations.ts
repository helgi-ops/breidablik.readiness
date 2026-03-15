import type { SessionDraft, SessionDraftBlock } from "./types";

export function buildSessionBlockReason(block: SessionDraftBlock): string {
  return block.modificationReason ?? `${block.title} kept for session intent.`;
}

export function buildSessionDraftSummary(draft: SessionDraft): string {
  const removed = draft.removedBlocks.length;
  const modified = draft.modifiedBlocks.length;
  const added = draft.addedBlocks.length;

  const parts: string[] = [`${draft.draftAction} ${draft.sessionType.toLowerCase()} draft`];
  if (draft.volumeReductionPercent && draft.volumeReductionPercent > 0) parts.push(`${draft.volumeReductionPercent}% volume reduction`);
  if (draft.intensityCap && draft.intensityCap !== "NO_CAP") parts.push(`intensity cap ${draft.intensityCap.toLowerCase()}`);
  if (removed > 0 || modified > 0 || added > 0) parts.push(`${modified} modified · ${removed} removed · ${added} added`);
  return parts.join(" · ");
}

export function buildSessionCoachInstruction(draft: SessionDraft): string {
  if (draft.draftAction === "FULL") {
    return "Run planned structure. Keep quality high and monitor response during main block.";
  }
  if (draft.draftAction === "MODIFIED") {
    return "Run modified draft. Preserve quality, control exposure, and stop escalation if response drops.";
  }
  if (draft.draftAction === "RECOVERY") {
    return "Use recovery draft. Keep loading low and prioritize restoration before next session.";
  }
  return "Use protective hold draft only. No aggressive loading today.";
}

export function buildSessionExplanationLines(draft: SessionDraft): string[] {
  const lines: string[] = [];
  if (draft.volumeReductionPercent && draft.volumeReductionPercent > 0) {
    lines.push(`Volume adjusted by ${draft.volumeReductionPercent}% based on final recommendation.`);
  }
  if (draft.intensityCap && draft.intensityCap !== "NO_CAP") {
    lines.push(`Intensity cap applied: ${draft.intensityCap.replace(/_/g, " ").toLowerCase()}.`);
  }
  if (draft.exposureLimits.length) {
    lines.push(`Exposure limits applied: ${draft.exposureLimits.slice(0, 4).join(", ").toLowerCase()}.`);
  }
  if (draft.removedBlocks.length) {
    lines.push(`Removed ${draft.removedBlocks.length} block(s) that conflicted with protection constraints.`);
  }
  if (draft.addedBlocks.length) {
    lines.push(`Added ${draft.addedBlocks.length} protective/recovery block(s) to preserve useful session structure.`);
  }
  if (!lines.length) lines.push("Template retained with minimal adjustments.");
  return lines;
}
