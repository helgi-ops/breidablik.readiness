"use client";

/**
 * TrainingLoadCard — Training Load Intelligence. Last-7-day internal load split
 * by source (strength vs sport) + total, with an ACWR-based recommendation.
 * The bridge between sports science and PT: we see load outside the gym too.
 * Optional clientId switches to the trainer-scoped endpoint.
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Lang = "IS" | "EN";

type Load = {
  strength_7d: number; sport_7d: number; other_7d: number; total_7d: number;
  acwr: number | null;
  status: "low" | "optimal" | "high" | "very_high" | "building";
  confidence: "low" | "medium" | "high";
};

const COPY = {
  IS: {
    title: "Heildarálag (7 dagar)", sub: "Innra álag (RPE × mín)", strength: "Styrkur", sport: "Íþrótt", other: "Annað",
    total: "Samtals", au: "AU", acwr: "Álagshlutfall",
    rec: {
      very_high: "⚠ Álag eykst hratt — haltu ræktarmagni og settu endurheimt í forgang.",
      high: "Álag að klifra — haltu magni stöðugu þessa viku.",
      optimal: "Álag í góðu jafnvægi — haltu áfram eins og planað.",
      low: "Álag er létt — þú mátt bæta aðeins við.",
      building: "Safna grunnlínu — haltu áfram að skrá.",
    },
  },
  EN: {
    title: "Total load (7 days)", sub: "Internal load (RPE × min)", strength: "Strength", sport: "Sport", other: "Other",
    total: "Total", au: "AU", acwr: "Load ratio",
    rec: {
      very_high: "⚠ Load rising fast — hold gym volume and prioritise recovery.",
      high: "Load climbing — keep volume steady this week.",
      optimal: "Load well balanced — proceed as planned.",
      low: "Load is light — you can add a bit back.",
      building: "Building a baseline — keep logging.",
    },
  },
} as const;

const TONE: Record<string, string> = {
  very_high: "border-red-200 bg-red-50 text-red-800",
  high: "border-amber-200 bg-amber-50 text-amber-800",
  optimal: "border-emerald-200 bg-emerald-50 text-emerald-800",
  low: "border-slate-200 bg-slate-50 text-slate-700",
  building: "border-slate-200 bg-slate-50 text-slate-500",
};

function fmt(n: number) { return n.toLocaleString("is-IS"); }

export default function TrainingLoadCard({ lang = "IS", clientId }: { lang?: Lang; clientId?: string }) {
  const t = COPY[lang];
  const [d, setD] = useState<Load | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const url = clientId ? `/api/trainer/client/${clientId}/training-load` : `/api/client/training-load`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${session.access_token}` } });
      const json = await res.json();
      if (json.ok) setD(json.load as Load);
    } catch { /* soft */ } finally { setLoaded(true); }
  }, [clientId]);

  useEffect(() => { void load(); }, [load]);

  if (!loaded || !d || d.total_7d <= 0) return null;

  const pct = (v: number) => `${Math.round((v / Math.max(1, d.total_7d)) * 100)}%`;
  const rows: Array<{ label: string; value: number; bar: string }> = [
    { label: t.strength, value: d.strength_7d, bar: "bg-slate-800" },
    { label: t.sport, value: d.sport_7d, bar: "bg-emerald-500" },
  ];
  if (d.other_7d > 0) rows.push({ label: t.other, value: d.other_7d, bar: "bg-slate-400" });

  return (
    <div className="rounded-2xl border bg-white shadow-sm p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-900">{t.title}</h3>
          <p className="text-[11px] text-slate-500">{t.sub}</p>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">{t.total}</div>
          <div className="text-lg font-bold text-slate-900">{fmt(d.total_7d)} <span className="text-[11px] font-normal text-slate-500">{t.au}</span></div>
        </div>
      </div>

      {/* Stacked split */}
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
        {rows.map((r) => r.value > 0 && (
          <div key={r.label} className={r.bar} style={{ width: pct(r.value) }} />
        ))}
      </div>

      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-2 text-sm">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${r.bar}`} />
            <span className="text-slate-700">{r.label}</span>
            <span className="ml-auto tabular-nums font-medium text-slate-900">{fmt(r.value)} {t.au}</span>
            <span className="w-10 text-right text-[11px] text-slate-400">{pct(r.value)}</span>
          </div>
        ))}
      </div>

      {/* Recommendation */}
      <div className={`rounded-lg border px-3 py-2 ${TONE[d.status]}`}>
        <div className="text-[13px]">{t.rec[d.status]}</div>
        {d.acwr != null && d.status !== "building" && (
          <div className="text-[10px] opacity-70 mt-0.5">{t.acwr}: {d.acwr}</div>
        )}
      </div>
    </div>
  );
}
