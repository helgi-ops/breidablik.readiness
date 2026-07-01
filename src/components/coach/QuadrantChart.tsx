"use client";

/**
 * QuadrantChart — Gabbett 2017 / Vanrenterghem 2017 framework.
 *
 * 2x2 chart of external load (X) vs internal cost (Y) over a rolling
 * window. Each athlete is plotted as a dot. Quadrant lines drawn at the
 * team's median value on each axis (more robust than mean for small n).
 *
 * Quadrants (clockwise from top-right):
 *   ┌──────────────┬──────────────┐
 *   │  DECOUPLED   │ INJURY RISK  │
 *   │  (low ext +  │ (high ext +  │
 *   │   high int)  │   high int)  │
 *   ├──────────────┼──────────────┤
 *   │   UNDER-     │ PEAK FITNESS │
 *   │ STIMULATED   │ (high ext +  │
 *   │              │   low int)   │
 *   └──────────────┴──────────────┘
 *
 * Pure SVG — no chart-library dependency. Bundle stays lean.
 */

import * as React from "react";
import MethodologyLink from "@/components/common/MethodologyLink";
import { ACWR_CAVEAT } from "@/lib/methodologyCaveats";

export type QuadrantPoint = {
  playerId: string;
  name: string;
  externalLoad: number;   // X-axis value (e.g. avg total_distance in metres)
  internalCost: number;   // Y-axis value (e.g. avg sRPE = RPE × min)
  acwr?: number | null;   // optional: drives dot size
  edi?: number | null;    // di Prampero 2015 — intensity density per metre run
  flag?: "green" | "yellow" | "red" | null;
};

type Props = {
  points: QuadrantPoint[];
  xLabel?: string;        // e.g. "External load — avg distance (m / day)"
  yLabel?: string;        // e.g. "Internal cost — avg sRPE (AU / day)"
  width?: number;         // SVG viewBox width (px)
  height?: number;        // SVG viewBox height (px)
  onPointClick?: (p: QuadrantPoint) => void;
};

