"use client";

/**
 * StrideIntelligenceCard
 *
 * Surfaces the four IMA-derived stride signals for a single player:
 *   - Cadence (weighted stride rate, Hz) with personal-z drift
 *   - Stride length at HSR (m/stride) — compression flag
 *   - L/R Change-of-Direction asymmetry (Bishop 2020)
 *   - GPS-IMA decoupling (effort vs distance)
 *
 * Mode-agnostic — works indoor and outdoor as long as the Catapult vest
 * recorded IMA Free Running strides for the date.
 */

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";

type StrideDriverFlag = {
  driver:
    | "STRIDE_CADENCE_DROP"
    | "STRIDE_LENGTH_DROP"
    | "COD_LR_ASYMMETRY"
    | "GPS_IMA_DECOUPLING";
  z: number | null;
  value: number | null;
  severity: "watch" | "concern" | "high";
};

type StrideMetrics = {
  totalStrides: number;
  hiVelocityStrides: number;
  highIntensityPlayerLoad: number;
  cadenceWeighted: number | null;
  strideLengthHsr: number | null;
  imaHsrDistanceM?: number | null;
  hiCadenceStrideLengthM?: number | null;
  codLeftTotal: number;
  codRightTotal: number;
  codLrAsymmetryPct: number | null;
  gpsImaDecoupling: number | null;
};

type StrideTrendRow = {
  date: string;
  totalStrides: number | null;
  hiVelocityStrides: number | null;
  cadenceWeighted: number | null;
  strideLengthHsr: number | null;
  codLrAsymmetryPct: number | null;
  gpsImaDecoupling: number | null;
  imaHsrDistanceM?: number | null;
  hiCadenceStrideLengthM?: number | null;
};

type StrideApiResponse = {
  ok: boolean;
  playerId: string;
  date: string;
  today: { metrics: StrideMetrics; drivers: StrideDriverFlag[]; reasons: string[] } | null;
  trend: StrideTrendRow[];
  baselines: Record<string, { mean: number | null; sd: number | null; n: number | null; status: string }>;
};

function severityClass(s: StrideDriverFlag["severity"]): string {
  if (s === "high") return "border-red-300 bg-red-50 text-red-800";
  if (s === "concern") return "border-amber-300 bg-amber-50 text-amber-800";
  return "border-yellow-300 bg-yellow-50 text-yellow-800";
}

function driverLabel(d: StrideDriverFlag["driver"]): string {
  switch (d) {
    case "STRIDE_CADENCE_DROP":
      return "Cadence drop";
    case "STRIDE_LENGTH_DROP":
      return "Stride compression";
    case "COD_LR_ASYMMETRY":
      return "L/R asymmetry";
    case "GPS_IMA_DECOUPLING":
      return "GPS-IMA decoupling";
  }
}

function fmtNum(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return "–";
  return n.toFixed(digits);
}

function Sparkline({
  values,
  height = 28,
  width = 84,
}: {
  values: Array<number | null>;
  height?: number;
  width?: number;
}) {
  const finite = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (finite.length < 2) {
    return <div className="text-[10px] text-slate-400">— not enough data —</div>;
  }
  const min = Math.min(...finite);
  const max = Math.max(...finite);
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
    <svg width={width} height={height} className="block">
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        points={points.join(" ")}
        className="text-sky-500"
      />
    </svg>
  );
}

function InfoIcon({ tip }: { tip: string }) {
  return (
    <span
      title={tip}
      aria-label={tip}
      className="inline-flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full border border-slate-400 text-[9px] font-bold text-slate-500 hover:bg-slate-200 hover:text-slate-700"
    >
      i
    </span>
  );
}

function MetricTile({
  title,
  value,
  unit,
  baselineMean,
  trendValues,
  helper,
  tooltip,
  digits = 2,
}: {
  title: string;
  value: number | null;
  unit?: string;
  baselineMean?: number | null;
  trendValues: Array<number | null>;
  helper?: string;
  tooltip?: string;
  digits?: number;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-slate-500">
        <span>{title}</span>
        {tooltip ? <InfoIcon tip={tooltip} /> : null}
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-lg font-semibold text-slate-900">{fmtNum(value, digits)}</span>
        {unit && <span className="text-xs text-slate-500">{unit}</span>}
      </div>
      {baselineMean != null && (
        <div className="text-[10px] text-slate-400">
          baseline {fmtNum(baselineMean, digits)}
        </div>
      )}
      <div className="mt-1.5">
        <Sparkline values={trendValues} />
      </div>
      {helper && <div className="mt-1 text-[10px] text-slate-500">{helper}</div>}
    </div>
  );
}

