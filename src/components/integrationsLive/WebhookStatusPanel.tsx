"use client";

import type { WebhookEventRecord } from "@/lib/micropulse/integrationsLive";

type Props = {
  events: WebhookEventRecord[];
};

export default function WebhookStatusPanel({ events }: Props) {
  const verificationFailures = events.filter((event) => !event.verified || event.status === "REJECTED").length;

  return (
    <div className="rounded-xl border bg-white p-3 text-xs text-gray-700">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-600">Webhook status</div>
      <div className="mt-1 text-[11px] text-gray-600">Recent events: {events.length} · verification failures: {verificationFailures}</div>
      {!events.length ? <div className="mt-2 rounded border bg-gray-50 p-2 text-[11px] text-gray-600">No webhook events yet.</div> : null}
      <div className="mt-2 space-y-1">
        {events.slice(0, 30).map((event) => (
          <div key={event.id} className="rounded border bg-gray-50 p-2 text-[11px]">
            <div className="flex items-center justify-between gap-2">
              <div className="font-medium text-gray-900">{event.provider} · {event.eventType ?? "event"}</div>
              <div className="rounded border bg-white px-1.5 py-0.5 text-[10px] font-semibold">{event.status}</div>
            </div>
            <div className="text-gray-600">{event.verificationSummary}</div>
            <div className="text-gray-500">{event.receivedAt ?? "—"} · delivery {event.deliveryId ?? "—"}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

