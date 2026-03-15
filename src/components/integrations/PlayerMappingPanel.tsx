"use client";

import type { PlayerMappingRecord } from "@/lib/micropulse/integrations";

type Props = {
  mappings: PlayerMappingRecord[];
};

function statusClass(status: PlayerMappingRecord["status"]): string {
  if (status === "MAPPED") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "PENDING") return "border-amber-200 bg-amber-50 text-amber-800";
  if (status === "CONFLICT") return "border-red-200 bg-red-50 text-red-800";
  return "border-gray-200 bg-gray-50 text-gray-700";
}

export default function PlayerMappingPanel({ mappings }: Props) {
  return (
    <div className="rounded-xl border bg-white p-3 text-xs text-gray-700">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-600">Player mappings</div>
      <div className="mt-1 text-[11px] text-gray-600">Mapped and unresolved external athlete identity links. Manual edit/write hooks can be connected later via persistence API.</div>
      {!mappings.length ? <div className="mt-2 rounded border bg-gray-50 p-2 text-[11px] text-gray-600">No mapping records yet.</div> : null}
      <div className="mt-2 space-y-1">
        {mappings.map((mapping) => (
          <div key={mapping.id} className="rounded border bg-gray-50 p-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-[11px] font-medium text-gray-900">{mapping.externalAthleteName ?? mapping.externalAthleteId ?? "Unknown external athlete"}</div>
              <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusClass(mapping.status)}`}>{mapping.status}</span>
            </div>
            <div className="mt-1 text-[11px] text-gray-600">
              {mapping.provider} → {mapping.internalPlayerName ?? "Unmapped"} ({mapping.internalPlayerId || "—"}) · confidence {Math.round(mapping.confidence * 100)}%
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

