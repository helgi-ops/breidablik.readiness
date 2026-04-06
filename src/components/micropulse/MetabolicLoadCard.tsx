"use client";

/**
 * MetabolicLoadCard
 *
 * Compact player-facing card showing today's Metabolic Load Score.
 * Follows the existing card design system (shadcn Card + Tailwind tokens).
 *
 * Usage:
 *   <MetabolicLoadCard
 *     score={72}
 *     band="high"
 *     avgPowerWkg={14.2}
 *     peakPowerWkg={38.1}
 *     hmlDistanceM={1840}
 *     confidence={0.85}
 *     metabolicDataValid={true}
 *   />
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { MetabolicLoadBand } from "@/lib/micropulse/metabolicLoad";

// ─── Types ─────────────────────────────────────────────────────────────────

type MetabolicLoadCardProps = {
  score: number | null;
  band: MetabolicLoadBand | null;
  avgPowerWkg: number | null;
  peakPowerWkg: number | null;
  hmlDistanceM: number | null;
  timeAboveThresholdS: number | null;
  confidence: number | null;
  metabolicDataValid: boolean;
  metabolicPowerGen?: string | null;
  className?: string;
};

// ─── Styling helpers ────────────────────────────────────────────────────────

const BAND_STYLES: Record<MetabolicLoadBand, { bg: string; text: string; badge: string }> = {
  low: {
    bg: "bg-emerald-50 border-emerald-200",
    text: "text-emerald-800",
    badge: "bg-emerald-100 text-emerald-800",
  },
  moderate: {
    bg: "bg-amber-50 border-amber-200",
    text: "text-amber-800",
    badge: "bg-amber-100 text-amber-800",
  },
  high: {
    bg: "bg-orange-50 border-orange-200",
    text: "text-orange-800",
    badge: "bg-orange-100 text-orange-800",
  },
  very_high: {
    bg: "bg-rose-50 border-rose-200",
    text: "text-rose-800",
    badge: "bg-rose-100 text-rose-800",
  },
};

const BAND_LABELS: Record<MetabolicLoadBand, string> = {
  low: "Low",
  moderate: "Moderate",
  high: "High metabolic demand",
  very_high: "Very high metabolic demand",
};

function bandStyle(band: MetabolicLoadBand | null) {
  return band ? BAND_STYLES[band] : { bg: "bg-slate-50 border-slate-200", text: "text-slate-600", badge: "bg-slate-100 text-slate-600" };
}

function bandLabel(band: MetabolicLoadBand | null): string {
  return band ? BAND_LABELS[band] : "No data";
}

function formatPower(value: number | null): string {
  if (value == null) return "—";
  return `${value.toFixed(1)} W/kg`;
}

function formatDistance(value: number | null): string {
  if (value == null) return "—";
  return value >= 1000 ? `${(value / 1000).toFixed(2)} km` : `${Math.round(value)} m`;
}

function formatTime(seconds: number | null): string {
  if (seconds == null) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

function confidenceLabel(confidence: number | null): string {
  if (confidence == null) return "Unknown";
  if (confidence >= 0.7) return "High";
  if (confidence >= 0.4) return "Medium";
  return "Low";
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function MetabolicLoadCard({
  score,
  band,
  avgPowerWkg,
  peakPowerWkg,
  hmlDistanceM,
  timeAboveThresholdS,
  confidence,
  metabolicDataValid,
  metabolicPowerGen,
  className = "",
}: MetabolicLoadCardProps) {
  const styles = bandStyle(band);

  if (!metabolicDataValid) {
    return (
      <Card className={`border-slate-200 shadow-sm ${className}`}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-900">
            Metabolic Load
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <div className="mb-2 text-3xl font-light text-slate-300">—</div>
            <p className="text-xs text-slate-400">No outdoor GNSS metabolic data</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`border shadow-sm ${styles.bg} ${className}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-900">
            Metabolic Load
          </CardTitle>
          {band && (
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${styles.badge}`}>
              {band.replace("_", " ").toUpperCase()}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Main score */}
        <div className="flex items-baseline gap-2">
          <span className={`text-4xl font-bold tabular-nums ${styles.text}`}>
            {score != null ? Math.round(score) : "—"}
          </span>
          <span className="text-sm text-slate-500">/ 100</span>
        </div>

        {/* Helper text */}
        <p className={`text-xs font-medium ${styles.text}`}>{bandLabel(band)}</p>

        {/* Sub-values */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-slate-200/60 pt-3">
          <div>
            <p className="text-xs text-slate-500">Avg power</p>
            <p className="text-sm font-semibold tabular-nums text-slate-800">{formatPower(avgPowerWkg)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Peak power</p>
            <p className="text-sm font-semibold tabular-nums text-slate-800">{formatPower(peakPowerWkg)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">HMLD</p>
            <p className="text-sm font-semibold tabular-nums text-slate-800">{formatDistance(hmlDistanceM)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Time above HML</p>
            <p className="text-sm font-semibold tabular-nums text-slate-800">{formatTime(timeAboveThresholdS)}</p>
          </div>
        </div>

        {/* Confidence + generation footer */}
        <div className="flex items-center justify-between pt-1 text-xs text-slate-400">
          <span>Confidence: {confidenceLabel(confidence)}</span>
          {metabolicPowerGen && (
            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-500">
              {metabolicPowerGen.toUpperCase()}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
