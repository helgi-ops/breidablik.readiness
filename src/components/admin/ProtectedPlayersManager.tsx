"use client";

import { useMemo, useState } from "react";
import type { ProtectedPlayerConfig } from "@/lib/micropulse/adminConfig";
import { validateProtectedPlayerConfig } from "@/lib/micropulse/adminConfig";

type PlayerOption = { id: string; name: string };

type Props = {
  players: PlayerOption[];
  value: ProtectedPlayerConfig[];
  onChange: (next: ProtectedPlayerConfig[]) => void;
};

export default function ProtectedPlayersManager({ players, value, onChange }: Props) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"PROTECTED" | "UNPROTECTED" | "ALL">("PROTECTED");
  const [expandedPlayerId, setExpandedPlayerId] = useState<string | null>(null);

  const byId = useMemo(() => new Map(value.map((p) => [p.playerId, p])), [value]);
  const protectedCount = useMemo(() => value.filter((p) => p.enabled).length, [value]);

  const filteredPlayers = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matchesText = (name: string) => (!q ? true : name.toLowerCase().includes(q));
    const matchesFilter = (playerId: string) => {
      const enabled = Boolean(byId.get(playerId)?.enabled);
      if (filter === "ALL") return true;
      if (filter === "PROTECTED") return enabled;
      return !enabled;
    };
    return players.filter((p) => matchesText(p.name) && matchesFilter(p.id));
  }, [players, query, byId, filter]);

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="text-xs font-medium text-zinc-500">Protected Players</div>
      <div className="text-base font-semibold">Protected player policy</div>
      <div className="mt-1 text-sm text-zinc-600">Manage protected athlete status, constraints, and review requirements.</div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full border bg-zinc-50 px-2.5 py-1 text-zinc-700">Total players: {players.length}</span>
        <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-blue-700">Protected: {protectedCount}</span>
        <span className="rounded-full border bg-zinc-50 px-2.5 py-1 text-zinc-700">Showing: {filteredPlayers.length}</span>
      </div>

      <input
        className="mt-3 w-full rounded border px-3 py-2 text-sm"
        placeholder="Search player"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="mt-2 flex flex-wrap gap-2">
        {[
          { key: "PROTECTED", label: "Protected" },
          { key: "UNPROTECTED", label: "Unprotected" },
          { key: "ALL", label: "All" },
        ].map((item) => (
          <button
            key={item.key}
            type="button"
            className={`rounded-md border px-2.5 py-1 text-xs ${filter === item.key ? "border-zinc-900 bg-zinc-900 text-white" : "bg-white text-zinc-700"}`}
            onClick={() => setFilter(item.key as "PROTECTED" | "UNPROTECTED" | "ALL")}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="mt-3 max-h-[520px] space-y-2 overflow-y-auto pr-1">
        {filteredPlayers.map((player) => {
          const existing = byId.get(player.id) ?? {
            playerId: player.id,
            playerName: player.name,
            enabled: false,
            tags: [],
            exposureBias: "NONE",
            reviewRequiredForFull: true,
            maxActionAllowed: null,
          };

          const validation = validateProtectedPlayerConfig(existing);
          const expanded = expandedPlayerId === player.id;

          return (
            <div key={player.id} className="rounded-lg border px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">{player.name}</div>
                  <div className="text-xs text-zinc-500">{existing.enabled ? "Protected" : "Not protected"}</div>
                </div>
                <div className="flex items-center gap-2">
                  <label className="inline-flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={existing.enabled}
                      onChange={(e) => {
                        const next = [...value.filter((row) => row.playerId !== player.id), { ...existing, enabled: e.target.checked }];
                        onChange(next);
                        if (!e.target.checked && expandedPlayerId === player.id) setExpandedPlayerId(null);
                      }}
                    />
                    Protected
                  </label>
                  <button
                    type="button"
                    className="rounded border bg-white px-2 py-1 text-[11px]"
                    onClick={() => setExpandedPlayerId(expanded ? null : player.id)}
                  >
                    {expanded ? "Hide details" : "Edit"}
                  </button>
                </div>
              </div>

              {existing.enabled && expanded ? (
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <label className="text-xs text-zinc-600">
                    Tags
                    <input
                      className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
                      placeholder="protected,r2p"
                      value={existing.tags.join(",")}
                      onChange={(e) => {
                        const tags = e.target.value
                          .split(",")
                          .map((v) => v.trim())
                          .filter(Boolean);
                        onChange([...value.filter((row) => row.playerId !== player.id), { ...existing, tags }]);
                      }}
                    />
                  </label>

                  <label className="text-xs text-zinc-600">
                    Exposure bias
                    <select
                      className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
                      value={existing.exposureBias ?? "NONE"}
                      onChange={(e) =>
                        onChange([
                          ...value.filter((row) => row.playerId !== player.id),
                          { ...existing, exposureBias: e.target.value as ProtectedPlayerConfig["exposureBias"] },
                        ])
                      }
                    >
                      <option value="NONE">None</option>
                      <option value="LIGHT">Light</option>
                      <option value="MODERATE">Moderate</option>
                      <option value="HIGH">High</option>
                    </select>
                  </label>

                  <label className="text-xs text-zinc-600">
                    Max action
                    <select
                      className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
                      value={existing.maxActionAllowed ?? ""}
                      onChange={(e) =>
                        onChange([
                          ...value.filter((row) => row.playerId !== player.id),
                          {
                            ...existing,
                            maxActionAllowed: e.target.value ? (e.target.value as ProtectedPlayerConfig["maxActionAllowed"]) : null,
                          },
                        ])
                      }
                    >
                      <option value="">No cap</option>
                      <option value="FULL">FULL</option>
                      <option value="MODIFIED">MODIFIED</option>
                      <option value="RECOVERY">RECOVERY</option>
                      <option value="HOLD">HOLD</option>
                    </select>
                  </label>

                  <label className="inline-flex items-center gap-2 text-xs text-zinc-700">
                    <input
                      type="checkbox"
                      checked={existing.reviewRequiredForFull ?? true}
                      onChange={(e) =>
                        onChange([
                          ...value.filter((row) => row.playerId !== player.id),
                          { ...existing, reviewRequiredForFull: e.target.checked },
                        ])
                      }
                    />
                    Review required for FULL
                  </label>
                </div>
              ) : null}

              {existing.enabled && !validation.valid ? <div className="mt-2 text-xs text-red-600">{Object.values(validation.errors)[0]}</div> : null}
            </div>
          );
        })}
        {!filteredPlayers.length ? <div className="rounded border bg-zinc-50 px-3 py-2 text-sm text-zinc-600">No players match the current filter.</div> : null}
      </div>
    </div>
  );
}
