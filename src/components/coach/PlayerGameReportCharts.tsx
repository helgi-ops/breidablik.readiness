"use client";

/**
 * Inline-SVG charts for the player game report. Hand-rolled (no chart lib, same
 * convention as LineSpark/QuadrantChart) so they render crisply on screen AND
 * survive print-to-PDF as vectors. All value labels are drawn into the SVG
 * (not hover-only) so nothing is lost when printed.
 */

export type RadarMetric = { label: string; percentile: number; valueLabel: string };
export type TrendBar = { label: string; value: number };

const INDIGO = "#4f46e5";

/**
 * Percentile radar: each axis is the player's squad percentile (0-100) for one
 * metric. The shaded ring at 50 marks the squad median, so spikes outward =
 * strengths, dips inward = relative weaknesses.
 */
export function ProfileRadar({ metrics }: { metrics: RadarMetric[] }) {
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
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 300 }}>
      {/* concentric rings */}
      {rings.map((ring) => {
        const poly = metrics.map((_, i) => pt(i, ring).join(",")).join(" ");
        const isMedian = ring === 50;
        return (
          <polygon key={ring} points={poly} fill={isMedian ? "#f1f5f9" : "none"}
            stroke={isMedian ? "#cbd5e1" : "#e2e8f0"} strokeWidth={isMedian ? 1.25 : 1} />
        );
      })}
      {/* spokes + axis labels */}
      {metrics.map((m, i) => {
        const [x, y] = pt(i, 100);
        const [lx, ly] = pt(i, 122);
        const anchor = Math.abs(lx - cx) < 6 ? "middle" : lx > cx ? "start" : "end";
        return (
          <g key={m.label}>
            <line x1={cx} y1={cy} x2={x} y2={y} stroke="#e2e8f0" strokeWidth={1} />
            <text x={lx} y={ly - 3} fontSize={9} fontWeight={600} fill="#475569" textAnchor={anchor}>{m.label}</text>
            <text x={lx} y={ly + 7} fontSize={8} fill="#94a3b8" textAnchor={anchor}>{m.valueLabel}</text>
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
        <text x={cx - 58} y={H - 6} fontSize={9} fill="#475569">Player percentile</text>
        <line x1={cx + 36} y1={H - 9} x2={cx + 50} y2={H - 9} stroke="#cbd5e1" strokeWidth={1.25} />
        <text x={cx + 54} y={H - 6} fontSize={9} fill="#475569">squad median</text>
      </g>
    </svg>
  );
}

/**
 * Per-match vertical bars with a dashed season-average line. Value labels sit
 * above each bar; short opponent labels below. Bars below average are muted.
 */
export function MatchTrendBars({
  title, unit, bars, avg, color = INDIGO,
}: { title: string; unit: string; bars: TrendBar[]; avg: number | null; color?: string }) {
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
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: H }}>
        {bars.map((b, i) => {
          const x = xFor(i);
          const y = yFor(b.value);
          const below = avg != null && b.value < avg;
          return (
            <g key={i}>
              <rect x={x} y={y} width={bw} height={mt + plotH - y} rx={1.5}
                fill={color} fillOpacity={below ? 0.32 : 0.85} />
              <text x={x + bw / 2} y={y - 3} fontSize={8} fontWeight={600} fill="#334155" textAnchor="middle">
                {Math.round(b.value).toLocaleString()}
              </text>
              <text x={x + bw / 2} y={H - 18} fontSize={7.5} fill="#94a3b8" textAnchor="middle">{b.label}</text>
            </g>
          );
        })}
        {avgY != null && (
          <line x1={ml} x2={W - mr} y1={avgY} y2={avgY} stroke="#0f172a" strokeWidth={1} strokeDasharray="3 3" opacity={0.55} />
        )}
      </svg>
    </div>
  );
}
