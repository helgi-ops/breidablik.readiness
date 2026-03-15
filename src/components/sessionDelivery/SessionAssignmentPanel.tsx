"use client";

import type { SessionAssignmentRecord } from "@/lib/micropulse/sessionDelivery";
import DeliveryStatusBadge from "./DeliveryStatusBadge";

type Props = {
  assignment: SessionAssignmentRecord | null;
  onAssign: () => void;
  onCancel: () => void;
  onMarkDelivered: () => void;
};

export default function SessionAssignmentPanel({ assignment, onAssign, onCancel, onMarkDelivered }: Props) {
  return (
    <div className="rounded-xl border bg-white p-3 text-xs text-gray-700">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-600">Assignment</div>
        <DeliveryStatusBadge status={assignment?.assignmentStatus ?? "UNASSIGNED"} />
      </div>

      {!assignment ? <div className="mt-2 text-gray-500">No assignment yet.</div> : null}
      {assignment ? (
        <div className="mt-2 space-y-1 text-[11px] text-gray-600">
          <div>Channels: {assignment.deliveryChannels.join(", ")}</div>
          <div>Assigned: {assignment.assignedAt ? new Date(assignment.assignedAt).toLocaleString() : "-"}</div>
          <div>Delivered: {assignment.deliveredAt ? new Date(assignment.deliveredAt).toLocaleString() : "-"}</div>
          <div>Seen: {assignment.seenAt ? new Date(assignment.seenAt).toLocaleString() : "-"}</div>
          <div>Acknowledged: {assignment.acknowledgedAt ? new Date(assignment.acknowledgedAt).toLocaleString() : "-"}</div>
          <div>Completed: {assignment.completedAt ? new Date(assignment.completedAt).toLocaleString() : "-"}</div>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onAssign}
          className="rounded border px-3 py-1.5 text-xs font-medium text-gray-800"
        >
          Assign
        </button>
        <button
          type="button"
          onClick={onMarkDelivered}
          disabled={!assignment || assignment.assignmentStatus === "CANCELLED"}
          className="rounded border px-3 py-1.5 text-xs font-medium text-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Mark delivered
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={!assignment || assignment.assignmentStatus === "CANCELLED"}
          className="rounded border px-3 py-1.5 text-xs font-medium text-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