// Brand colours
const FOREST  = "#005A2B";
const CYAN    = "#29B7E6";
const SLATE   = "#1E293B";
const MUTED   = "#64748B";
const LIGHT   = "#94A3B8";
const BORDER  = "#E2E8F0";
const RED     = "#DC2626";
const YELLOW  = "#F59E0B";
const GREEN   = "#16A34A";
const QR_RED  = "#FEE2E2";
const QR_YEL  = "#FEF3C7";
const QR_GRN  = "#DCFCE7";
const QR_GRY  = "#F1F5F9";

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function QuadrantChart({
  points,
  xLabel = "External load",
  yLabel = "Internal cost",
  width = 900,
  height = 540,
  onPointClick,
}: Props) {
  const [hover, setHover] = React.useState<QuadrantPoint | null>(null);

  // Layout — leave room for axis labels
  const PAD = { left: 80, right: 28, top: 30, bottom: 60 };
  const plotW = width - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;

  const xs = points.map((p) => p.externalLoad);
  const ys = points.map((p) => p.internalCost);

  const xMax = Math.max(...xs, 1) * 1.08;
  const yMax = Math.max(...ys, 1) * 1.08;
  const xMed = median(xs);
  const yMed = median(ys);

  const scaleX = (x: number) => PAD.left + (x / xMax) * plotW;
  const scaleY = (y: number) => PAD.top + plotH - (y / yMax) * plotH;
  const xMidPx = scaleX(xMed);
  const yMidPx = scaleY(yMed);

  // Tick values: 0, 25%, 50%, 75%, 100% of max
  const xTicks = [0, 0.25, 0.5, 0.75, 1.0].map((f) => f * xMax);
  const yTicks = [0, 0.25, 0.5, 0.75, 1.0].map((f) => f * yMax);

  function fmt(n: number): string {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return n.toFixed(0);
  }

  function colorFor(p: QuadrantPoint): string {
    if (p.flag === "red") return RED;
    if (p.flag === "yellow") return YELLOW;
    if (p.flag === "green") return GREEN;
    return CYAN;
  }

  function radiusFor(p: QuadrantPoint): number {
    // Optional: dot size encodes ACWR (1.0 = baseline → 6px, 1.5+ → 11px)
    const a = p.acwr ?? 1.0;
    if (!Number.isFinite(a)) return 7;
    return Math.max(5, Math.min(12, 6 + (a - 1) * 8));
  }

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        style={{ display: "block", maxHeight: 600 }}
      >
        {/* Quadrant background fills */}
        <rect x={PAD.left}     y={PAD.top}     width={xMidPx - PAD.left} height={yMidPx - PAD.top}     fill={QR_YEL} />
        <rect x={xMidPx}        y={PAD.top}     width={width - PAD.right - xMidPx} height={yMidPx - PAD.top}     fill={QR_RED} />
        <rect x={PAD.left}     y={yMidPx}      width={xMidPx - PAD.left} height={PAD.top + plotH - yMidPx} fill={QR_GRY} />
        <rect x={xMidPx}        y={yMidPx}      width={width - PAD.right - xMidPx} height={PAD.top + plotH - yMidPx} fill={QR_GRN} />

        {/* Quadrant outline */}
        <rect x={PAD.left} y={PAD.top} width={plotW} height={plotH} fill="none" stroke={BORDER} strokeWidth={1} />

        {/* Median crosshairs */}
        <line x1={xMidPx} y1={PAD.top} x2={xMidPx} y2={PAD.top + plotH} stroke={SLATE} strokeWidth={1} strokeDasharray="4 3" opacity={0.4} />
        <line x1={PAD.left} y1={yMidPx} x2={PAD.left + plotW} y2={yMidPx} stroke={SLATE} strokeWidth={1} strokeDasharray="4 3" opacity={0.4} />

        {/* Median labels */}
        <text x={xMidPx + 4} y={PAD.top + 12} fontSize={10} fill={MUTED} fontFamily="Calibri, sans-serif">
          team median
        </text>

        {/* Quadrant labels (corners, faded) */}
        <QuadrantLabel x={PAD.left + 12} y={PAD.top + 24}
                       title="DECOUPLED" subtitle="early-warning fatigue" color={YELLOW} />
        <QuadrantLabel x={width - PAD.right - 12} y={PAD.top + 24}
                       title="INJURY RISK" subtitle="high load + high cost" color={RED} align="end" />
        <QuadrantLabel x={PAD.left + 12} y={PAD.top + plotH - 26}
                       title="UNDER-STIMULATED" subtitle="low engagement" color={MUTED} />
        <QuadrantLabel x={width - PAD.right - 12} y={PAD.top + plotH - 26}
                       title="PEAK FITNESS" subtitle="cheap external work" color={GREEN} align="end" />

        {/* X axis ticks + labels */}
        {xTicks.map((t, i) => (
          <g key={`xt-${i}`}>
            <line x1={scaleX(t)} y1={PAD.top + plotH} x2={scaleX(t)} y2={PAD.top + plotH + 4} stroke={MUTED} />
            <text x={scaleX(t)} y={PAD.top + plotH + 18} fontSize={10} fill={MUTED} textAnchor="middle" fontFamily="Calibri, sans-serif">
              {fmt(t)}
            </text>
          </g>
        ))}
        {/* Y axis ticks + labels */}
        {yTicks.map((t, i) => (
          <g key={`yt-${i}`}>
            <line x1={PAD.left - 4} y1={scaleY(t)} x2={PAD.left} y2={scaleY(t)} stroke={MUTED} />
            <text x={PAD.left - 8} y={scaleY(t) + 3} fontSize={10} fill={MUTED} textAnchor="end" fontFamily="Calibri, sans-serif">
              {fmt(t)}
            </text>
          </g>
        ))}

        {/* Axis titles */}
        <text x={PAD.left + plotW / 2} y={height - 18} fontSize={13} fill={SLATE} textAnchor="middle" fontWeight={600} fontFamily="Calibri, sans-serif">
          {xLabel} →
        </text>
        <g transform={`translate(20, ${PAD.top + plotH / 2}) rotate(-90)`}>
          <text fontSize={13} fill={SLATE} textAnchor="middle" fontWeight={600} fontFamily="Calibri, sans-serif">
            {yLabel} →
          </text>
        </g>

        {/* Data points */}
        {points.map((p) => {
          const cx = scaleX(p.externalLoad);
          const cy = scaleY(p.internalCost);
          const r = radiusFor(p);
          const color = colorFor(p);
          return (
            <g key={p.playerId}
               style={{ cursor: onPointClick ? "pointer" : "default" }}
               onMouseEnter={() => setHover(p)}
               onMouseLeave={() => setHover(null)}
               onClick={() => onPointClick?.(p)}>
              <circle cx={cx} cy={cy} r={r + 3} fill="white" opacity={0.6} />
              <circle cx={cx} cy={cy} r={r} fill={color} stroke="white" strokeWidth={1.5} />
            </g>
          );
        })}

        {/* Hover tooltip — drawn last so it sits on top */}
        {hover && (
          <Tooltip
            x={Math.min(scaleX(hover.externalLoad) + 14, width - 240)}
            y={Math.max(scaleY(hover.internalCost) - 60, PAD.top + 4)}
            point={hover}
          />
        )}
      </svg>

      {/* Legend below */}
      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-[11px] text-slate-600">
        <LegendDot color={GREEN}  label="green" />
        <LegendDot color={YELLOW} label="yellow" />
        <LegendDot color={RED}    label="red" />
        <LegendDot color={CYAN}   label="no flag" />
        <span className="text-slate-400">·</span>
        <span>dot size encodes ACWR (larger = ratio &gt; 1.3)</span>
      </div>
      <MethodologyLink caveat={ACWR_CAVEAT} />
    </div>
  );
}

