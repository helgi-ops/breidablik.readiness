"use client";

import type { OverrideHistoryItem } from "@/lib/micropulse/adminConfig";

type Props = {
  value: OverrideHistoryItem[];
};

export default function OverrideHistoryPanel({ value }: Props) {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="text-xs font-medium text-zinc-500">Override history</div>
      <div className="text-base font-semibold">Manual override audit trail</div>
      <div className="mt-1 text-sm text-zinc-600">Persistence hook ready: replace in-memory/localStorage source with override audit table/API.</div>

      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wide text-zinc-500">
              <th className="py-2 pr-3">Player</th>
              <th className="py-2 pr-3">Time</th>
              <th className="py-2 pr-3">Engine</th>
              <th className="py-2 pr-3">Final</th>
              <th className="py-2 pr-3">By</th>
              <th className="py-2 pr-3">Reason</th>
            </tr>
          </thead>
          <tbody>
            {value.length === 0 ? (
              <tr>
                <td className="py-3 text-zinc-600" colSpan={6}>
                  No overrides recorded.
                </td>
              </tr>
            ) : (
              value.slice(0, 50).map((item) => (
                <tr key={item.id} className="border-b align-top">
                  <td className="py-2 pr-3">{item.playerName ?? item.playerId ?? "—"}</td>
                  <td className="py-2 pr-3 text-xs text-zinc-600">{new Date(item.timestamp).toLocaleString()}</td>
                  <td className="py-2 pr-3">{item.engineAction}</td>
                  <td className="py-2 pr-3 font-semibold">{item.finalAction}</td>
                  <td className="py-2 pr-3">{item.overriddenBy ?? "—"}</td>
                  <td className="py-2 pr-3 text-zinc-700">{item.reason ?? item.summary ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
