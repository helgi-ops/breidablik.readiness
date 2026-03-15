"use client";

import { useMemo, useState } from "react";
import { rankTeamsByMetric, type TeamComparisonMetricKey, type TeamComparisonRow } from "@/lib/micropulse/orgIntelligence";

type Props = {
  rows: TeamComparisonRow[];
};

const METRICS: TeamComparisonMetricKey[] = [
  "COMPLETION_RATE",
  "PENDING_REVIEWS",
  "HIGH_RISK_COUNT",
  "RECOVERY_COUNT",
  "READINESS",
  "INJURY_RISK",
  "PERFORMANCE",
  "LOAD_TOLERANCE",
  "COLLAPSE_RISK",
];

export default function TeamComparisonTable({ rows }: Props) {
  const [metric, setMetric] = useState<TeamComparisonMetricKey>("COMPLETION_RATE");
  const ranked = useMemo(() => rankTeamsByMetric(rows, metric, "desc"), [rows, metric]);

  return (
    <div className="rounded-xl border bg-white p-4 text-xs text-gray-700">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-600">Team comparison</div>
        <select
          value={metric}
          onChange={(e) => setMetric(e.target.value as TeamComparisonMetricKey)}
          className="rounded border px-2 py-1 text-xs"
        >
          {METRICS.map((m) => (
            <option key={m} value={m}>
              {m.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-2 overflow-x-auto">
        <table className="min-w-full border text-left">
          <thead className="bg-gray-50">
            <tr>
              <th className="border px-2 py-1">Team</th>
              <th className="border px-2 py-1">Selected metric</th>
              <th className="border px-2 py-1">Summary</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((row) => (
              <tr key={row.teamId}>
                <td className="border px-2 py-1 font-medium">{row.teamName}</td>
                <td className="border px-2 py-1 tabular-nums">
                  {row.metricValues[metric] == null
                    ? "-"
                    : metric === "COMPLETION_RATE"
                    ? `${Math.round((row.metricValues[metric] ?? 0) * 100)}%`
                    : Number(row.metricValues[metric]).toFixed(2)}
                </td>
                <td className="border px-2 py-1">{row.comparisonSummary ?? "-"}</td>
              </tr>
            ))}
            {!ranked.length ? (
              <tr>
                <td colSpan={3} className="border px-2 py-2 text-center text-gray-500">
                  No team comparison data.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
