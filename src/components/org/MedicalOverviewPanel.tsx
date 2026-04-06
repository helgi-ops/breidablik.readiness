"use client";

import type { MedicalOverviewSummary } from "@/lib/micropulse/orgIntelligence";

type Props = {
  summary: MedicalOverviewSummary;
};

export default function MedicalOverviewPanel({ summary }: Props) {
  return (
    <div className="rounded-xl border bg-white p-4 text-xs text-gray-700">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-600">Medical overview</div>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        <div className="rounded border bg-gray-50 p-2">High risk: <span className="font-semibold">{summary.totalHighRiskPlayers}</span></div>
        <div className="rounded border bg-gray-50 p-2">Critical risk: <span className="font-semibold">{summary.totalCriticalRiskPlayers}</span></div>
        <div className="rounded border bg-gray-50 p-2">Recovery recommended: <span className="font-semibold">{summary.totalRecoveryRecommended}</span></div>
      </div>
      <div className="mt-2 text-[11px] text-gray-600">{summary.summaryText}</div>
      {summary.teamsMostInNeedOfReview.length ? (
        <div className="mt-2 text-[11px] text-gray-600">
          Priority teams: {summary.teamsMostInNeedOfReview.map((t) => `${t.teamName} (${t.pendingReviewCount})`).join(", ")}
        </div>
      ) : null}
    </div>
  );
}
