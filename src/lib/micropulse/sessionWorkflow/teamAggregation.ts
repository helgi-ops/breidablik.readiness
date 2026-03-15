import type { SessionDraftRecord, TeamWorkflowSummary } from "./types";

/** Aggregates workflow records into staff planning summary. */
export function buildTeamWorkflowSummary(records: SessionDraftRecord[]): TeamWorkflowSummary {
  const generatedCount = records.filter((r) => r.status === "GENERATED").length;
  const savedCount = records.filter((r) => r.status === "DRAFT_SAVED").length;
  const inReviewCount = records.filter((r) => r.status === "IN_REVIEW").length;
  const approvedCount = records.filter((r) => r.status === "APPROVED").length;
  const publishedCount = records.filter((r) => r.status === "PUBLISHED").length;

  const reviewNeededPlayers = records
    .filter((r) => r.status === "DRAFT_SAVED" || r.status === "IN_REVIEW")
    .map((r) => ({ playerId: r.playerId, playerName: r.playerName }));

  const unpublishedApprovedPlayers = records
    .filter((r) => r.status === "APPROVED")
    .map((r) => ({ playerId: r.playerId, playerName: r.playerName }));

  return {
    generatedCount,
    savedCount,
    inReviewCount,
    approvedCount,
    publishedCount,
    reviewNeededPlayers,
    unpublishedApprovedPlayers,
    summaryText: `${publishedCount} published · ${approvedCount} approved pending publish · ${inReviewCount + savedCount} still in workflow.`,
  };
}
