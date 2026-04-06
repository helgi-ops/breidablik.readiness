"use client";

import type { OrganizationSummary } from "@/lib/micropulse/orgIntelligence";

type Props = {
  summary: OrganizationSummary;
};

export default function OrganizationSummaryPanel({ summary }: Props) {
  return (
    <div className="rounded-xl border bg-white p-4 text-sm text-gray-700">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-600">Organization summary</div>
      <div className="mt-2 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded border bg-gray-50 p-2">Teams: <span className="font-semibold">{summary.totalTeams}</span></div>
        <div className="rounded border bg-gray-50 p-2">Athletes: <span className="font-semibold">{summary.totalAthletes ?? "-"}</span></div>
        <div className="rounded border bg-gray-50 p-2">High risk: <span className="font-semibold">{summary.totalHighRisk ?? 0}</span></div>
        <div className="rounded border bg-gray-50 p-2">Critical risk: <span className="font-semibold">{summary.totalCriticalRisk ?? 0}</span></div>
        <div className="rounded border bg-gray-50 p-2">Pending reviews: <span className="font-semibold">{summary.totalPendingReviews ?? 0}</span></div>
        <div className="rounded border bg-gray-50 p-2">Completion: <span className="font-semibold">{Math.round((summary.deliveryCompletionRate ?? 0) * 100)}%</span></div>
      </div>
      <div className="mt-2 text-xs text-gray-600">{summary.summaryText}</div>
    </div>
  );
}
