import { buildFieldSessionDraft } from "./fieldBuilder";
import { buildGymSessionDraft } from "./gymBuilder";
import { buildNormalizedSessionBuildInput, resolveSessionType } from "./normalize";
import { buildRecoverySessionDraft } from "./recoveryBuilder";
import type { SessionBuildInput, SessionDraft } from "./types";

function buildMatchOrOffDraft(input: SessionBuildInput, sessionType: "MATCH" | "OFF"): SessionDraft {
  const recommendation = input.finalRecommendationDecision?.finalRecommendation ?? input.prescriptionDecision;
  const action = recommendation?.action ?? (sessionType === "OFF" ? "RECOVERY" : "MODIFIED");
  const summary =
    sessionType === "MATCH"
      ? "Matchday context draft: preserve readiness, avoid unnecessary loading changes."
      : "Off-day restore draft: optional recovery work only.";

  return {
    playerId: input.playerId,
    playerName: input.playerName,
    teamId: input.teamId,
    date: input.date,
    sessionType,
    baseTemplateId: null,
    draftAction: action,
    draftSummary: summary,
    coachInstruction: sessionType === "MATCH" ? "Use matchday plan. Apply only protective constraints if needed." : "Off day. Keep optional restore work only.",
    blocks: [],
    removedBlocks: [],
    modifiedBlocks: [],
    addedBlocks: [],
    exposureLimits: [],
    volumeReductionPercent: null,
    intensityCap: recommendation?.intensityCap ?? null,
    recoveryFocus: recommendation?.recoveryFocus ?? [],
    matchContext: recommendation?.matchContext ?? [],
    explanationLines: [summary],
    confidence: input.dataConfidence ?? recommendation?.confidence ?? 0.45,
    editable: true,
  };
}

/**
 * Builds deterministic, coach-editable session drafts from the final recommendation stack.
 * This layer is action-construction (recommendation -> practical draft), not re-decision logic.
 */
export function buildSessionDraft(raw: unknown): SessionDraft {
  const input = buildNormalizedSessionBuildInput(raw);
  const sessionType = resolveSessionType(input);

  if (sessionType === "GYM") return buildGymSessionDraft(input);
  if (sessionType === "FIELD") return buildFieldSessionDraft(input);
  if (sessionType === "RECOVERY") return buildRecoverySessionDraft(input);
  if (sessionType === "MATCH") return buildMatchOrOffDraft(input, "MATCH");
  if (sessionType === "OFF") return buildMatchOrOffDraft(input, "OFF");

  const action = input.finalRecommendationDecision?.finalRecommendation.action ?? input.prescriptionDecision?.action ?? "MODIFIED";
  if (action === "FULL") return buildFieldSessionDraft({ ...input, plannedSessionType: "field" });
  if (action === "MODIFIED") return buildGymSessionDraft({ ...input, plannedSessionType: "gym" });
  return buildRecoverySessionDraft(input);
}
