"use client";

/**
 * Inline-SVG charts for the player game report. Hand-rolled (no chart lib, same
 * convention as LineSpark/QuadrantChart) so they render crisply on screen AND
 * survive print-to-PDF as vectors. All value labels are drawn into the SVG
 * (not hover-only) so nothing is lost when printed.
 */

import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { FormResult, FormDir } from "@/lib/micropulse/playerGameReport";

export type RadarMetric = { label: string; percentile: number; valueLabel: string };
export type TrendBar = { label: string; value: number };

const INDIGO = "#4f46e5";

/**
 * Click-to-enlarge wrapper. Shows `children` inline (with a hover ⤢ hint) and,
 * on click, opens a centered modal rendering `large` — typically the same chart
 * at a bigger maxHeight. Reused by the coach + player game reports.
 */
export function ChartZoom({ title, children, large }: { title?: string; children: ReactNode; large: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="group relative block w-full cursor-zoom-in rounded-md transition hover:bg-slate-50/60"
        aria-label={title ? `Enlarge ${title}` : "Enlarge chart"}>
        {children}
        <span className="pointer-events-none absolute right-1.5 top-1.5 rounded bg-white/85 px-1 py-0.5 text-[11px] leading-none text-slate-400 opacity-0 shadow-sm transition group-hover:opacity-100">⤢</span>
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" onClick={() => setOpen(false)} role="dialog" aria-modal="true">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 flex items-center justify-between gap-3">
              {title ? <div className="text-sm font-semibold text-slate-900">{title}</div> : <span />}
              <button type="button" onClick={() => setOpen(false)} aria-label="Close"
                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">✕</button>
            </div>
            {large}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

/**
 * Form summary: the recent window vs the season baseline, with an overall
 * verdict and per-metric up/flat/down chips. Plain-language, explainability-first
 * (a one-sentence read on top). Shared by the coach + player game reports.
 */
export function FormSummary({ form, metricLabel, isIS }: { form: FormResult; metricLabel: (key: string) => string; isIS: boolean }) {
  const tone: Record<FormDir, string> = {
    up: "bg-emerald-100 text-emerald-700 border-emerald-200",
    flat: "bg-slate-100 text-slate-600 border-slate-200",
    down: "bg-amber-100 text-amber-700 border-amber-200",
  };
  const icon: Record<FormDir, string> = { up: "↗", flat: "→", down: "↘" };
  const verdictWord: Record<FormDir, string> = isIS
    ? { up: "Á uppleið", flat: "Stöðugt", down: "Niðurleið" }
    : { up: "Trending up", flat: "Steady", down: "Trending down" };
  const chipDelta = (m: { deltaPct: number }) => `${m.deltaPct > 0 ? "+" : ""}${Math.round(m.deltaPct * 100)}%`;

  // One-sentence read, naming the metrics driving the verdict.
  const movers = form.metrics.filter((m) => m.dir === (form.verdict === "down" ? "down" : "up")).map((m) => metricLabel(m.key));
  const moverList = movers.slice(0, 3).join(", ");
  const sentence = (() => {
    const n = form.windowN;
    if (form.verdict === "up") return isIS ? `Síðustu ${n} leikir yfir tímabils-meðaltali${moverList ? ` í ${moverList}` : ""}.` : `Last ${n} matches above his season average${moverList ? ` in ${moverList}` : ""}.`;
    if (form.verdict === "down") return isIS ? `Síðustu ${n} leikir undir tímabils-meðaltali${moverList ? ` í ${moverList}` : ""}.` : `Last ${n} matches below his season average${moverList ? ` in ${moverList}` : ""}.`;
    return isIS ? `Síðustu ${n} leikir í takt við tímabils-meðaltal.` : `Last ${n} matches in line with his season average.`;
  })();

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">{isIS ? "Form" : "Form"}</span>
        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tone[form.verdict]}`}>
          {icon[form.verdict]} {verdictWord[form.verdict]}
        </span>
        <span className="text-[10px] text-slate-400">{isIS ? `síðustu ${form.windowN} af ${form.totalGps} leikjum vs tímabil` : `last ${form.windowN} of ${form.totalGps} matches vs season`}</span>
      </div>
      <p className="mb-2 text-[13px] leading-relaxed text-slate-700">{sentence}</p>
      <div className="flex flex-wrap gap-1.5">
        {form.metrics.map((m) => (
          <span key={m.key} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${tone[m.dir]}`}>
            <span className="font-medium">{metricLabel(m.key)}</span>
            <span className="tabular-nums">{icon[m.dir]} {chipDelta(m)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Percentile radar: each axis is the player's squad percentile (0-100) for one
 * metric. The shaded ring at 50 marks the squad median, so spikes outward =
 * strengths, dips inward = relative weaknesses.
 */
export function ProfileRadar({ metrics, maxHeight = 300 }: { metrics: RadarMetric[]; maxHeight?: number }) {
  const N = metrics.length;
  if (N < 3) return null;
  const W = 340, H = 300;
  const cx = W / 2, cy = H / 2 + 4, R = 100;
  const angle = (i: number) => (-90 + (i * 360) / N) * (Math.PI / 180);
  const pt = (i: number, rPct: number) => {
    const r = (Math.max(0, Math.min(100, rPct)) / 100) * R;
    return [cx + r * Math.cos(angle(i)), cy + r * Math.sin(angle(i))] as const;
  };
  const rings = [25, 50, 75, 100];
  const playerPoly = metrics.map((m, i) => pt(i, m.percentile).join(",")).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight }}>
      {/* concentric rings */}
      {rings.map((ring) => {
        const poly = metrics.map((_, i) => pt(i, ring).join(",")).join(" ");
        const isMedian = ring === 50;
        return (
          <polygon key={ring} points={poly} fill={isMedian ? "#efece2" : "none"}
            stroke={isMedian ? "#d5cfbe" : "#e6e1d4"} strokeWidth={isMedian ? 1.25 : 1} />
        );
      })}
      {/* spokes + axis labels */}
      {metrics.map((m, i) => {
        const [x, y] = pt(i, 100);
        const [lx, ly] = pt(i, 122);
        const anchor = Math.abs(lx - cx) < 6 ? "middle" : lx > cx ? "start" : "end";
        return (
          <g key={m.label}>
            <line x1={cx} y1={cy} x2={x} y2={y} stroke="#e6e1d4" strokeWidth={1} />
            <text x={lx} y={ly - 3} fontSize={9} fontWeight={600} fill="#6d6858" textAnchor={anchor}>{m.label}</text>
            <text x={lx} y={ly + 7} fontSize={8} fill="#a9a493" textAnchor={anchor}>{m.valueLabel}</text>
          </g>
        );
      })}
      {/* player polygon */}
      <polygon points={playerPoly} fill={INDIGO} fillOpacity={0.18} stroke={INDIGO} strokeWidth={2} />
      {metrics.map((m, i) => {
        const [x, y] = pt(i, m.percentile);
        return <circle key={m.label} cx={x} cy={y} r={2.6} fill={INDIGO} />;
      })}
      {/* legend */}
      <g>
        <rect x={cx - 70} y={H - 14} width={9} height={9} fill={INDIGO} fillOpacity={0.18} stroke={INDIGO} />
        <text x={cx - 58} y={H - 6} fontSize={9} fill="#6d6858">Player percentile</text>
        <line x1={cx + 36} y1={H - 9} x2={cx + 50} y2={H - 9} stroke="#d5cfbe" strokeWidth={1.25} />
        <text x={cx + 54} y={H - 6} fontSize={9} fill="#6d6858">squad median</text>
      </g>
    </svg>
  );
}

