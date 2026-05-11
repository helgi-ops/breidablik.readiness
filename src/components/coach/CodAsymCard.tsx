"use client";

/**
 * CoDAsymmetryCard — L/R Change-of-Direction breakdown by intensity tier.
 *
 * Lives in the Decel Intelligence expanded row. Visualises the same IMA CoD
 * data that powers the L/R Asymmetry tile on the Stride Intelligence card,
 * but split by intensity (Low / Medium / High) — Bishop 2020 shows that
 * high-intensity asymmetry is the injury-relevant signal even when the
 * overall % looks benign.
 *
 * Pulls from /api/coach/player/[id]/cod-asymmetry. Fully read-only;
 * silent-renders an empty placeholder when the player has no CoD data
 * in the last 14 days (rest day or pre-pre-season).
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";

type Flag = "ok" | "watch" | "concern" | "high" | "no_data";

type TierStats = {
  left: number;
  right: number;
  asymPct: number | null;
  flag: Flag;
};

type CodResponse = {
  ok: boolean;
  windowDays?: number;
  sessionsObserved?: number;
  overall?: TierStats;
  tiers?: { low: TierStats; medium: TierStats; high: TierStats };
  thresholds?: { watchPct: number; concernPct: number; highPct: number };
  error?: string;
};

const FLAG_PILL: Record<Flag, string> = {
  ok: "bg-emerald-100 text-emerald-800",
  watch: "bg-amber-100 text-amber-800",
  concern: "bg-orange-100 text-orange-800",
  high: "bg-rose-100 text-rose-800",
  no_data: "bg-slate-100 text-slate-500",
};

const FLAG_LABEL: Record<Flag, string> = {
  ok: "balanced",
  watch: "watch",
  concern: "asymmetry",
  high: "high asymmetry",
  no_data: "—",
};

function fmtPct(p: number | null | undefined): string {
  if (p == null) return "—";
  return `${p.toFixed(1)}%`;
}

/** Two-bar visualisation of L vs R counts. Bar widths are normalised so
 *  the larger side fills the row, the smaller side shows the proportion.
 *  Wider gap = more asymmetry. */
function LrBar({ left, right, side }: { left: number; right: number; side: "L" | "R" }) {
  const max = Math.max(left, right, 1);
  const value = side === "L" ? left : right;
  const widthPct = (value / max) * 100;
  return (
    <div className="flex items-center gap-2">
      <span className="w-3 shrink-0 text-[10px] font-semibold text-slate-500">{side}</span>
      <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div
          className={side === "L" ? "h-full rounded-full bg-sky-400" : "h-full rounded-full bg-violet-400"}
          style={{ width: `${widthPct}%` }}
        />
      </div>
      <span className="w-8 shrink-0 text-right text-[11px] tabular-nums text-slate-700">{value}</span>
    </div>
  );
}

function TierRow({
  label,
  stats,
  emphasis,
}: {
  label: string;
  stats: TierStats;
  emphasis?: boolean;
}) {
  return (
    <div
      className={`rounded-md border ${
        emphasis ? "border-rose-200 bg-rose-50/40" : "border-slate-200 bg-white"
      } p-2.5`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className={`text-[11px] font-semibold uppercase tracking-wide ${
          emphasis ? "text-rose-700" : "text-slate-600"
        }`}>
          {label}{emphasis && " · injury-relevant"}
        </span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${FLAG_PILL[stats.flag]}`}>
          {fmtPct(stats.asymPct)} · {FLAG_LABEL[stats.flag]}
        </span>
      </div>
      <div className="space-y-1.5">
        <LrBar left={stats.left} right={stats.right} side="L" />
        <LrBar left={stats.left} right={stats.right} side="R" />
      </div>
    </div>
  );
}

export default function CoDAsymmetryCard({
  playerId,
  className = "",
}: {
  playerId: string;
  className?: string;
}) {
  const [data, setData] = React.useState<CodResponse | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const sb = getSupabaseClient();
        const { data: sessionData } = await sb.auth.getSession();
        const token = sessionData?.session?.access_token;
        if (!token) return;
        const res = await fetch(`/api/coach/player/${playerId}/cod-asymmetry`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const json = (await res.json()) as CodResponse;
        if (alive) setData(json);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [playerId]);

  if (loading) {
    return (
      <div className={`rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-500 ${className}`}>
        Loading L/R CoD breakdown…
      </div>
    );
  }
  if (!data || !data.ok || !data.overall || !data.tiers) {
    return null;
  }
  const overall = data.overall;
  const tiers = data.tiers;

  // No CoD events in the last 14 days — show an honest "no data" placeholder
  // rather than rendering empty bars.
  if (overall.flag === "no_data") {
    return (
      <div className={`rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs ${className}`}>
        <div className="font-semibold uppercase tracking-wide text-slate-500">
          L/R CoD asymmetry · 14d
        </div>
        <p className="mt-1 text-slate-700">
          No change-of-direction events recorded in the last 14 days. This card lights
          up once Catapult IMA captures CoD data (works indoor and outdoor).
        </p>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border border-slate-200 bg-white p-3 ${className}`}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
            L/R CoD asymmetry · 14 days
          </div>
          <div className="mt-0.5 text-[10.5px] text-slate-500">
            Bishop 2020 thresholds: {data.thresholds?.watchPct}% watch · {data.thresholds?.concernPct}% concern · {data.thresholds?.highPct}% high. {data.sessionsObserved ?? 0} sessions observed.
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${FLAG_PILL[overall.flag]}`}
          title="Overall L/R asymmetry across all intensity tiers"
        >
          {fmtPct(overall.asymPct)}
        </span>
      </div>

      {/* Per-intensity breakdown. High tier visually emphasised — Bishop 2020:
          high-intensity asymmetry is the injury-relevant signal; low-intensity
          asymmetry is often a positional artefact and less actionable. */}
      <div className="space-y-2">
        <TierRow label="High intensity" stats={tiers.high} emphasis />
        <TierRow label="Medium intensity" stats={tiers.medium} />
        <TierRow label="Low intensity" stats={tiers.low} />
      </div>

      <p className="mt-2.5 text-[10.5px] leading-snug text-slate-500">
        Per Bishop 2020, high-intensity L/R asymmetry &gt; 15% is the strongest predictor
        of non-contact lower-limb injury. Low-tier imbalance is often a positional habit
        and less actionable.
      </p>
    </div>
  );
}
