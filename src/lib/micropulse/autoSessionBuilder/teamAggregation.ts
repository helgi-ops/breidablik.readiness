import type { SessionDraft, SessionExposureTag, TeamSessionBuildSummary } from "./types";

function topN<T extends string>(items: T[], n: number): T[] {
  const counts = new Map<T, number>();
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([key]) => key);
}

/** Aggregates per-player drafts into a compact team build summary. */
export function buildTeamSessionBuildSummary(drafts: Array<{ playerId?: string; playerName?: string; draft: SessionDraft }>): TeamSessionBuildSummary {
  const totalBuilt = drafts.length;
  const fullDrafts = drafts.filter((d) => d.draft.draftAction === "FULL").length;
  const modifiedDrafts = drafts.filter((d) => d.draft.draftAction === "MODIFIED").length;
  const recoveryDrafts = drafts.filter((d) => d.draft.draftAction === "RECOVERY").length;
  const holdDrafts = drafts.filter((d) => d.draft.draftAction === "HOLD").length;

  const exposure = drafts.flatMap((d) => d.draft.exposureLimits) as SessionExposureTag[];
  const recovery = drafts.flatMap((d) => d.draft.recoveryFocus ?? []);

  const mostCommonExposureLimits = topN(exposure, 3);
  const mostCommonRecoveryFocus = topN(recovery, 3);

  return {
    totalBuilt,
    fullDrafts,
    modifiedDrafts,
    recoveryDrafts,
    holdDrafts,
    mostCommonExposureLimits,
    mostCommonRecoveryFocus,
    summaryText: `${fullDrafts} full, ${modifiedDrafts} modified, ${recoveryDrafts} recovery, ${holdDrafts} hold drafts built.`,
  };
}
