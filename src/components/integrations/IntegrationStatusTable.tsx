"use client";

import type { ImportConflictRecord, IntegrationConnection, IntegrationImportRecord, IntegrationStatusSummary } from "@/lib/micropulse/integrations";
import DeliveryStatusPill from "./DeliveryStatusPill";

type Props = {
  connections: IntegrationConnection[];
  imports: IntegrationImportRecord[];
  conflicts: ImportConflictRecord[];
  summary: IntegrationStatusSummary;
};

export default function IntegrationStatusTable({ connections, imports, conflicts, summary }: Props) {
  return (
    <div className="rounded-xl border bg-white p-3 text-xs text-gray-700">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-600">Status</div>
      <div className="mt-1 text-[11px] text-gray-600">{summary.summaryText}</div>

      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[700px] border-collapse text-left text-[11px]">
          <thead>
            <tr className="border-b text-gray-600">
              <th className="px-2 py-1 font-medium">Provider</th>
              <th className="px-2 py-1 font-medium">Status</th>
              <th className="px-2 py-1 font-medium">Last success</th>
              <th className="px-2 py-1 font-medium">Recent import</th>
              <th className="px-2 py-1 font-medium">Unresolved conflicts</th>
            </tr>
          </thead>
          <tbody>
            {connections.map((connection) => {
              const providerImports = imports.filter((record) => record.provider === connection.provider);
              const latestImport = [...providerImports].sort((a, b) => String(b.completedAt ?? "").localeCompare(String(a.completedAt ?? "")))[0];
              const conflictCount = conflicts.filter((conflict) => conflict.provider === connection.provider).length;
              return (
                <tr key={connection.id} className="border-b last:border-b-0">
                  <td className="px-2 py-1.5 font-medium">{connection.provider}</td>
                  <td className="px-2 py-1.5">
                    <DeliveryStatusPill status={connection.status} />
                  </td>
                  <td className="px-2 py-1.5">{connection.lastSuccessAt ?? "—"}</td>
                  <td className="px-2 py-1.5">{latestImport?.summary ?? "No imports"}</td>
                  <td className="px-2 py-1.5">{conflictCount}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

