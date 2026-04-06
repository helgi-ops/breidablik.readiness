"use client";

import type { SyncHealthSummary } from "@/lib/micropulse/integrationsLive";

type Props = {
  summary: SyncHealthSummary | null;
};

export default function SyncHealthPanel({ summary }: Props) {
  return (
    <div className="rounded-xl border bg-white p-3 text-xs text-gray-700">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-600">Sync health</div>
      {!summary ? <div className="mt-2 rounded border bg-gray-50 p-2 text-[11px] text-gray-600">No health data yet.</div> : null}
      {summary ? (
        <>
          <div className="mt-1 text-[11px] text-gray-600">{summary.summaryText}</div>
          <div className="mt-2 grid gap-2 text-[11px] md:grid-cols-3">
            <div>Connected: {summary.connectedProviders}</div>
            <div>Healthy: {summary.healthyConnections}</div>
            <div>Degraded: {summary.degradedConnections}</div>
            <div>Failing: {summary.failingConnections}</div>
            <div>Queued: {summary.queuedJobs}</div>
            <div>Running: {summary.runningJobs}</div>
            <div>Recent failed jobs: {summary.failedRecentJobs}</div>
            <div>Webhook failures: {summary.webhookFailures}</div>
          </div>
        </>
      ) : null}
    </div>
  );
}

