"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TeamStatusOverviewData } from "@/lib/micropulse/coachCommand";

type Props = {
  data: TeamStatusOverviewData;
};

const STATE_STYLES = {
  GREEN: "border-emerald-200 bg-emerald-50 text-emerald-900",
  YELLOW: "border-amber-200 bg-amber-50 text-amber-900",
  RED: "border-rose-200 bg-rose-50 text-rose-900",
  GRAY: "border-slate-200 bg-slate-50 text-slate-900",
} as const;

export default function TeamStatusOverview({ data }: Props) {
  const cards = [
    ["GREEN", data.counts.green, data.readinessDistributionPct.green],
    ["YELLOW", data.counts.yellow, data.readinessDistributionPct.yellow],
    ["RED", data.counts.red, data.readinessDistributionPct.red],
    ["GRAY", data.counts.gray, data.readinessDistributionPct.gray],
  ] as const;

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="pb-4">
        <CardTitle className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-900">
          Team Status Overview
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map(([label, count, pct]) => (
            <div key={label} className={`rounded-2xl border px-4 py-4 ${STATE_STYLES[label]}`}>
              <div className="text-xs font-semibold tracking-[0.18em]">{label}</div>
              <div className="mt-2 text-3xl font-semibold tabular-nums">{count}</div>
              <div className="mt-1 text-sm">{pct}% of squad</div>
            </div>
          ))}
        </div>
        <div className="grid gap-3 text-sm text-slate-700 sm:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Average readiness</div>
            <div className="mt-2 text-xl font-semibold text-slate-900">
              {typeof data.averageReadinessScore === "number" ? data.averageReadinessScore.toFixed(1) : "—"}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Risk flags</div>
            <div className="mt-2 text-xl font-semibold text-slate-900">{data.playersWithRiskFlags}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Modified today</div>
            <div className="mt-2 text-xl font-semibold text-slate-900">{data.playersModified}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Recovery only</div>
            <div className="mt-2 text-xl font-semibold text-slate-900">{data.playersRecoveryOnly}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Pending review</div>
            <div className="mt-2 text-xl font-semibold text-slate-900">{data.playersPendingReview}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
