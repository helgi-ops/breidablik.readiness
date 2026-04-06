"use client";

import type { IntegrationConnection, IntegrationProviderDescriptor } from "@/lib/micropulse/integrations";
import DeliveryStatusPill from "./DeliveryStatusPill";

type Props = {
  descriptors: IntegrationProviderDescriptor[];
  connections: IntegrationConnection[];
  onToggleEnabled: (connectionId: string) => void;
};

function findConnection(connections: IntegrationConnection[], provider: IntegrationProviderDescriptor["provider"]): IntegrationConnection | null {
  return connections.find((connection) => connection.provider === provider) ?? null;
}

export default function IntegrationConnectionsPanel({ descriptors, connections, onToggleEnabled }: Props) {
  return (
    <div className="rounded-xl border bg-white p-3 text-xs text-gray-700">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-600">Connections</div>
      <div className="mt-2 space-y-2">
        {descriptors.map((descriptor) => {
          const connection = findConnection(connections, descriptor.provider);
          if (!connection) return null;
          return (
            <div key={descriptor.provider} className="rounded border bg-gray-50 p-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-gray-900">{descriptor.displayName}</div>
                  <div className="text-[11px] text-gray-600">{descriptor.description ?? "External provider connection."}</div>
                </div>
                <div className="flex items-center gap-2">
                  <DeliveryStatusPill status={connection.status} />
                  <button type="button" className="rounded border bg-white px-2 py-1 text-[11px]" onClick={() => onToggleEnabled(connection.id)}>
                    {connection.enabled ? "Disable" : "Enable"}
                  </button>
                </div>
              </div>

              <div className="mt-2 grid gap-1 text-[11px] md:grid-cols-3">
                <div>Last sync: {connection.lastSyncAt ?? "—"}</div>
                <div>Last success: {connection.lastSuccessAt ?? "—"}</div>
                <div className={connection.lastErrorMessage ? "text-red-700" : ""}>Error: {connection.lastErrorMessage ?? "—"}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

