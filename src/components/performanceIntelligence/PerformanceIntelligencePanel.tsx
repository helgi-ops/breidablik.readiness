"use client";

import type { TeamRiskMap } from "@/lib/micropulse/performanceIntelligence/teamRiskMap";
import type { WeeklyRiskReport } from "@/lib/micropulse/performanceIntelligence/weeklyReport";
import type { TeamOutlook } from "@/lib/micropulse/performanceIntelligence/teamOutlook";

type PerformanceIntelligencePanelProps = {
  teamOutlook: TeamOutlook;
  weeklyReport: WeeklyRiskReport;
  riskMap: TeamRiskMap;
};

function Group({
  title,
  tone,
  rows,
}: {
  title: string;
  tone: string;
  rows: Array<{ playerName?: string; recommendedAction: "full" | "modified" | "recovery" }>;
}) {
  return (
    <div className={`rounded-lg border p-3 ${tone}`}>
      <div className="text-[10px] uppercase tracking-wide font-semibold">{title}</div>
      <div className="mt-1 space-y-1 text-xs">
        {rows.length ? (
          rows.slice(0, 8).map((row, idx) => (
            <div key={`${title}-${row.playerName ?? "p"}-${idx}`}>
              {row.playerName ?? "Player"} – {row.recommendedAction === "full" ? "Full" : row.recommendedAction === "modified" ? "Modified" : "Recovery"}
            </div>
          ))
        ) : (
          <div className="text-slate-500">No players</div>
        )}
      </div>
    </div>
  );
}

export default function PerformanceIntelligencePanel({ teamOutlook, weeklyReport, riskMap }: PerformanceIntelligencePanelProps) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">Performance Intelligence</h3>
        <div className="text-xs text-slate-600">
          Team outlook: <span className="font-semibold text-slate-800">{teamOutlook.band}</span>
        </div>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Weekly Performance Intelligence</div>
          <div className="mt-1">Team average risk: <span className="font-semibold tabular-nums">{weeklyReport.avgRiskScore.toFixed(1)}</span></div>
          <div className="mt-1">{weeklyReport.teamTrend}</div>
          <div className="mt-1">{weeklyReport.recommendation}</div>
          <div className="mt-2">
            <div className="font-semibold">Highest risk</div>
            <div className="mt-1 space-y-0.5">
              {weeklyReport.highestRiskPlayers.slice(0, 3).map((p, idx) => (
                <div key={`high-${p.playerName ?? "p"}-${idx}`}>{p.playerName ?? "Player"} ({p.riskScore.toFixed(1)})</div>
              ))}
            </div>
          </div>
          <div className="mt-2">
            <div className="font-semibold">Most improved</div>
            <div className="mt-1 space-y-0.5">
              {weeklyReport.mostImprovedPlayers.slice(0, 3).map((p, idx) => (
                <div key={`imp-${p.playerName ?? "p"}-${idx}`}>{p.playerName ?? "Player"} ({p.deltaRisk.toFixed(1)})</div>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Team Risk Map</div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <Group title="LOW RISK" tone="border-emerald-200 bg-emerald-50 text-emerald-900" rows={riskMap.lowRisk} />
            <Group title="MODERATE RISK" tone="border-yellow-200 bg-yellow-50 text-yellow-900" rows={riskMap.moderateRisk} />
            <Group title="HIGH RISK" tone="border-orange-200 bg-orange-50 text-orange-900" rows={riskMap.highRisk} />
            <Group title="CRITICAL" tone="border-red-200 bg-red-50 text-red-900" rows={riskMap.criticalRisk} />
          </div>
          <div className="mt-2 text-xs text-slate-600">
            Recovery recommended: <span className="font-semibold">{riskMap.recoveryRecommended.length}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
