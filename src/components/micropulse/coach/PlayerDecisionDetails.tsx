"use client";

import type { PlayerDecisionListItem } from "@/lib/micropulse/coachCommand";

type Props = {
  player: PlayerDecisionListItem;
};

export default function PlayerDecisionDetails({ player }: Props) {
  return (
    <div className="grid gap-4 border-t border-slate-200 bg-slate-50 px-4 py-4 lg:grid-cols-[1.4fr_1fr]">
      <div className="space-y-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Top factors</div>
          <div className="mt-2 space-y-2">
            {player.explanationFactors.length ? player.explanationFactors.map((factor) => (
              <div key={factor.key} className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-slate-900">
                    {factor.label}
                    {factor.value != null ? ` · ${String(factor.value)}` : ""}
                  </div>
                  <div className="text-xs font-medium text-slate-500">{factor.impactScore}</div>
                </div>
                <div className="mt-1 text-sm text-slate-600">{factor.summary}</div>
              </div>
            )) : <div className="text-sm text-slate-500">No explanation factors available.</div>}
          </div>
        </div>
      </div>
      <div className="space-y-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Constraints</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {player.constraints.length ? player.constraints.map((item) => (
              <span key={item} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700">
                {item}
              </span>
            )) : <span className="text-sm text-slate-500">No constraints.</span>}
          </div>
        </div>
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Focus</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {player.focus.length ? player.focus.map((item) => (
              <span key={item} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700">
                {item}
              </span>
            )) : <span className="text-sm text-slate-500">No focus tags.</span>}
          </div>
        </div>
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Risk flags</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {player.riskFlags.length ? player.riskFlags.map((item) => (
              <span key={item} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700">
                {item}
              </span>
            )) : <span className="text-sm text-slate-500">No risk flags.</span>}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Confidence</div>
          <div className="mt-2 text-sm text-slate-700">
            <span className="font-semibold text-slate-900">{player.confidenceBand.toUpperCase()}</span>
            {` · ${(player.confidenceScore * 100).toFixed(0)}%`}
          </div>
        </div>
        {player.fatigueType && player.fatigueType !== "normal" ? (
          <div className={`rounded-2xl border px-4 py-3 ${
            player.fatigueType === "global_fatigue"
              ? "border-rose-200 bg-rose-50"
              : player.fatigueType === "mechanical_fatigue"
              ? "border-orange-200 bg-orange-50"
              : "border-blue-200 bg-blue-50"
          }`}>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Fatigue type</div>
            <div className="mt-2 text-sm font-semibold">
              {player.fatigueType === "global_fatigue"
                ? "Global Fatigue — bæði vöðva- og orkukerfi undir álagi"
                : player.fatigueType === "mechanical_fatigue"
                ? "Mechanical Fatigue — vöðvaálag hátt, orkukerfi OK"
                : "Metabolic Fatigue — orkuálag hátt, vöðvaálag OK"}
            </div>
          </div>
        ) : null}
        {player.loadAlerts && player.loadAlerts.length > 0 ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Load alerts</div>
            <div className="mt-2 space-y-1">
              {player.loadAlerts.map((alert, i) => (
                <div key={i} className="text-sm text-amber-900">{alert}</div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
