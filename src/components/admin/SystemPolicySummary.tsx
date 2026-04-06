"use client";

import type { AdminSystemSummary } from "@/lib/micropulse/adminConfig";

type Props = {
  value: AdminSystemSummary;
};

function SummaryChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-zinc-50 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="text-sm font-semibold tabular-nums text-zinc-900">{value}</div>
    </div>
  );
}

export default function SystemPolicySummary({ value }: Props) {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="text-xs font-medium text-zinc-500">System summary</div>
      <div className="text-base font-semibold">Rules + overrides snapshot</div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <SummaryChip label="Active rules" value={value.activeRuleCount} />
        <SummaryChip label="Protected" value={value.protectedPlayerCount} />
        <SummaryChip label="Review required" value={value.reviewRequiredCount} />
        <SummaryChip label="Overrides today" value={value.overridesTodayCount} />
        <SummaryChip label="Overrides 7d" value={value.overridesThisWeekCount} />
      </div>

      <div className="mt-3 text-sm text-zinc-600">{value.summaryText}</div>
    </div>
  );
}
