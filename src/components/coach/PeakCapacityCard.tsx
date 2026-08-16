"use client";

/**
 * Peak-capacity card — "% of peak capacity" per drill of a session (the ADI '94% effort'
 * label). Each drill's per-minute PlayerLoad vs the player's own duration-matched peak
 * (peakCapacity.ts). The ceiling is a proxy from his drill history now, upgrading to the
 * true power curve when a peak-period export lands. Descriptive load context — never touches
 * readiness. Bilingual EN/IS.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import type { CapacityLevel } from "@/lib/micropulse/load/peakCapacity";

type Drill = { label: string | null; durationMin: number | null; valuePerMin: number | null; pctOfPeak: number | null; level: CapacityLevel; band: string | null };
type Resp = {
  ok: boolean; hasData: boolean; name: string | null; sessionDate?: string;
  sessionDates?: string[]; referenceDrills?: number; drills?: Drill[];
};

const LEVEL_TONE: Record<CapacityLevel, string> = {
  peak: "bg-rose-100 text-rose-700",
  high: "bg-amber-100 text-amber-800",
  moderate: "bg-emerald-100 text-emerald-700",
  low: "bg-slate-100 text-slate-500",
  insufficient: "bg-slate-100 text-slate-400",
};
const fmt = (v: number | null | undefined, d = 1) => (v == null ? "–" : v.toFixed(d));

export default function PeakCapacityCard({ players }: { players: Array<{ id: string; name: string }> }) {
  const [lang] = useLang();
  const is = lang === "IS";
  const [sel, setSel] = React.useState("");
  const [date, setDate] = React.useState("");
  const [data, setData] = React.useState<Resp | null>(null);
  const [loading, setLoading] = React.useState(false);

  const token = React.useCallback(async () => (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? null, []);
  React.useEffect(() => { if (!sel && players.length) setSel(players[0].id); }, [players, sel]);
  React.useEffect(() => { setDate(""); }, [sel]);

  React.useEffect(() => {
    if (!sel) { setData(null); return; }
    let alive = true; setLoading(true);
    (async () => {
      try {
        const tok = await token(); if (!tok) return;
        const q = date ? `&date=${date}` : "";
        const res = await fetch(`/api/coach/load/peak-capacity?player=${sel}${q}`, { headers: { Authorization: `Bearer ${tok}` }, cache: "no-store" });
        const j = (await res.json().catch(() => null)) as Resp | null;
        if (alive) setData(j && j.ok ? j : null);
      } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [sel, date, token]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold text-slate-800">{is ? "% af hámarksgetu (per æfing)" : "% of peak capacity (per drill)"}</span>
        <span className="cursor-help rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500"
          title={is
            ? "Ákefð hverrar æfingar á mínútu, borin saman við hans EIGIN dæmigerðu hörðu æfingu af sömu lengd (p90 af sömu-lengdar æfingum hans). 71% = jafn ákaft og ~71% af hans hörðu æfingum af þeirri lengd; yfir 100% = ný toppæfing. Lengdar-jafnað og lesið á hans eigin getu — aldrei milli leikmanna, aldrei m.v. markmið. Þetta er annað en Power curve kortið (sem sýnir hámarks 1/3/5-mín sprengju)."
            : "Each drill's per-minute intensity vs the player's OWN typical hard drill of that length (the p90 of his similar-length drills). 71% = as intense as ~71% of his hard drills that long; over 100% = a new peak. Duration-matched and read on his own capacity — never cross-athlete, never vs a target. This is separate from the Power curve card (which shows his peak 1/3/5-min burst)."}>
          {is ? "m.v. hann sjálfan ⓘ" : "vs his own peak ⓘ"}
        </span>
        <select value={sel} onChange={(e) => setSel(e.target.value)} className="ml-auto rounded-lg border border-slate-300 px-2 py-1 text-[13px]">
          {players.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {loading ? <p className="mt-3 text-[13px] text-slate-400">…</p> : null}

      {!loading && data && !data.hasData ? (
        <p className="mt-3 text-[13px] text-slate-500">{is ? "Engin per-æfingar gögn fyrir þennan leikmann enn." : "No per-drill data for this player yet."}</p>
      ) : null}

      {!loading && data?.hasData ? (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-[12px] text-slate-500">
            <span>{is ? "Lota" : "Session"}:</span>
            {data.sessionDates && data.sessionDates.length ? (
              <select value={data.sessionDate} onChange={(e) => setDate(e.target.value)} className="rounded border border-slate-300 px-1.5 py-0.5 text-[12px]">
                {data.sessionDates.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            ) : <span className="font-semibold text-slate-700">{data.sessionDate}</span>}
            <span className="text-slate-400">· {is ? "þak úr" : "ceiling from"} {data.referenceDrills} {is ? "æfingum" : "drills"}</span>
          </div>

          <p className="text-[12px] leading-snug text-slate-500">
            {is
              ? "Hver æfing borin saman við hans dæmigerðu hörðu æfingu af sömu lengd. 100% = jafnaði hans hörðustu; yfir 100% = ný toppæfing."
              : "Each drill vs his own typical hard drill of that length. 100% = matched his hardest; over 100% = a new peak."}
          </p>

          <div className="space-y-1.5">
            {(data.drills ?? []).map((d, i) => {
              const pct = d.pctOfPeak;
              const w = pct == null ? 0 : Math.min(100, pct);
              return (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-28 shrink-0 truncate text-[12px] text-slate-700" title={d.label ?? ""}>{d.label ?? "—"}</span>
                  <span className="w-14 shrink-0 text-right text-[11px] tabular-nums text-slate-400">{fmt(d.durationMin, 0)}m</span>
                  <div className="relative h-3 flex-1 overflow-hidden rounded bg-slate-100">
                    <div className="h-full rounded" style={{ width: `${w}%`, backgroundColor: d.level === "peak" ? "#a83e28" : d.level === "high" ? "#de9328" : d.level === "moderate" ? "#1c7a4a" : "#cbd5e1" }} />
                  </div>
                  <span className={`w-16 shrink-0 rounded px-1.5 py-0.5 text-center text-[11px] font-semibold tabular-nums ${LEVEL_TONE[d.level]}`}>
                    {pct == null ? "–" : `${pct}%`}
                  </span>
                </div>
              );
            })}
          </div>

          <p className="text-[11px] text-slate-400">
            {is ? "Litur = ákefðar-þrep (hámark / há / miðlungs / lág). Reglur reikna — ekki AI." : "Colour = intensity tier (peak / high / moderate / low). Rules compute — not AI."}
          </p>
        </div>
      ) : null}
    </div>
  );
}
