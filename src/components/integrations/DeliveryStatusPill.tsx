"use client";

import type { IntegrationConnectionStatus } from "@/lib/micropulse/integrations";

type Props = {
  status: IntegrationConnectionStatus;
};

const CLASS_BY_STATUS: Record<IntegrationConnectionStatus, string> = {
  CONNECTED: "border-emerald-200 bg-emerald-50 text-emerald-800",
  PENDING: "border-amber-200 bg-amber-50 text-amber-800",
  ERROR: "border-red-200 bg-red-50 text-red-800",
  DISCONNECTED: "border-gray-200 bg-gray-50 text-gray-700",
  DISABLED: "border-gray-200 bg-gray-100 text-gray-600",
};

export default function DeliveryStatusPill({ status }: Props) {
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${CLASS_BY_STATUS[status]}`}>{status}</span>;
}

