"use client";

import type { AutomationSummary } from "@/lib/micropulse/automation";

type Props = {
  summary: AutomationSummary;
};

export default function AutomationSummaryStrip({ summary }: Props) {
  return (
    <div className="rounded-xl border bg-white p-3 text-xs text-gray-700">
      <div className="grid gap-2 md:grid-cols-5">
        <div className="rounded border bg-gray-50 px-2 py-1">Open alerts: <span className="font-semibold">{summary.openAlerts}</span></div>
        <div className="rounded border bg-gray-50 px-2 py-1">Critical/high: <span className="font-semibold">{summary.criticalAlerts}</span></div>
        <div className="rounded border bg-gray-50 px-2 py-1">Escalations open: <span className="font-semibold">{summary.escalationsOpen}</span></div>
        <div className="rounded border bg-gray-50 px-2 py-1">Actions executed today: <span className="font-semibold">{summary.actionsExecutedToday}</span></div>
        <div className="rounded border bg-gray-50 px-2 py-1">Suppressed alerts: <span className="font-semibold">{summary.suppressedAlerts}</span></div>
      </div>
      <div className="mt-1 text-[11px] text-gray-600">{summary.summaryText}</div>
    </div>
  );
}

