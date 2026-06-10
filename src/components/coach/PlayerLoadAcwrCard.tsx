"use client";

/**
 * PlayerLoadAcwrCard
 *
 * Renders the external Player Load 7d:28d Acute:Chronic Workload Ratio
 * (Gabbett 2016, Hulin 2014) for a single player. Mode-agnostic — works for
 * any team that has Catapult `total_player_load` data flowing.
 *
 * The card has 3 states:
 *   1. Sufficient data (>= 8 sessions in 28d window): show ratio + band chip
 *      + acute/chronic means + 28-day sparkline
 *   2. Insufficient data: show empty placeholder explaining minimum sessions
 *   3. Error: simple red banner
 *
 * Bands (Gabbett 2016):
 *   < 0.8   UNDERTRAIN
 *   0.8–1.3 SAFE
 *   1.3–1.5 WATCH
 *   > 1.5   RISK
 */

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";

type AcwrBand = "INSUFFICIENT_DATA" | "UNDERTRAIN" | "SAFE" | "WATCH" | "RISK";

type AcwrPayload = {
  acuteMean: number | null;
  chronicMean: number | null;
  ratio: number | null;
  band: AcwrBand;
  daysObserved: number;
};

type AcwrTrendRow = {
  date: string;
  load: number | null;
};

type AcwrApiResponse = {
  ok: boolean;
  playerId: string;
  date: string;
  payload: AcwrPayload;
  trend: AcwrTrendRow[];
};

function bandClass(b: AcwrBand): string {
  switch (b) {
    case "RISK":
      return "border-red-300 bg-red-50 text-red-800";
    case "WATCH":
      return "border-amber-300 bg-amber-50 text-amber-800";
    case "SAFE":
      return "border-emerald-300 bg-emerald-50 text-emerald-800";
    case "UNDERTRAIN":
      return "border-sky-300 bg-sky-50 text-sky-800";
    default:
      return "border-slate-300 bg-slate-50 text-slate-600";
  }
}

function bandLabel(b: AcwrBand): string {
  switch (b) {
    case "RISK":
      return "risk";
    case "WATCH":
      return "watch";
    case "SAFE":
      return "safe";
    case "UNDERTRAIN":
      return "undertrain";
    default:
      return "needs more data";
  }
}

function fmtRound(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "–";
  return Math.round(n).toLocaleString();
}

function Sparkline({
  values,
  height = 32,
  width = 220,
}: {
  values: Array<number | null>;
  height?: number;
  width?: number;
}) {
  const finite = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (finite.length < 2) {
    return <div className="text-[10px] text-slate-400">— not enough data —</div>;
  }
  const min = 0;
  const max = Math.max(...finite, 1);
  const range = max - min || 1;
  const stepX = width / Math.max(values.length - 1, 1);
  const points: string[] = [];
  values.forEach((v, i) => {
    if (v == null) return;
    const x = i * stepX;
    const y = height - ((v - min) / range) * height;
    points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  });
  return (
    <svg width={width} height={height} className="block text-sky-500">
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        points={points.join(" ")}
      />
    </svg>
  );
}

export default function PlayerLoadAcwrCard({ playerId }: { playerId: string }) {
  const [data, setData] = useState<AcwrApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!playerId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const sb = getSupabaseClient();
        const { data: sess } = await sb.auth.getSession();
        const token = sess.session?.access_token;
        if (!token) {
          setError("Not signed in");
          return;
        }
        const res = await fetch(`/api/coach/player/${playerId}/pl-acwr`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          if (!cancelled) setError(j.error || `HTTP ${res.status}`);
          return;
        }
        const json = (await res.json()) as AcwrApiResponse;
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [playerId]);

  if (loading) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <div className="text-sm text-slate-500">Loading load ratio…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-3">
        <div className="text-sm text-red-700">Player Load ACWR error: {error}</div>
      </div>
    );
  }

  if (!data) return null;

  const p = data.payload;
  const trend = data.trend;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-slate-900">Player Load ACWR</div>
          <div className="text-[11px] text-slate-500">
            Acute (7d) ÷ Chronic (28d) · Gabbett 2016 · {p.daysObserved}/28 sessions observed
          </div>
        </div>
        <span
          className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${bandClass(p.band)}`}
        >
          {bandLabel(p.band)}
        </span>
      </div>

      {p.band === "INSUFFICIENT_DATA" ? (
        <div className="mt-3 text-xs text-slate-600">
          Need at least 8 Catapult sessions in the last 28 days before ACWR is
          reported. Currently {p.daysObserved}.
        </div>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="rounded-md border border-slate-200 bg-white p-2">
              <div className="text-[10px] uppercase tracking-wide text-slate-500">Ratio</div>
              <div className="mt-0.5 text-lg font-semibold text-slate-900">
                {p.ratio != null ? p.ratio.toFixed(2) : "–"}
              </div>
              <div className="text-[10px] text-slate-500">acute ÷ chronic</div>
            </div>
            <div className="rounded-md border border-slate-200 bg-white p-2">
              <div className="text-[10px] uppercase tracking-wide text-slate-500">Acute (7d)</div>
              <div className="mt-0.5 text-lg font-semibold text-slate-900">
                {fmtRound(p.acuteMean)}
              </div>
              <div className="text-[10px] text-slate-500">mean PL/day</div>
            </div>
            <div className="rounded-md border border-slate-200 bg-white p-2">
              <div className="text-[10px] uppercase tracking-wide text-slate-500">Chronic (28d)</div>
              <div className="mt-0.5 text-lg font-semibold text-slate-900">
                {fmtRound(p.chronicMean)}
              </div>
              <div className="text-[10px] text-slate-500">mean PL/day</div>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-3">
            <Sparkline values={trend.map((r) => r.load)} />
            <div className="text-[10px] text-slate-500">
              28-day daily Player Load. Bands: &lt;0.8 undertrain · 0.8–1.3 steady · 1.3–1.5 watch · &gt;1.5 spike. Workload signal, not injury prediction (Impellizzeri 2020).
            </div>
          </div>
        </>
      )}
    </div>
  );
}
