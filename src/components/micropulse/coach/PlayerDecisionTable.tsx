"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import type { PlayerDecisionListItem } from "@/lib/micropulse/coachCommand";
import PlayerDecisionRow from "./PlayerDecisionRow";

type Props = {
  players: PlayerDecisionListItem[];
};

export default function PlayerDecisionTable({ players }: Props) {
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<"ALL" | PlayerDecisionListItem["state"]>("ALL");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return players.filter((player) => {
      const searchOk =
        !search.trim() ||
        player.athleteName.toLowerCase().includes(search.trim().toLowerCase()) ||
        player.coachSummary.toLowerCase().includes(search.trim().toLowerCase());
      const stateOk = stateFilter === "ALL" || player.state === stateFilter;
      return searchOk && stateOk;
    });
  }, [players, search, stateFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-900">Player Decisions</div>
          <div className="mt-1 text-sm text-slate-500">Sorted by operational priority.</div>
        </div>
        <div className="flex flex-col gap-2 md:w-[420px] md:flex-row">
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search athlete or summary" />
          <div className="flex overflow-hidden rounded-full border border-slate-200 bg-white">
            {(["ALL", "RED", "YELLOW", "GRAY", "GREEN"] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={`px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] ${stateFilter === value ? "bg-slate-900 text-white" : "text-slate-600"}`}
                onClick={() => setStateFilter(value)}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="hidden grid-cols-[1.1fr_0.6fr_0.7fr_0.5fr_1fr_0.6fr_1.4fr_auto] gap-3 px-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 lg:grid">
        <div>Player</div>
        <div>State</div>
        <div>Session</div>
        <div>Load Adj.</div>
        <div>Flags</div>
        <div>Confidence</div>
        <div>Summary</div>
        <div className="text-right">Action</div>
      </div>
      <div className="space-y-3">
        {filtered.length ? (
          filtered.map((player) => (
            <PlayerDecisionRow
              key={player.athleteId}
              player={player}
              expanded={expandedId === player.athleteId}
              onToggle={() => setExpandedId((current) => (current === player.athleteId ? null : player.athleteId))}
            />
          ))
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-600">
            No player decisions available for the current filter.
          </div>
        )}
      </div>
    </div>
  );
}
