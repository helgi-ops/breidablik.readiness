"use client";

import React from "react";
import type { SessionWorkflowEvent } from "@/lib/micropulse/sessionWorkflow";

type Props = {
  events: SessionWorkflowEvent[];
};

export default function SessionChangeLog({ events }: Props) {
  return (
    <div className="rounded-xl border bg-white p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-600">Change Log</div>
      {!events.length ? <div className="mt-2 text-xs text-gray-500">No workflow events yet.</div> : null}
      <div className="mt-2 space-y-2">
        {events.map((event) => (
          <div key={event.id} className="rounded border bg-gray-50 p-2 text-xs text-gray-700">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-semibold">{event.actionType.replaceAll("_", " ")}</div>
              <div className="text-[11px] text-gray-500">{event.timestamp ? new Date(event.timestamp).toLocaleString() : "-"}</div>
            </div>
            <div className="mt-1">{event.summary}</div>
            <div className="mt-1 text-[11px] text-gray-500">Actor: {event.actorName || event.actorId || "Unknown"}</div>
            {event.reason ? <div className="mt-1 text-[11px] text-gray-500">Reason: {event.reason}</div> : null}
            {event.changes?.length ? (
              <div className="mt-1 text-[11px] text-gray-500">Changes: {event.changes.length}</div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
