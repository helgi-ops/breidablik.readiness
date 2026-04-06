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
    intensity: "LOW",
    exposureTags: b.exposureTags ?? [],
    included: true,
    modificationReason: "Recovery-focused template block.",
  }));
}

/** Builds recovery/hold session drafts with restorative block emphasis. */
export function buildRecoverySessionDraft(input: SessionBuildInput): SessionDraft {
  const recommendation = input.finalRecommendationDecision?.finalRecommendation ?? input.prescriptionDecision;
  const action = recommendation?.action === "HOLD" ? "HOLD" : "RECOVERY";
  const template = getMatchdayAwareTemplate({ sessionType: "RECOVERY", dayType: input.dayType });

  const blocks = toDraftBlocks(template.blocks);
  const draft: SessionDraft = {
    playerId: input.playerId,
    playerName: input.playerName,
    teamId: input.teamId,
    date: input.date,
    sessionType: input.dayType === "off" ? "OFF" : "RECOVERY",
    baseTemplateId: template.id,
    draftAction: action,
    draftSummary: "",
    coachInstruction: "",
    blocks,
    removedBlocks: [],
    modifiedBlocks: blocks,
    addedBlocks: [],
    exposureLimits: ["RECOVERY_ONLY"],
    volumeReductionPercent: action === "HOLD" ? 50 : 30,
    intensityCap: "RECOVERY_ONLY",
    recoveryFocus: recommendation?.recoveryFocus ?? ["MOBILITY", "DOWNREGULATION"],
    matchContext: recommendation?.matchContext ?? [],
    explanationLines: [],
    confidence: input.dataConfidence ?? recommendation?.confidence ?? 0.45,
    editable: true,
  };

  draft.draftSummary = buildSessionDraftSummary(draft);
  draft.coachInstruction = buildSessionCoachInstruction(draft);
  draft.explanationLines = buildSessionExplanationLines(draft);
  return draft;
}