/**
 * Overlay radar — compares 2+ fingerprints as polygons on shared axes. Each
 * axis is normalised to the max across the series (so the bigger value sits near
 * the edge), which shows the SHAPE difference between two matches. Legend is
 * rendered by the caller. Used by Match Movement (coach + player).
 */
export function CompareRadar({ axes, series, maxHeight = 300 }: {
  axes: string[];
  series: Array<{ label: string; values: Array<number | null>; color: string }>;
  maxHeight?: number;
}) {
  const N = axes.length;
  if (N < 3 || series.length === 0) return null;
  const W = 340, H = 300, cx = W / 2, cy = H / 2 + 4, R = 100;
  const angle = (i: number) => (-90 + (i * 360) / N) * (Math.PI / 180);
  const axisMax = axes.map((_, i) => Math.max(1, ...series.map((s) => s.values[i] ?? 0)) * 1.1);
  const pt = (i: number, v: number | null) => {
    const r = v == null ? 0 : (Math.max(0, v) / axisMax[i]) * R;
    return [cx + r * Math.cos(angle(i)), cy + r * Math.sin(angle(i))] as const;
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight }}>
      {[25, 50, 75, 100].map((ring) => {
        const poly = axes.map((_, i) => { const r = (ring / 100) * R; return `${cx + r * Math.cos(angle(i))},${cy + r * Math.sin(angle(i))}`; }).join(" ");
        return <polygon key={ring} points={poly} fill="none" stroke="#e6e1d4" strokeWidth={1} />;
      })}
      {axes.map((_, i) => { const r = R; return <line key={i} x1={cx} y1={cy} x2={cx + r * Math.cos(angle(i))} y2={cy + r * Math.sin(angle(i))} stroke="#e6e1d4" strokeWidth={1} />; })}
      {series.map((s) => (
        <polygon key={s.label} points={axes.map((_, i) => pt(i, s.values[i]).join(",")).join(" ")} fill={s.color} fillOpacity={0.14} stroke={s.color} strokeWidth={2} />
      ))}
      {axes.map((label, i) => {
        const r = R * 1.16;
        return <text key={i} x={cx + r * Math.cos(angle(i))} y={cy + r * Math.sin(angle(i))} fontSize={8.5} fill="#8b8676" textAnchor="middle" dominantBaseline="middle">{label}</text>;
      })}
    </svg>
  );
}

