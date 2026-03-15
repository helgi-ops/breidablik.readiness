import { mapExposureGuidanceToConstraints } from "./exposureMapping";
import { applyIntensityCap, applyVolumeReduction, adaptBlocksForAction, volumeAdjustmentToPercent } from "./adaptationRules";
import { buildSessionCoachInstruction, buildSessionDraftSummary, buildSessionExplanationLines } from "./explanations";
import { getMatchdayAwareTemplate } from "./templateLibrary";
import type { SessionBuildInput, SessionDraft, SessionDraftBlock } from "./types";

function toDraftBlocks(blocks: ReturnType<typeof getMatchdayAwareTemplate>["blocks"]): SessionDraftBlock[] {
  return blocks.map((b) => ({
    id: b.id,
    type: b.type,
    title: b.title,
    description: b.description,
    durationMin: b.defaultDurationMin ?? null,
    sets: b.defaultSets ?? null,
    reps: b.defaultReps ?? null,
    intensity: b.defaultIntensity ?? null,
    exposureTags: b.exposureTags ?? [],
    included: true,
    modificationReason: null,
  }));
}

/** Builds a gym-oriented draft and applies deterministic adaptations. */
export function buildGymSessionDraft(input: SessionBuildInput): SessionDraft {
  const recommendation = input.finalRecommendationDecision?.finalRecommendation ?? input.prescriptionDecision;
  const action = recommendation?.action ?? "MODIFIED";
  const intensityCap = recommendation?.intensityCap ?? "CAP_MODERATE";
  const volumePercent = volumeAdjustmentToPercent(recommendation?.volumeAdjustment ?? "REDUCE_10");
  const template = getMatchdayAwareTemplate({ sessionType: "GYM", dayType: input.dayType });

  let blocks = toDraftBlocks(template.blocks);
  blocks = applyIntensityCap(blocks, intensityCap);
  blocks = applyVolumeReduction(blocks, volumePercent);

  const constraints = mapExposureGuidanceToConstraints(recommendation?.exposureGuidance ?? []);
  const adapted = adaptBlocksForAction(blocks, { action, constraints });

  const draft: SessionDraft = {
    playerId: input.playerId,
    playerName: input.playerName,
    teamId: input.teamId,
    date: input.date,
    sessionType: "GYM",
    baseTemplateId: template.id,
    draftAction: action,
    draftSummary: "",
    coachInstruction: "",
    blocks: adapted.blocks,
    removedBlocks: adapted.removed,
    modifiedBlocks: adapted.modified,
    addedBlocks: adapted.added,
    exposureLimits: constraints.blockTagsToRemove,
    volumeReductionPercent: volumePercent,
    intensityCap,
    recoveryFocus: recommendation?.recoveryFocus ?? [],
    matchContext: recommendation?.matchContext ?? [],
    explanationLines: [],
    confidence: input.dataConfidence ?? recommendation?.confidence ?? 0.5,
    editable: true,
  };

  draft.draftSummary = buildSessionDraftSummary(draft);
  draft.coachInstruction = buildSessionCoachInstruction(draft);
  draft.explanationLines = buildSessionExplanationLines(draft);
  return draft;
}