function QuadrantLabel(props: {
  x: number; y: number;
  title: string; subtitle: string;
  color: string; align?: "start" | "end";
}) {
  const anchor = props.align === "end" ? "end" : "start";
  return (
    <g>
      <text x={props.x} y={props.y} fontSize={11} fontWeight={700} fill={props.color} textAnchor={anchor} fontFamily="Calibri, sans-serif">
        {props.title}
      </text>
      <text x={props.x} y={props.y + 13} fontSize={9} fill={MUTED} textAnchor={anchor} fontFamily="Calibri, sans-serif">
        {props.subtitle}
      </text>
    </g>
  );
}

function Tooltip({ x, y, point }: { x: number; y: number; point: QuadrantPoint }) {
  const hasAcwr = point.acwr != null && Number.isFinite(point.acwr);
  const hasEdi  = point.edi  != null && Number.isFinite(point.edi);
  // Grow box dynamically to fit ACWR + EDI lines
  const w = 230;
  const h = 52 + (hasAcwr ? 14 : 0) + (hasEdi ? 14 : 0);
  // EDI colour: green ≤ 1.20, yellow 1.20–1.35, orange > 1.35 (di Prampero 2015 thresholds)
  const ediColour = hasEdi
    ? (point.edi! <= 1.20 ? GREEN : point.edi! <= 1.35 ? YELLOW : "#FB923C")
    : LIGHT;
  return (
    <g style={{ pointerEvents: "none" }}>
      <rect x={x} y={y} width={w} height={h} rx={6} fill={SLATE} opacity={0.96} />
      <text x={x + 12} y={y + 20} fontSize={13} fontWeight={700} fill="white" fontFamily="Calibri, sans-serif">
        {point.name}
      </text>
      <text x={x + 12} y={y + 38} fontSize={11} fill={LIGHT} fontFamily="Calibri, sans-serif">
        External: {point.externalLoad.toFixed(0)}  ·  Internal: {point.internalCost.toFixed(0)}
      </text>
      {hasAcwr && (
        <text x={x + 12} y={y + 52} fontSize={11} fill={CYAN} fontFamily="Calibri, sans-serif">
          ACWR: {point.acwr!.toFixed(2)}
        </text>
      )}
      {hasEdi && (
        <text x={x + 12} y={y + (hasAcwr ? 66 : 52)} fontSize={11} fill={ediColour} fontFamily="Calibri, sans-serif">
          EDI: {point.edi!.toFixed(2)}  ·  intensity density
        </text>
      )}
    </g>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      <span>{label}</span>
    </span>
  );
}
