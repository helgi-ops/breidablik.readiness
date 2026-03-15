"use client";

import type { SessionNotificationEvent } from "@/lib/micropulse/sessionDelivery";

type Props = {
  events: SessionNotificationEvent[];
};

export default function NotificationHistoryPanel({ events }: Props) {
  return (
    <div className="rounded-xl border bg-white p-3 text-xs text-gray-700">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-600">Notification history</div>
      <div className="mt-2 space-y-2">
        {events.map((event) => (
          <div key={event.id} className="rounded border bg-gray-50 p-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-semibold">{event.type.replaceAll("_", " ")}</div>
              <span className="rounded-full border px-2 py-0.5 text-[10px] font-semibold">{event.status}</span>
            </div>
            <div className="mt-1 text-[11px] text-gray-600">{event.channel} · {event.timestamp ? new Date(event.timestamp).toLocaleString() : "-"}</div>
            <div className="mt-1">{event.message}</div>
          </div>
        ))}
        {!events.length ? <div className="text-[11px] text-gray-500">No notification events.</div> : null}
      </div>
    </div>
  );
}
