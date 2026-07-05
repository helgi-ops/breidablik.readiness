"use client";

/**
 * LineSpark — minimal inline-SVG line + markers chart. No recharts dep so
 * the PT-client PWA stays light on mobile.
 *
 * Props:
 *   data     — [{ x: string, y: number, marker?: "pr" | null }]
 *   height   — px
 *   yLabel   — short suffix shown on tooltip values
 */

import { useMemo, useState } from "react";

export type Point = { x: string; y: number; marker?: "pr" | null; extra?: string };

interface Props {
  data: Point[];
  height?: number;
  yLabel?: string;
  /** Stroke colour for the line. */
  stroke?: string;
  /** Background. */
  bg?: string;
}

export default function LineSpark({ data, height = 160, yLabel = "", stroke = "#221f18", bg = "#ffffff" }: Props) {
  const [hover, setHover] = useState<Point | null>(null);

  const dims = useMemo(() => {
    const n = data.length;
    if (n === 0) return null;
    const ys = data.map((d) => d.y);
    const yMin = Math.min(...ys);
    const yMax = Math.max(...ys);
    const pad = Math.max(0.5, (yMax - yMin) * 0.1);
    const lo = yMin - pad;
    const hi = yMax + pad;
    const span = hi - lo || 1;
    const W = 320;          // intrinsic SVG width — scales via viewBox
    const H = height;
    const ml = 28, mr = 8, mt = 8, mb = 22;
    const plotW = W - ml - mr;
    const plotH = H - mt - mb;
    const xFor = (i: number) => ml + (n === 1 ? plotW / 2 : (i * plotW) / (n - 1));
    const yFor = (v: number) => mt + plotH - ((v - lo) / span) * plotH;
    return { W, H, ml, mr, mt, mb, plotW, plotH, xFor, yFor, lo, hi };
  }, [data, height]);

  if (!dims || data.length === 0) {
    return <div className="h-32 flex items-center justify-center text-xs text-slate-500">—</div>;
  }
  const { W, H, ml, mt, plotH, xFor, yFor, lo, hi } = dims;

  const pathD = data.map((d, i) => `${i === 0 ? "M" : "L"}${xFor(i).toFixed(1)},${yFor(d.y).toFixed(1)}`).join(" ");
  const yTicks = 3;
  const tickValues = Array.from({ length: yTicks + 1 }, (_, i) => lo + ((hi - lo) * i) / yTicks);

  return (
    <div className="relative w-full" style={{ background: bg }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full" style={{ height }}
        onMouseLeave={() => setHover(null)}>
        {/* Y gridlines */}
        {tickValues.map((v, i) => {
          const y = yFor(v);
          return (
            <g key={i}>
              <line x1={ml} x2={W - 8} y1={y} y2={y} stroke="#e6e1d4" strokeDasharray="2 3" />
              <text x={ml - 4} y={y} dominantBaseline="middle" textAnchor="end" fontSize={9} fill="#a9a493">
                {v.toFixed(0)}
              </text>
            </g>
          );
        })}
        {/* Line */}
        <path d={pathD} fill="none" stroke={stroke} strokeWidth={2} />
        {/* Markers */}
        {data.map((d, i) => {
          const isPr = d.marker === "pr";
          return (
            <circle
              key={i}
              cx={xFor(i)} cy={yFor(d.y)}
              r={isPr ? 4.5 : 3}
              fill={isPr ? "#cb8420" : stroke}
              stroke={isPr ? "#ffffff" : "transparent"}
              strokeWidth={isPr ? 1.5 : 0}
              onMouseEnter={() => setHover(d)}
              onTouchStart={() => setHover(d)}
              style={{ cursor: "pointer" }}
            />
          );
        })}
        {/* X axis labels — first and last only to keep it clean */}
        <text x={ml} y={H - 6} fontSize={9} fill="#a9a493">{data[0].x.slice(5)}</text>
        <text x={W - 8} y={H - 6} fontSize={9} fill="#a9a493" textAnchor="end">
          {data[data.length - 1].x.slice(5)}
        </text>
      </svg>
      {hover && (
        <div className="absolute top-1 right-1 rounded-md bg-slate-900 text-white px-2 py-1 text-[11px] pointer-events-none shadow">
          <div className="font-medium">{hover.y.toFixed(1)}{yLabel ? ` ${yLabel}` : ""}{hover.marker === "pr" ? " ★" : ""}</div>
          <div className="text-slate-300 text-[10px]">{hover.x}{hover.extra ? ` · ${hover.extra}` : ""}</div>
        </div>
      )}
    </div>
  );
}
