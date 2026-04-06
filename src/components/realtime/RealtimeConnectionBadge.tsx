"use client";

import type { RealtimeConnectionState } from "@/lib/micropulse/realtime";

type Props = {
  state: RealtimeConnectionState;
};

function cls(state: RealtimeConnectionState): string {
  if (state === "CONNECTED") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (state === "CONNECTING") return "border-sky-200 bg-sky-50 text-sky-800";
  if (state === "DEGRADED") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-gray-300 bg-gray-100 text-gray-700";
}

export default function RealtimeConnectionBadge({ state }: Props) {
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${cls(state)}`}>Live: {state}</span>;
}

