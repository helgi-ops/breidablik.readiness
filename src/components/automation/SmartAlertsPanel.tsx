"use client";

import type { SmartAlertRecord } from "@/lib/micropulse/automation";

type Props = {
  alerts: SmartAlertRecord[];
  onAcknowledge: (id: string) => void;
  onResolve: (id: string) => void;
};

function severityClass(severity: SmartAlertRecord["severity"]): string {
  if (severity === "CRITICAL" || severity === "HIGH") return "border-red-200 bg-red-50 text-red-800";
  if (severity === "WARNING") return "border-amber-200 bg-amber-50 text-amber-800";
  if (severity === "NOTICE") return "border-sky-200 bg-sky-50 text-sky-800";
  return "border-gray-200 bg-gray-50 text-gray-700";
}

export default function SmartAlertsPanel({ alerts, onAcknowledge, onResolve }: Props) {
  return (
    <div className="rounded-xl border bg-white p-3 text-xs text-gray-700">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-600">Smart alerts</div>
      {!alerts.length ? <div className="mt-2 rounded border bg-gray-50 p-2 text-[11px] text-gray-600">No alerts.</div> : null}
      <div className="mt-2 space-y-1">
        {alerts.slice(0, 40).map((alert) => (
          <div key={alert.id} className="rounded border bg-gray-50 p-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-[11px] font-medium text-gray-900">{alert.title}</div>
              <span className={`inline-flex rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${severityClass(alert.severity)}`}>{alert.severity}</span>
            </div>
            <div className="mt-1 text-[11px] text-gray-600">{alert.summary}</div>
            <div className="text-[10px] text-gray-500">
              {alert.status} · {alert.createdAt ? new Date(alert.createdAt).toLocaleString() : "-"}
              {alert.teamId ? ` · team ${alert.teamId}` : ""}
              {alert.playerId ? ` · player ${alert.playerId}` : ""}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" className="rounded border bg-white px-2 py-1 text-[10px]" onClick={() => onAcknowledge(alert.id)}>
                Acknowledge
              </button>
              <button type="button" className="rounded border bg-white px-2 py-1 text-[10px]" onClick={() => onResolve(alert.id)}>
                Resolve
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