/**
 * Per-match vertical bars with a dashed season-average line. Value labels sit
 * above each bar; short opponent labels below. Bars below average are muted.
 */
export function MatchTrendBars({
  title, unit, bars, avg, color = INDIGO, maxHeight,
}: { title: string; unit: string; bars: TrendBar[]; avg: number | null; color?: string; maxHeight?: number }) {
  if (!bars.length) return null;
  const W = 340, H = 168;
  const ml = 6, mr = 6, mt = 20, mb = 30;
  const plotW = W - ml - mr, plotH = H - mt - mb;
  const maxV = Math.max(avg ?? 0, ...bars.map((b) => b.value)) * 1.12 || 1;
  const n = bars.length;
  const gap = 4;
  const bw = Math.max(6, (plotW - gap * (n - 1)) / n);
  const xFor = (i: number) => ml + i * (bw + gap);
  const yFor = (v: number) => mt + plotH - (v / maxV) * plotH;
  const avgY = avg != null ? yFor(avg) : null;

  return (
    <div>
      <div className="mb-0.5 flex items-baseline justify-between">
        <span className="text-[11px] font-semibold text-slate-700">{title}</span>
        {avg != null && <span className="text-[10px] text-slate-400">avg {Math.round(avg).toLocaleString()} {unit}</span>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: maxHeight ?? H }}>
        {bars.map((b, i) => {
          const x = xFor(i);
          const y = yFor(b.value);
          const below = avg != null && b.value < avg;
          return (
            <g key={i}>
              <rect x={x} y={y} width={bw} height={mt + plotH - y} rx={1.5}
                fill={color} fillOpacity={below ? 0.32 : 0.85} />
              <text x={x + bw / 2} y={y - 3} fontSize={8} fontWeight={600} fill="#565044" textAnchor="middle">
                {Math.round(b.value).toLocaleString()}
              </text>
              <text x={x + bw / 2} y={H - 18} fontSize={7.5} fill="#a9a493" textAnchor="middle">{b.label}</text>
            </g>
          );
        })}
        {avgY != null && (
          <line x1={ml} x2={W - mr} y1={avgY} y2={avgY} stroke="#221f18" strokeWidth={1} strokeDasharray="3 3" opacity={0.55} />
        )}
      </svg>
    </div>
  );
}
