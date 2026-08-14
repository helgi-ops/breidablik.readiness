"use client";

/**
 * BasketballCourtMap — a schematic half-court coloured by shooting efficiency across
 * three regions: Paint, Mid-range and 3PT (basket at the top). The regions are a
 * clean partition of every field-goal attempt (paint + mid + three = FG), derived
 * from the InStat per-player FG table — an honest "where we shoot / how it falls"
 * visual, no inferred zone layout. Descriptive; never touches readiness.
 */

import type { Lang } from "@/lib/micropulse/basketballStats/shotLabels";

type CourtRegion = { key: "paint" | "mid" | "three"; made: number; att: number; pct: number | null };

// Efficiency → colour. Basketball-sensible: green good, amber ok, red cold, grey none.
function fillFor(pct: number | null, att: number): string {
  if (att <= 0 || pct == null) return "#cbd5e1";
  if (pct >= 55) return "#1c7a4a";
  if (pct >= 40) return "#de9328";
  return "#a83e28";
}

const LABEL: Record<CourtRegion["key"], { EN: string; IS: string }> = {
  paint: { EN: "Paint", IS: "Teigur" },
  mid: { EN: "Mid-range", IS: "Miðsvæði" },
  three: { EN: "3PT", IS: "Þristar" },
};

export default function BasketballCourtMap({ regions, lang, title }: { regions: CourtRegion[]; lang: Lang; title?: string }) {
  const by = (k: CourtRegion["key"]) => regions.find((r) => r.key === k) ?? { key: k, made: 0, att: 0, pct: null };
  const paint = by("paint"), mid = by("mid"), three = by("three");
  const cell = (r: CourtRegion, x: number, y: number) => (
    <g>
      <text x={x} y={y} textAnchor="middle" fontSize="11" fontWeight="700" fill="#14181c">{r.pct == null ? "—" : `${r.pct}%`}</text>
      <text x={x} y={y + 13} textAnchor="middle" fontSize="8.5" fill="#14181c">{r.made}-{r.att}</text>
      <text x={x} y={y + 25} textAnchor="middle" fontSize="7.5" fill="#4b5563" style={{ textTransform: "uppercase", letterSpacing: 0.5 }}>{LABEL[r.key][lang]}</text>
    </g>
  );
  return (
    <div>
      {title ? <div className="mb-1 text-[11px] font-semibold text-slate-600">{title}</div> : null}
      <svg viewBox="0 0 300 272" className="w-full" style={{ maxWidth: 320 }} role="img" aria-label="shot map">
        {/* court backdrop = 3PT region (beyond the arc) */}
        <rect x={6} y={6} width={288} height={260} rx={8} fill={fillFor(three.pct, three.att)} fillOpacity={0.5} stroke="#94a3b8" strokeWidth={1.2} />
        {/* 2-point area (inside the arc) */}
        <path d="M52,6 L52,64 Q150,214 248,64 L248,6 Z" fill={fillFor(mid.pct, mid.att)} fillOpacity={0.62} stroke="#64748b" strokeWidth={1} />
        {/* the paint / key */}
        <rect x={116} y={6} width={68} height={104} fill={fillFor(paint.pct, paint.att)} fillOpacity={0.8} stroke="#475569" strokeWidth={1} />
        {/* free-throw circle + rim */}
        <path d="M116,110 A34 34 0 0 0 184,110" fill="none" stroke="#475569" strokeWidth={1} />
        <circle cx={150} cy={28} r={7} fill="none" stroke="#334155" strokeWidth={1.4} />
        <line x1={132} y1={16} x2={168} y2={16} stroke="#334155" strokeWidth={1.6} />
        {/* labels */}
        {cell(paint, 150, 56)}
        {cell(mid, 150, 150)}
        {cell(three, 150, 240)}
      </svg>
    </div>
  );
}
