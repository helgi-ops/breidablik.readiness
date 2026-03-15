"use client";

import type { PerformanceOverviewSummary } from "@/lib/micropulse/orgIntelligence";

type Props = {
  summary: PerformanceOverviewSummary;
};

export default function PerformanceOverviewPanel({ summary }: Props) {
  return (
    <div className="rounded-xl border bg-white p-4 text-xs text-gray-700">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-600">Performance overview</div>
      <div className="mt-2 text-[11px] text-gray-600">{summary.summaryText}</div>
      <div className="mt-2 space-y-1 text-[11px] text-gray-600">
        <div>Peak window teams: {summary.teamsWithHighestPeakWindowCount.map((t) => `${t.teamName} (${t.peakWindowCount})`).join(", ") || "-"}</div>
        <div>Instability teams: {summary.teamsWithHighestInstabilityCount.map((t) => `${t.teamName} (${t.unstablePlayerCount})`).join(", ") || "-"}</div>
        <div>Modified load teams: {summary.teamsWithHighestModifiedLoad.map((t) => `${t.teamName} (${t.modifiedLoadCount})`).join(", ") || "-"}</div>
      </div>
    </div>
  );
}
