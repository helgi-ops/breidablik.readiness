"use client";

/**
 * VolumeLoadCard — weekly tonnage (Σ weight × reps), external mechanical load.
 * One-line verdict + 8-week bar trend + per-lift breakdown. Optional clientId
 * switches to the trainer-scoped endpoint.
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Lang = "IS" | "EN";

type Volume = {
  weeks: Array<{ week_start: string; total: number }>;
  by_lift: Array<{ lift: string; total: number }>;
  this_week: number;
  last_week: number;
  delta_pct: number | null;
  window_weeks: number;
  acwr: number | null;
  acute_daily: number;
  chronic_daily: number;
  acwr_status: "low" | "optimal" | "high" | "very_high" | "building";
};

const ACWR_TONE: Record<string, { bg: string; text: string }> = {
  low:       { bg: "bg-slate-100",  text: "text-slate-700" },
  optimal:   { bg: "bg-emerald-100", text: "text-emerald-800" },
  high:      { bg: "bg-amber-100",  text: "text-amber-800" },
  very_high: { bg: "bg-red-100",    text: "text-red-800" },
  building:  { bg: "bg-slate-100",  text: "text-slate-500" },
};

const ACWR_NOTE: Record<"IS" | "EN", Record<string, string>> = {
  IS: {
    low: "Lágt álagshlutfall — magn að minnka.",
    optimal: "Innan þíns venjulega álagsbils (0.8–1.3) — jöfn framvinda.",
    high: "Hátt — fylgstu með, álag eykst hratt.",
    very_high: "Mjög hátt (>1.5) — stórt stökk yfir venju; farðu rólega af stað.",
    building: "Safna grunnlínu fyrir álagshlutfall.",
  },
  EN: {
    low: "Low ratio — volume is dropping.",
    optimal: "Within your familiar load range (0.8–1.3) — steady progression.",
    high: "High — watch it, load climbing fast.",
    very_high: "Very high (>1.5) — a big jump above your usual; ease in gradually.",
    building: "Building a baseline for the ratio.",
  },
};

const COPY = {
  IS: { title: "Æfingamagn (tonnage)", sub: "Sett × endurt. × þyngd", thisWeek: "Þessa viku", vsLast: "vs. síðasta", byLift: "Eftir lyftu", none: "Engin skráð sett enn.", kg: "kg", acwr: "Álagshlutfall (tonnage)" },
  EN: { title: "Volume load (tonnage)", sub: "Sets × reps × weight", thisWeek: "This week", vsLast: "vs. last", byLift: "By lift", none: "No logged sets yet.", kg: "kg", acwr: "Load ratio (tonnage)" },
} as const;

function fmt(n: number): string { return n.toLocaleString("is-IS"); }

export default function VolumeLoadCard({ lang = "IS", clientId }: { lang?: Lang; clientId?: string }) {
  const t = COPY[lang];
  const [v, setV] = useState<Volume | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const url = clientId ? `/api/trainer/client/${clientId}/volume-load` : `/api/client/volume-load`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${session.access_token}` } });
      const json = await res.json();
      if (json.ok) setV(json.volume as Volume);
    } catch { /* soft */ } finally { setLoaded(true); }
  }, [clientId]);

  useEffect(() => { void load(); }, [load]);

  if (!loaded || !v) return null;

  const max = Math.max(1, ...v.weeks.map((w) => w.total));
  const liftMax = Math.max(1, ...v.by_lift.map((l) => l.total));
  const hasData = v.weeks.some((w) => w.total > 0);

  const W = 280, H = 120, pad = 18;
  const barW = (W - 2 * pad) / v.weeks.length;

  return (
    <div className="rounded-2xl border bg-white shadow-sm p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-900">{t.title}</h3>
          <p className="text-[11px] text-slate-500">{t.sub}</p>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">{t.thisWeek}</div>
          <div className="text-sm font-semibold text-slate-900">{fmt(v.this_week)} {t.kg}</div>
          {v.delta_pct != null && (
            <div className={`text-[11px] ${v.delta_pct > 0 ? "text-emerald-700" : v.delta_pct < 0 ? "text-amber-700" : "text-slate-500"}`}>
              {v.delta_pct > 0 ? "+" : ""}{v.delta_pct}% {t.vsLast}
            </div>
          )}
        </div>
      </div>

      {v.acwr != null && v.acwr_status !== "building" && (
        <div className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 ${ACWR_TONE[v.acwr_status].bg}`}>
          <span className={`text-[11px] font-semibold ${ACWR_TONE[v.acwr_status].text}`}>
            {t.acwr}: {v.acwr.toFixed(2)}
          </span>
          <span className={`text-[11px] ${ACWR_TONE[v.acwr_status].text}`}>{ACWR_NOTE[lang][v.acwr_status]}</span>
        </div>
      )}

      {!hasData ? (
        <div className="text-sm text-slate-500">{t.none}</div>
      ) : (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[340px]" role="img" aria-label={t.title}>
            {v.weeks.map((w, i) => {
              const h = (w.total / max) * (H - 2 * pad);
              const x = pad + i * barW + barW * 0.15;
              const isLast = i === v.weeks.length - 1;
              return (
                <rect key={w.week_start} x={x} y={H - pad - h} width={barW * 0.7} height={h}
                  rx="2" fill={isLast ? "#221f18" : "#a9a493"} />
              );
            })}
            <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke="#e6e1d4" />
          </svg>

          <div className="space-y-1.5">
            <div className="text-[10px] uppercase tracking-wide font-semibold text-slate-500">{t.byLift}</div>
            {v.by_lift.map((l) => (
              <div key={l.lift} className="flex items-center gap-2">
                <span className="w-28 truncate text-xs capitalize text-slate-700">{l.lift}</span>
                <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full rounded-full bg-slate-400" style={{ width: `${(l.total / liftMax) * 100}%` }} />
                </div>
                <span className="w-20 text-right text-xs tabular-nums text-slate-600">{fmt(l.total)} {t.kg}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
