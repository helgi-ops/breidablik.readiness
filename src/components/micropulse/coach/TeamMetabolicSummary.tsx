"use client";

/**
 * TeamMetabolicSummary
 *
 * Coach Command Center panel: shows team-level metabolic load overview.
 * Mirrors the visual style of TeamStatusOverview.tsx.
 *
 * Consumes data from GET /api/coach/player-load/metabolic.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import FatigueTypeChip from "@/components/micropulse/FatigueTypeChip";
import type { MetabolicLoadBand, CompositeFatigueType } from "@/lib/micropulse/metabolicLoad";

// ─── Types (matches API response shape) ───────────────────────────────────

type PlayerMetabolicRow = {
  player_id: string;
  player_name: string;
  metabolic_load_score: number | null;
  metabolic_load_band: MetabolicLoadBand | null;
  fatigue_type: CompositeFatigueType;
  avg_power_w_kg: number | null;
  hml_distance_m: number | null;
  metabolic_data_valid: boolean;
};

type MetabolicSummaryData = {
  summary: {
    avgMetabolicScore: number | null;
    highCount: number;
    validCount: number;
    missingCount: number;
  };
  rows: PlayerMetabolicRow[];
};

type Props = {
  data: MetabolicSummaryData;
  className?: string;
};

// ─── Helpers ────────────────────────────────────────────────────────────────

const BAND_STYLES: Record<MetabolicLoadBand, string> = {
  low: "bg-emerald-100 text-emerald-800",
  moderate: "bg-amber-100 text-amber-800",
  high: "bg-orange-100 text-orange-800",
  very_high: "bg-rose-100 text-rose-800",
};

function formatScore(score: number | null): string {
  if (score == null) return "—";
  return Math.round(score).toString();
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function TeamMetabolicSummary({ data, className = "" }: Props) {
  const { summary, rows } = data;

  // Top 5 by score
  const top5 = [...rows]
    .filter((r) => r.metabolic_load_score != null)
    .sort((a, b) => (b.metabolic_load_score ?? 0) - (a.metabolic_load_score ?? 0))
    .slice(0, 5);

  return (
    <Card className={`border-slate-200 shadow-sm ${className}`}>
      <CardHeader className="pb-4">
        <CardTitle className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-900">
          Team Metabolic Load
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Summary tiles */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">Avg score</div>
            <div className="mt-2 text-3xl font-semibold tabular-nums text-slate-900">
              {summary.avgMetabolicScore != null ? Math.round(summary.avgMetabolicScore) : "—"}
            </div>
            <div className="mt-1 text-sm text-slate-500">/ 100</div>
          </div>
          <div className="rounded-2xl border border-orange-200 bg-orange-50 px-4 py-4">
            <div className="text-xs font-semibold uppercase tracking-widest text-orange-600">High / Very high</div>
            <div className="mt-2 text-3xl font-semibold tabular-nums text-orange-700">{summary.highCount}</div>
            <div className="mt-1 text-sm text-orange-600">athletes elevated</div>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4">
            <div className="text-xs font-semibold uppercase tracking-widest text-emerald-600">Valid data</div>
            <div className="mt-2 text-3xl font-semibold tabular-nums text-emerald-700">{summary.validCount}</div>
            <div className="mt-1 text-sm text-emerald-600">with GNSS data</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">No data</div>
            <div className="mt-2 text-3xl font-semibold tabular-nums text-slate-700">{summary.missingCount}</div>
            <div className="mt-1 text-sm text-slate-500">missing</div>
          </div>
        </div>

        {/* Top 5 table */}
        {top5.length > 0 && (
          <div>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Highest metabolic load today
            </h4>
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {top5.map((row) => (
                <div key={row.player_id} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-slate-800">{row.player_name}</span>
                    <FatigueTypeChip type={row.fatigue_type} size="sm" />
                  </div>
                  <div className="flex items-center gap-2">
                    {row.metabolic_load_band && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${BAND_STYLES[row.metabolic_load_band]}`}
                      >
                        {row.metabolic_load_band.replace("_", " ").toUpperCase()}
                      </span>
                    )}
                    <span className="w-8 text-right text-sm font-bold tabular-nums text-slate-900">
                      {formatScore(row.metabolic_load_score)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {top5.length === 0 && (
          <p className="text-center text-sm text-slate-400">No metabolic load data for today</p>
        )}
      </CardContent>
    </Card>
  );
}
