"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PlayerDecisionListItem } from "@/lib/micropulse/coachCommand";
import PlayerDecisionDetails from "./PlayerDecisionDetails";

type Props = {
  player: PlayerDecisionListItem;
  expanded: boolean;
  onToggle: () => void;
};

const STATE_STYLES: Record<PlayerDecisionListItem["state"], string> = {
  GREEN: "border-emerald-200 bg-emerald-50 text-emerald-900",
  YELLOW: "border-amber-200 bg-amber-50 text-amber-900",
  RED: "border-rose-200 bg-rose-50 text-rose-900",
  GRAY: "border-slate-200 bg-slate-100 text-slate-900",
};

export default function PlayerDecisionRow({ player, expanded, onToggle }: Props) {
  const loadText = typeof player.loadAdjustment === "number" ? `${Math.round(player.loadAdjustment * 100)}%` : "—";

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="grid gap-3 px-4 py-4 lg:grid-cols-[1.1fr_0.6fr_0.7fr_0.5fr_1fr_0.6fr_1.4fr_auto] lg:items-center">
        <div>
          <div className="text-sm font-semibold text-slate-900">{player.athleteName}</div>
          <div className="mt-1 text-xs text-slate-500">{player.athleteId}</div>
        </div>
        <div>
          <Badge className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${STATE_STYLES[player.state]}`}>
            {player.state}
          </Badge>
        </div>
        <div className="text-sm font-medium capitalize text-slate-700">{player.sessionMode}</div>
        <div className="text-sm font-semibold tabular-nums text-slate-900">{loadText}</div>
        <div className="flex flex-wrap gap-2">
          {player.topFlags.length ? player.topFlags.map((flag) => (
            <span key={flag} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-700">
              {flag}
            </span>
          )) : <span className="text-sm text-slate-400">—</span>}
        </div>
        <div className="text-sm font-medium capitalize text-slate-700">{player.confidenceBand}</div>
        <div className="text-sm text-slate-700">{player.coachSummary}</div>
        <div className="flex justify-end">
          <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={onToggle} aria-expanded={expanded}>
            {expanded ? "Hide" : "Details"}
          </Button>
        </div>
      </div>
      {expanded ? <PlayerDecisionDetails player={player} /> : null}
    </div>
  );
}
