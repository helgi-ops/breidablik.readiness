"use client";

import type { IntegrationProviderKey } from "@/lib/micropulse/integrations";
import type { ProviderConnectionRuntimeStatus } from "@/lib/micropulse/integrationsLive";

type Props = {
  provider: IntegrationProviderKey;
  runtime?: ProviderConnectionRuntimeStatus | null;
  onConnect: (provider: IntegrationProviderKey) => void;
  onDisconnect: (provider: IntegrationProviderKey) => void;
  onManualSync: (provider: IntegrationProviderKey) => void;
};

function statusClass(status: ProviderConnectionRuntimeStatus["lifecycleStatus"] | "NOT_CONNECTED"): string {
  if (status === "CONNECTED") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "AUTH_PENDING") return "border-amber-200 bg-amber-50 text-amber-800";
  if (status === "ERROR" || status === "EXPIRED") return "border-red-200 bg-red-50 text-red-800";
  return "border-gray-200 bg-gray-50 text-gray-700";
}

export default function ProviderConnectionCard({ provider, runtime, onConnect, onDisconnect, onManualSync }: Props) {
  const status = runtime?.lifecycleStatus ?? "NOT_CONNECTED";
  return (
    <div className="rounded-xl border bg-white p-3 text-xs text-gray-700">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-gray-900">{provider}</div>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusClass(status)}`}>{status}</span>
      </div>
      <div className="mt-1 text-[11px] text-gray-600">{runtime?.summary ?? "No runtime status yet."}</div>
      <div className="mt-1 text-[11px] text-gray-500">
        Last sync: {runtime?.lastSyncAt ?? "—"} · Last success: {runtime?.lastSuccessAt ?? "—"}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" className="rounded border bg-white px-2 py-1 text-[11px]" onClick={() => onConnect(provider)}>
          Connect
        </button>
        <button type="button" className="rounded border bg-white px-2 py-1 text-[11px]" onClick={() => onDisconnect(provider)}>
          Disconnect
        </button>
        <button type="button" className="rounded border bg-slate-900 px-2 py-1 text-[11px] font-semibold text-white" onClick={() => onManualSync(provider)}>
          Manual sync
        </button>
      </div>
    </div>
  );
}

