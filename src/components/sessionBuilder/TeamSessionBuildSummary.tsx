"use client";

import type { TeamSessionBuildSummary as TeamSessionBuildSummaryType } from "@/lib/micropulse/autoSessionBuilder";

type Props = {
  summary: TeamSessionBuildSummaryType;
};

export default function TeamSessionBuildSummary({ summary }: Props) {
  return (
    <div className="rounded-lg border bg-gray-50/40 px-3 py-2 text-[11px] text-gray-700">
      <div>
        Session drafts: <span className="font-semibold">{summary.fullDrafts}</span> full · <span className="font-semibold">{summary.modifiedDrafts}</span> modified ·{" "}
        <span className="font-semibold">{summary.recoveryDrafts}</span> recovery · <span className="font-semibold">{summary.holdDrafts}</span> hold
      </div>
      {summary.mostCommonExposureLimits.length ? (
        <div className="mt-1">Top exposure limits: {summary.mostCommonExposureLimits.join(", ").toLowerCase()}</div>
      ) : null}
      {summary.mostCommonRecoveryFocus.length ? (
        <div className="mt-1">Top recovery focus: {summary.mostCommonRecoveryFocus.join(", ").toLowerCase()}</div>
      ) : null}
      <div className="mt-1">{summary.summaryText}</div>
    </div>
  );
}
