"use client";

/**
 * Owen microcycle taper view — the recent week's team sessions on the volume–intensity
 * plane (one point per MD day), so the coach sees the taper shape at a glance: MD-4 high
 * volume, MD-1 low-low = a proper taper. Plus a per-session MD-day appropriateness chip.
 *
 * Descriptive load context (Owen 2017) — never the readiness colour or the daily decision.
 */

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";

type Bi = { en: string; is: string };
type Flag = { band: "above" | "as_expected" | "below" | "unknown"; expected: number | null; pctOfExpected: number | null };
type Point = {
  mdDay: string; date: string;
  score: { volume: number | null; intensity: number | null; quadrant: string; vsMdExpectation: string; note: Bi };
  flag: Flag;
};
type Resp = { ok: boolean; asOf: string; reference: { volumeRef: number; intensityRef: number } | null; points: Point[]; taper: { tapered: boolean | null; note: Bi } };

const COPY = {
  IS: { title: "Niðurtröppun vikunnar", sub: "magn × ákefð (Owen)", volume: "Magn", intensity: "Ákefð", low: "lágt", high: "hátt", empty: "Ekki næg álagsgögn í vikunni til að teikna niðurtröppun.", above: "hátt m.v. daginn", below: "lágt m.v. daginn", ofPlan: "af væntu" },
  EN: { title: "This week's taper", sub: "volume × intensity (Owen)", volume: "Volume", intensity: "Intensity", low: "low", high: "high", empty: "Not enough load this week to plot the taper.", above: "high for the day", below: "low for the day", ofPlan: "of expected" },
} as const;

// Distinct hues per MD day so the taper path is readable.
const MD_COLOR: Record<string, string> = {
  "MD-5": "#7a5cc4", "MD-4": "#2740e6", "MD-3": "#1c7a4a", "MD-2": "#de9328", "MD-1": "#a83e28", "MD+1": "#64748b", "MD": "#111827",
};

export default function OwenTaperCard({ date }: { date?: string }) {
  const [lang] = useLang();
  const c = COPY[lang];
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        const token = (await getSupabaseClient().auth.getSession()).data?.session?.access_token;
        if (!token || !alive) return;
        const q = date ? `?date=${encodeURIComponent(date)}` : "";
        const res = await fetch(`/api/coach/load-plan/volume-intensity${q}`, { headers: { Authorization: `Bearer ${token}` } });
        const json = res.ok ? ((await res.json()) as Resp) : null;
        if (alive) setData(json?.ok ? json : null);
      } catch { if (alive) setData(null); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [date]);

  if (loading) return null;
  const plottable = (data?.points ?? []).filter((p) => p.score.volume !== null && p.score.intensity !== null);
  if (!data || plottable.length === 0) {
    return (
      <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">
        <div className="mb-1 text-sm font-semibold text-slate-900">{c.title} <span className="text-[10px] font-normal text-slate-400">· {c.sub}</span></div>
        {c.empty}
      </div>
    );
  }

  // Plane geometry: 0–100 on both axes; x = volume, y = intensity (inverted for SVG).
  const W = 300, H = 300, P = 34;
  const x = (v: number) => P + (v / 100) * (W - 2 * P);
  const y = (v: number) => H - P - (v / 100) * (H - 2 * P);
  const isEN = lang !== "IS";

  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-1 flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-900">{c.title} <span className="text-[10px] font-normal text-slate-400">· {c.sub}</span></div>
        {data.taper.tapered != null && (
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${data.taper.tapered ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
            {data.taper.tapered ? (isEN ? "tapered" : "niðurtröppuð") : (isEN ? "under-tapered" : "vantar niðurtröppun")}
          </span>
        )}
      </div>
      <p className="mb-2 text-[11px] leading-snug text-slate-500">{data.taper.note[isEN ? "en" : "is"]}</p>

      <div className="flex flex-wrap gap-4">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-[300px] w-[300px] shrink-0" role="img" aria-label={c.title}>
          {/* quadrant grid */}
          <rect x={P} y={P} width={W - 2 * P} height={H - 2 * P} fill="none" stroke="#e2e8f0" />
          <line x1={x(50)} y1={P} x2={x(50)} y2={H - P} stroke="#e2e8f0" strokeDasharray="3 3" />
          <line x1={P} y1={y(50)} x2={W - P} y2={y(50)} stroke="#e2e8f0" strokeDasharray="3 3" />
          {/* axis labels */}
          <text x={W / 2} y={H - 6} textAnchor="middle" fontSize="10" fill="#64748b">{c.volume} →</text>
          <text x={12} y={H / 2} textAnchor="middle" fontSize="10" fill="#64748b" transform={`rotate(-90 12 ${H / 2})`}>{c.intensity} →</text>
          {/* taper path (chronological) */}
          <polyline
            points={plottable.map((p) => `${x(p.score.volume!)},${y(p.score.intensity!)}`).join(" ")}
            fill="none" stroke="#cbd5e1" strokeWidth="1.5"
          />
          {/* points */}
          {plottable.map((p) => (
            <g key={p.date}>
              <circle cx={x(p.score.volume!)} cy={y(p.score.intensity!)} r="6" fill={MD_COLOR[p.mdDay] ?? "#111827"} />
              <text x={x(p.score.volume!)} y={y(p.score.intensity!) - 9} textAnchor="middle" fontSize="9" fontWeight="600" fill={MD_COLOR[p.mdDay] ?? "#111827"}>{p.mdDay}</text>
            </g>
          ))}
        </svg>

        <div className="min-w-[180px] flex-1 space-y-1.5">
          {plottable.map((p) => (
            <div key={p.date} className="flex items-center justify-between gap-2 text-[11px]">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: MD_COLOR[p.mdDay] ?? "#111827" }} />
                <span className="font-semibold text-slate-700">{p.mdDay}</span>
                <span className="text-slate-400">{c.volume} {p.score.volume} · {c.intensity} {p.score.intensity}</span>
              </span>
              {(p.flag.band === "above" || p.flag.band === "below") && p.flag.pctOfExpected != null && (
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${p.flag.band === "above" ? "bg-red-100 text-red-700" : "bg-orange-100 text-orange-700"}`}>
                  {p.flag.pctOfExpected}% {c.ofPlan} · {p.flag.band === "above" ? c.above : c.below}
                </span>
              )}
            </div>
          ))}
          <div className="pt-1 text-[10px] leading-snug text-slate-400">
            {isEN
              ? "Each point is a session vs your rolling norm (50 = typical). Owen 2017 — descriptive, never the readiness colour."
              : "Hver punktur er æfing m.v. þitt rúllandi meðaltal (50 = dæmigert). Owen 2017 — lýsandi, aldrei viðbragðsliturinn."}
          </div>
        </div>
      </div>
    </div>
  );
}
