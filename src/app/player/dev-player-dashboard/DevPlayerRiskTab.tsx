"use client";

import type { DevPlayerRiskViewModel } from "@/lib/micropulse/playerDashboard/devPlayerViewModel";

type Props = {
  viewModel: DevPlayerRiskViewModel;
};

export default function DevPlayerRiskTab({ viewModel }: Props) {
  const tone =
    viewModel.tone === "green"
      ? "border-emerald-200 bg-emerald-50/60"
      : viewModel.tone === "yellow"
      ? "border-amber-200 bg-amber-50/70"
      : viewModel.tone === "red"
      ? "border-rose-200 bg-rose-50/70"
      : "border-zinc-200 bg-zinc-50";

  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${tone}`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Risk</div>
      <div className="mt-1 text-lg font-semibold text-zinc-900">{viewModel.statusLabel}</div>
      <div className="mt-2 text-sm text-zinc-700">{viewModel.primaryMessage}</div>
      {viewModel.why ? (
        <div className="mt-3 rounded-xl border border-white/70 bg-white/70 p-3 text-sm text-zinc-700">
          <span className="font-semibold text-zinc-900">Why this status?</span> {viewModel.why}
        </div>
      ) : null}
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-white/70 bg-white/70 p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Recovery Signals</div>
          <div className="mt-1 text-sm text-zinc-700">{viewModel.recoverySignals}</div>
        </div>
        <div className="rounded-xl border border-white/70 bg-white/70 p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Neural Fatigue</div>
          <div className="mt-1 text-sm text-zinc-700">{viewModel.neuralFatigue}</div>
        </div>
      </div>
    </div>
  );
}
