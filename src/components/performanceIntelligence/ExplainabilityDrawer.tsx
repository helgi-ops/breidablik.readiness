"use client";

import type { PerformanceIntelligenceDecision } from "@/lib/micropulse/performanceIntelligence";
import SignalPackCard from "@/components/coach/SignalPackCard";

type ExplainabilityDrawerProps = {
  open: boolean;
  onClose: () => void;
  playerName?: string | null;
  decision?: PerformanceIntelligenceDecision | null;
  /** When both are set, the Explainable Signal Pack renders for this player. */
  playerId?: string | null;
  teamId?: string | null;
};

function DriverList({ title, lines }: { title: string; lines: string[] }) {
  if (!lines.length) return null;
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{title}</div>
      <ul className="mt-1 list-disc pl-4 text-sm text-slate-700">
        {lines.map((line) => (
          <li key={`${title}-${line}`}>{line}</li>
        ))}
      </ul>
    </div>
  );
}

export default function ExplainabilityDrawer({ open, onClose, playerName, decision, playerId, teamId }: ExplainabilityDrawerProps) {
  if (!open || !decision) return null;

  const riskPrimary = decision.injuryRisk.primaryDrivers.map((d) => d.label);
  const riskSecondary = decision.injuryRisk.secondaryDrivers.map((d) => d.label);
  const perfPrimary = decision.performanceForecast.primaryDrivers.map((d) => d.label);
  const perfSecondary = decision.performanceForecast.secondaryDrivers.map((d) => d.label);
  const loadPrimary = decision.loadForecast.primaryDrivers.map((d) => d.label);
  const loadSecondary = decision.loadForecast.secondaryDrivers.map((d) => d.label);

  return (
    <div className="fixed inset-0 z-50">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full max-w-md border-l border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">Why this decision?</div>
            <div className="text-xs text-slate-500">{playerName ?? "Player"}</div>
          </div>
          <button type="button" onClick={onClose} className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700">
            Close
          </button>
        </div>

        <div className="h-[calc(100%-56px)] overflow-y-auto px-4 py-3 space-y-4">
          {/* Cited, counterfactual "why" signals on this player's own norm — supporting
              associations, never the verdict. Only renders when we know team + player. */}
          {teamId && playerId && <SignalPackCard teamId={teamId} playerId={playerId} />}

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Injury Risk</div>
            <div className="mt-1 text-sm font-semibold text-slate-900">
              Score {decision.injuryRisk.score.toFixed(1)} · {decision.injuryRisk.band}
            </div>
            <div className="mt-1 text-xs text-slate-600">{decision.injuryRisk.summary}</div>
            <div className="mt-2 space-y-2">
              <DriverList title="Top drivers" lines={riskPrimary} />
              <DriverList title="Secondary" lines={riskSecondary} />
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Performance Forecast</div>
            <div className="mt-1 text-sm font-semibold text-slate-900">
              Score {decision.performanceForecast.score.toFixed(1)} · {decision.performanceForecast.band}
            </div>
            <div className="mt-1 text-xs text-slate-600">{decision.performanceForecast.summary}</div>
            <div className="mt-2 space-y-2">
              <DriverList title="Top drivers" lines={perfPrimary} />
              <DriverList title="Secondary" lines={perfSecondary} />
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Load Tolerance</div>
            <div className="mt-1 text-sm font-semibold text-slate-900">
              {decision.loadForecast.band} · Action {decision.loadForecast.recommendedAction}
            </div>
            <div className="mt-1 text-xs text-slate-600">{decision.loadForecast.summary}</div>
            <div className="mt-2 space-y-2">
              <DriverList title="Top drivers" lines={loadPrimary} />
              <DriverList title="Secondary" lines={loadSecondary} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