// ── Coach-friendly explanations for each stride metric ──
// Single source of truth so REST-DAY and SESSION branches stay in sync.
const STRIDE_TIPS = {
  cadence:
    "Stride frequency in Hz (strides/sec), volume-weighted across all velocity bands. Higher = quicker turnover. A drop of ≥0.5 Hz vs baseline signals neuromuscular fatigue (Buchheit 2018) — usually before HSR distance drops.",
  strideLength:
    "Average stride length at high-speed running (>15 km/h), in metres/stride. Compression of ≥0.10 m vs baseline suggests posterior-chain fatigue or reduced power output — hamstring caution flag.",
  asymmetry:
    "Side-to-side imbalance in high-intensity change-of-direction efforts: |Left − Right| ÷ average %. Bishop 2020 thresholds: <9% normal · 9–15% watch · 15–18% concern · >18% high-tier (≈3× ACL / hamstring injury risk).",
  decoupling:
    "Gap between high-speed running distance and high-load stride detection (percentage points). Large gaps (>15 %pt) mean the player is producing effort that doesn't translate into distance — mechanical inefficiency or fatigue under load.",
} as const;

export default function StrideIntelligenceCard({ playerId, date: dateProp }: { playerId: string; date?: string }) {
  const [data, setData] = useState<StrideApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Empty string = today. A coach can pick a historical session date.
  const [selectedDate, setSelectedDate] = useState<string>(dateProp ?? "");

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
        const dateQs = selectedDate ? `&date=${selectedDate}` : "";
        const res = await fetch(`/api/coach/player/${playerId}/stride-intel?days=14${dateQs}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          if (!cancelled) setError(j.error || `HTTP ${res.status}`);
          return;
        }
        const json = (await res.json()) as StrideApiResponse;
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
  }, [playerId, selectedDate]);

  if (loading) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <div className="text-sm text-slate-500">Loading stride intelligence…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-3">
        <div className="text-sm text-red-700">Stride intelligence error: {error}</div>
      </div>
    );
  }

  // Common pulled-out state so we can use it on both fully-loaded and rest-day branches.
  const trend = data?.trend ?? [];
  const cadenceBaseline = data?.baselines.stride_cadence_weighted ?? null;
  const strideLengthBaseline = data?.baselines.stride_length_hsr_m ?? null;
  const decouplingBaseline = data?.baselines.stride_gps_ima_decoupling ?? null;
  const asymBaseline = data?.baselines.stride_cod_lr_asym_pct ?? null;

  // Find latest non-empty session in trend (most recent day with strides recorded)
  const latestSession = (() => {
    for (let i = trend.length - 1; i >= 0; i -= 1) {
      const r = trend[i];
      if (r.totalStrides && r.totalStrides > 0) return r;
    }
    return null;
  })();

  // REST-DAY BRANCH — no Catapult row for today, but we may still have trend + baselines.
  // Show baseline values + 14-day sparkline so the coach has context on rest days.
  if (!data?.today) {
    const hasAnyTrendData = trend.some((r) => r.totalStrides && r.totalStrides > 0);

    return (
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-slate-900">Stride Intelligence</div>
            <div className="text-[11px] text-slate-500">
              IMA Free Running · {data?.date ?? "today"} ·{" "}
              {latestSession
                ? `last session ${latestSession.date}`
                : "awaiting first session"}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              title="Pick a session date (blank = today)"
              className="rounded-md border border-slate-300 px-1.5 py-0.5 text-[11px] text-slate-600"
            />
            <span className="rounded-md border border-slate-300 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600">
              rest day
            </span>
          </div>
        </div>

        {!hasAnyTrendData ? (
          <div className="mt-3 text-xs text-slate-600">
            No IMA Free Running sessions recorded in the last 14 days. This card
            lights up once Catapult Vector S7+ stride detection is captured
            (works indoor and outdoor).
          </div>
        ) : (
          <>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <MetricTile
                title="Cadence"
                value={cadenceBaseline?.mean ?? null}
                unit="Hz"
                baselineMean={cadenceBaseline?.mean}
                trendValues={trend.map((r) => r.cadenceWeighted)}
                helper="14-day baseline · vol-weighted"
                tooltip={STRIDE_TIPS.cadence}
              />
              <MetricTile
                title="Stride length (HSR)"
                value={strideLengthBaseline?.mean ?? null}
                unit="m/stride"
                baselineMean={strideLengthBaseline?.mean}
                trendValues={trend.map((r) => r.strideLengthHsr)}
                helper="14-day baseline · HSR/strides"
                tooltip={STRIDE_TIPS.strideLength}
              />
              <MetricTile
                title="L/R asymmetry"
                value={asymBaseline?.mean ?? null}
                unit="%"
                baselineMean={asymBaseline?.mean}
                trendValues={trend.map((r) => r.codLrAsymmetryPct)}
                helper="14-day baseline · |L−R|/avg"
                tooltip={STRIDE_TIPS.asymmetry}
              />
              <MetricTile
                title="GPS-IMA decoupling"
                value={decouplingBaseline?.mean != null ? decouplingBaseline.mean * 100 : null}
                unit="%pt"
                baselineMean={decouplingBaseline?.mean != null ? decouplingBaseline.mean * 100 : null}
                trendValues={trend.map((r) =>
                  r.gpsImaDecoupling != null ? r.gpsImaDecoupling * 100 : null,
                )}
                helper="14-day baseline · HSR−HiLoad"
                tooltip={STRIDE_TIPS.decoupling}
              />
            </div>

            <div className="mt-2 text-[10px] text-slate-500">
              No session today — values shown are personal baselines from the last
              28 days. Card refreshes when next training is uploaded.
            </div>
          </>
        )}
      </div>
    );
  }

  const t = data.today;
  const m = t.metrics;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-slate-900">Stride Intelligence</div>
          <div className="text-[11px] text-slate-500">
            IMA Free Running · {data.date} · {m.totalStrides.toLocaleString()} strides
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            title="Pick a session date (blank = today)"
            className="rounded-md border border-slate-300 px-1.5 py-0.5 text-[11px] text-slate-600"
          />
          {t.drivers.length > 0 ? (
            <span className="rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
              {t.drivers.length} signal{t.drivers.length === 1 ? "" : "s"}
            </span>
          ) : (
            <span className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
              normal
            </span>
          )}
        </div>
      </div>

      {/* Driver chips */}
      {t.drivers.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {t.drivers.map((d) => (
            <span
              key={d.driver}
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium ${severityClass(d.severity)}`}
            >
              {driverLabel(d.driver)}
              {d.z != null && <span className="opacity-70">{d.z >= 0 ? "+" : ""}{d.z.toFixed(1)}σ</span>}
              {d.driver === "COD_LR_ASYMMETRY" && d.value != null && (
                <span className="opacity-70">{d.value.toFixed(0)}%</span>
              )}
            </span>
          ))}
        </div>
      )}

      {/* Reason text */}
      {t.reasons.length > 0 && (
        <div className="mt-2 space-y-0.5">
          {t.reasons.map((r, i) => (
            <div key={i} className="text-[11px] leading-tight text-slate-700">
              · {r}
            </div>
          ))}
        </div>
      )}

      {/* Metric tiles */}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MetricTile
          title="Cadence"
          value={m.cadenceWeighted}
          unit="Hz"
          baselineMean={cadenceBaseline?.mean}
          trendValues={trend.map((r) => r.cadenceWeighted)}
          helper="vol-weighted across bands"
          tooltip={STRIDE_TIPS.cadence}
        />
        <MetricTile
          title={m.hiCadenceStrideLengthM != null ? "Stride length (high-cadence)" : "Avg stride length"}
          value={m.hiCadenceStrideLengthM ?? m.strideLengthHsr}
          unit="m/stride"
          baselineMean={strideLengthBaseline?.mean}
          trendValues={trend.map((r) => r.strideLengthHsr)}
          helper={
            m.hiCadenceStrideLengthM != null
              ? "IMA band 5-8 distance ÷ band 5-8 strides"
              : "Total distance ÷ total strides (session avg)"
          }
          tooltip={STRIDE_TIPS.strideLength}
        />
        <MetricTile
          title="L/R asymmetry"
          value={m.codLrAsymmetryPct}
          unit="%"
          trendValues={trend.map((r) => r.codLrAsymmetryPct)}
          helper={
            m.codLrAsymmetryPct == null
              ? "needs ≥5 CoD events"
              : `L${m.codLeftTotal} · R${m.codRightTotal}`
          }
          tooltip={STRIDE_TIPS.asymmetry}
        />
        <MetricTile
          title="GPS-IMA decoupling"
          value={m.gpsImaDecoupling != null ? m.gpsImaDecoupling * 100 : null}
          unit="%pt"
          baselineMean={decouplingBaseline?.mean != null ? decouplingBaseline.mean * 100 : null}
          trendValues={trend.map((r) => (r.gpsImaDecoupling != null ? r.gpsImaDecoupling * 100 : null))}
          helper="HSR share − HiLoad share"
          tooltip={STRIDE_TIPS.decoupling}
        />
        {m.imaHsrDistanceM != null && (
          <MetricTile
            title="High-speed running (IMA)"
            value={m.imaHsrDistanceM}
            unit="m"
            digits={0}
            trendValues={trend.map((r) => r.imaHsrDistanceM ?? null)}
            helper="IMA Free Running band 5-8 total distance"
          />
        )}
      </div>

      <div className="mt-2 text-[10px] text-slate-500">
        Bishop 2020 thresholds: 9% watch · 15% concern · 18% high. Personal-z thresholds: −1σ watch · −1.5σ concern · −2σ high.
      </div>
    </div>
  );
}
