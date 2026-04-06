"use client";

import type { SyncJobRecord } from "@/lib/micropulse/integrationsLive";

type Props = {
  jobs: SyncJobRecord[];
};

export default function SyncJobHistoryPanel({ jobs }: Props) {
  return (
    <div className="rounded-xl border bg-white p-3 text-xs text-gray-700">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-600">Sync jobs</div>
      {!jobs.length ? <div className="mt-2 rounded border bg-gray-50 p-2 text-[11px] text-gray-600">No sync jobs yet.</div> : null}
      <div className="mt-2 space-y-1">
        {jobs.slice(0, 30).map((job) => (
          <div key={job.id} className="rounded border bg-gray-50 p-2 text-[11px]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-medium text-gray-900">{job.provider} · {job.jobType}</div>
              <div className="rounded border bg-white px-1.5 py-0.5 text-[10px] font-semibold">{job.status}</div>
            </div>
            <div className="text-gray-600">Started: {job.startedAt ?? "—"} · Completed: {job.completedAt ?? "—"}</div>
            <div className="text-gray-500">Attempts: {job.attemptCount}/{job.maxAttempts} · Retry at: {job.retryAt ?? "—"}</div>
            <div className="text-gray-600">{job.summary}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

