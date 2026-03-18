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
      </div>
    </div>
  );
}
