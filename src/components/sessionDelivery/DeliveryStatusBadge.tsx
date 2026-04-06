"use client";

import type { SessionAssignmentStatus } from "@/lib/micropulse/sessionDelivery";

type Props = {
  status: SessionAssignmentStatus;
};

const STYLE: Record<SessionAssignmentStatus, string> = {
  UNASSIGNED: "border-slate-200 bg-slate-100 text-slate-700",
  ASSIGNED: "border-blue-200 bg-blue-50 text-blue-700",
  DELIVERED: "border-cyan-200 bg-cyan-50 text-cyan-700",
  SEEN: "border-amber-200 bg-amber-50 text-amber-700",
  ACKNOWLEDGED: "border-violet-200 bg-violet-50 text-violet-700",
  COMPLETED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  MISSED: "border-rose-200 bg-rose-50 text-rose-700",
  CANCELLED: "border-zinc-200 bg-zinc-100 text-zinc-700",
};

export default function DeliveryStatusBadge({ status }: Props) {
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${STYLE[status]}`}>{status}</span>;
}
