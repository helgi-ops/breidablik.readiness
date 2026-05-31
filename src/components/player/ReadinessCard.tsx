"use client";

/**
 * ReadinessCard — "Am I ready today?" The canonical readiness colour decides;
 * this surfaces the score (0-100), the colour, a confidence chip, and one
 * plain-language training recommendation derived from the colour.
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Lang = "IS" | "EN";
type Readiness = { score: number | null; color: string; confidence: "low" | "medium" | "high" };

const COLOR: Record<string, { dot: string; chip: string; ring: string }> = {
  GREEN:  { dot: "bg-emerald-500", chip: "bg-emerald-100 text-emerald-800", ring: "ring-emerald-200" },
  YELLOW: { dot: "bg-amber-500",   chip: "bg-amber-100 text-amber-800",     ring: "ring-amber-200" },
  RED:    { dot: "bg-red-500",     chip: "bg-red-100 text-red-800",         ring: "ring-red-200" },
  GRAY:   { dot: "bg-slate-400",   chip: "bg-slate-100 text-slate-600",     ring: "ring-slate-200" },
};

const COPY = {
  IS: {
    title: "Readiness í dag", confidence: "Áreiðanleiki",
    conf: { low: "lágur", medium: "miðlungs", high: "hár" },
    recTitle: "Ráðlegging dagsins",
    rec: {
      GREEN: { s: "Þú ert tilbúin/n.", a: "Haltu áfram eins og planað." },
      GREENplus: { s: "Þú ert tilbúin/n og ferskur.", a: "Haltu áfram eins og planað — ef settin eru létt máttu bæta aðeins við þyngd." },
      YELLOW: { s: "Aðeins undir þínu venjulega.", a: "Minnkaðu magnið örlítið og haltu gæðunum háum." },
      RED: { s: "Endurheimt er lág í dag.", a: "Minnkaðu magn um ~20% og haltu ákefð léttri." },
    },
  },
  EN: {
    title: "Today's readiness", confidence: "Confidence",
    conf: { low: "low", medium: "medium", high: "high" },
    recTitle: "Today's recommendation",
    rec: {
      GREEN: { s: "You're ready.", a: "Proceed as planned." },
      GREENplus: { s: "You're ready and fresh.", a: "Proceed as planned — if sets feel comfortable, you can add a little load." },
      YELLOW: { s: "A little below your usual.", a: "Trim the volume slightly and keep the quality high." },
      RED: { s: "Recovery is low today.", a: "Reduce volume by ~20% and keep intensity easy." },
    },
  },
} as const;

export default function ReadinessCard({ lang = "IS" }: { lang?: Lang }) {
  const t = COPY[lang];
  const [r, setR] = useState<Readiness | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(`/api/client/readiness`, { headers: { Authorization: `Bearer ${session.access_token}` } });
      const json = await res.json();
      if (json.ok && json.readiness) setR(json.readiness as Readiness);
    } catch { /* soft */ } finally { setLoaded(true); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (!loaded || !r) return null; // no check-in yet → existing nudge covers it

  const c = COLOR[r.color] ?? COLOR.GRAY;
  const recKey = r.color === "GREEN"
    ? (r.score != null && r.score >= 85 && r.confidence === "high" ? "GREENplus" : "GREEN")
    : (r.color === "YELLOW" ? "YELLOW" : r.color === "RED" ? "RED" : null);
  const rec = recKey ? t.rec[recKey] : null;

  return (
    <div className={`rounded-2xl border bg-white shadow-sm p-4 ring-1 ${c.ring} space-y-3`}>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-wide font-semibold text-slate-500">{t.title}</div>
          <div className="mt-0.5 flex items-baseline gap-2">
            <span className="text-3xl font-bold tabular-nums text-slate-900">{r.score ?? "—"}</span>
            <span className="text-sm text-slate-400">/ 100</span>
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${c.chip}`}>
              <span className={`h-2 w-2 rounded-full ${c.dot}`} /> {r.color}
            </span>
          </div>
        </div>
        <div className="text-right text-[11px] text-slate-500">
          {t.confidence}: {t.conf[r.confidence]}
        </div>
      </div>

      {rec && (
        <div className="rounded-lg bg-slate-50 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide font-semibold text-slate-500">{t.recTitle}</div>
          <div className="mt-0.5 text-sm text-slate-800">{rec.s} {rec.a}</div>
        </div>
      )}
    </div>
  );
}
