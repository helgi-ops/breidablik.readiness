"use client";

/**
 * Session Builder — proactive load planning (#3). The coach specifies planned drills by
 * duration + target intensity (% of peak); this predicts, per player, the per-minute rate and
 * total PlayerLoad each will accumulate (sessionPlan.ts) against his own capacity reference —
 * so the session can be balanced and peak exposure spotted BEFORE it happens. Descriptive
 * planning aid — never touches readiness. Bilingual EN/IS.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import { predictSquadSession, type PlannedDrill } from "@/lib/micropulse/load/sessionPlan";
import { levelFor, type CapacityLevel, type CapacityReference } from "@/lib/micropulse/load/peakCapacity";

type RefRow = { playerId: string; name: string; reference: CapacityReference };

const LEVEL_TONE: Record<CapacityLevel, string> = {
  peak: "bg-rose-100 text-rose-700",
  high: "bg-amber-100 text-amber-800",
  moderate: "bg-emerald-100 text-emerald-700",
  low: "bg-slate-100 text-slate-500",
  insufficient: "bg-slate-100 text-slate-400",
};

let uid = 0;
const newDrill = (label: string): PlannedDrill => ({ id: `d${++uid}`, label, durationMin: 8, targetPct: 85 });

export default function SessionBuilderCard() {
  const [lang] = useLang();
  const is = lang === "IS";
  const [refs, setRefs] = React.useState<RefRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [drills, setDrills] = React.useState<PlannedDrill[]>(() => [
    newDrill(is ? "Upphitun" : "Warm-up"),
    newDrill(is ? "Boltahald (SSG)" : "Possession (SSG)"),
  ]);

  const token = React.useCallback(async () => (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? null, []);
  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const tok = await token(); if (!tok) return;
        const res = await fetch("/api/coach/load/capacity-reference", { headers: { Authorization: `Bearer ${tok}` }, cache: "no-store" });
        const j = await res.json().catch(() => null);
        if (alive && j?.ok) setRefs(j.players ?? []);
      } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [token]);

  const set = (id: string, patch: Partial<PlannedDrill>) => setDrills((ds) => ds.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  const remove = (id: string) => setDrills((ds) => ds.filter((d) => d.id !== id));
  const add = () => setDrills((ds) => [...ds, newDrill(is ? "Æfing" : "Drill")]);

  const totalDur = drills.reduce((a, d) => a + (Number.isFinite(d.durationMin) ? d.durationMin : 0), 0);
  const squad = React.useMemo(() => predictSquadSession(drills, refs).sort((a, b) => (b.prediction.totalLoad ?? 0) - (a.prediction.totalLoad ?? 0)), [drills, refs]);
  const maxLoad = Math.max(1, ...squad.map((s) => s.prediction.totalLoad ?? 0));

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold text-slate-800">{is ? "Æfinga-smiður (áætluð álag)" : "Session Builder (planned load)"}</span>
        <span className="cursor-help rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500"
          title={is ? "Skilgreindu æfingar með lengd + mark-ákefð (% af hámarki). Spáir áætluðu álagi per leikmann m.v. eigin getu hvers. Nálgun úr æfingasögu." : "Specify drills by duration + target intensity (% of peak). Predicts planned load per player vs each one's own capacity. Proxy from drill history."}>
          {is ? "áætlun ⓘ" : "planner ⓘ"}
        </span>
      </div>

      {/* Planned-drill editor */}
      <div className="mt-3 space-y-1.5">
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          <span className="flex-1">{is ? "Æfing" : "Drill"}</span>
          <span className="w-16 text-right">{is ? "mín" : "min"}</span>
          <span className="w-28 text-right">{is ? "% af hámarki" : "% of peak"}</span>
          <span className="w-16 text-right">{is ? "þrep" : "tier"}</span>
          <span className="w-6" />
        </div>
        {drills.map((d) => {
          const lvl = levelFor(d.targetPct);
          return (
            <div key={d.id} className="flex items-center gap-2">
              <input value={d.label} onChange={(e) => set(d.id, { label: e.target.value })}
                className="flex-1 rounded border border-slate-300 px-2 py-1 text-[13px]" />
              <input type="number" min={1} max={130} value={d.durationMin}
                onChange={(e) => set(d.id, { durationMin: Number(e.target.value) })}
                className="w-16 rounded border border-slate-300 px-2 py-1 text-right text-[13px] tabular-nums" />
              <input type="range" min={30} max={110} step={5} value={d.targetPct}
                onChange={(e) => set(d.id, { targetPct: Number(e.target.value) })} className="w-20" />
              <span className="w-8 text-right text-[12px] tabular-nums text-slate-600">{d.targetPct}%</span>
              <span className={`w-16 rounded px-1.5 py-0.5 text-center text-[10px] font-semibold capitalize ${LEVEL_TONE[lvl]}`}>{is ? { peak: "hámark", high: "há", moderate: "miðl", low: "lág", insufficient: "—" }[lvl] : lvl}</span>
              <button onClick={() => remove(d.id)} className="w-6 text-slate-400 hover:text-red-600" aria-label="remove">×</button>
            </div>
          );
        })}
        <button onClick={add} className="mt-1 text-[12px] font-semibold text-[#2740e6] hover:underline">+ {is ? "Bæta við æfingu" : "Add drill"}</button>
        <p className="text-[11px] text-slate-400">{is ? "Heildarlengd" : "Total duration"}: <b className="text-slate-600">{totalDur} {is ? "mín" : "min"}</b></p>
      </div>

      {/* Predicted per-player load */}
      <div className="mt-4">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{is ? "Áætlað álag per leikmann" : "Predicted load per player"}</div>
        {loading ? <p className="mt-1 text-[12px] text-slate-400">…</p> : null}
        {!loading && squad.length === 0 ? (
          <p className="mt-1 text-[12px] text-slate-500">{is ? "Engin æfingasaga til að áætla út frá enn." : "No drill history to plan against yet."}</p>
        ) : null}
        {!loading && squad.length > 0 ? (
          <div className="mt-2 space-y-1">
            {squad.map((s) => {
              const load = s.prediction.totalLoad ?? 0;
              return (
                <div key={s.playerId} className="flex items-center gap-2">
                  <span className="w-32 shrink-0 truncate text-[12px] text-slate-700">{s.name}</span>
                  <div className="relative h-3 flex-1 overflow-hidden rounded bg-slate-100">
                    <div className="h-full rounded bg-[#2740e6]" style={{ width: `${(load / maxLoad) * 100}%` }} />
                  </div>
                  <span className="w-16 shrink-0 text-right text-[12px] font-semibold tabular-nums text-slate-800">{s.prediction.totalLoad ?? "–"}</span>
                  <span className="w-14 shrink-0 text-right text-[11px] tabular-nums text-slate-400">{s.prediction.meanIntensityPct == null ? "" : `${s.prediction.meanIntensityPct}%`}</span>
                  {s.prediction.peakDrills > 0 ? <span className="w-14 shrink-0 rounded bg-rose-100 px-1 py-0.5 text-center text-[10px] font-semibold text-rose-700">{s.prediction.peakDrills} {is ? "hám." : "peak"}</span> : <span className="w-14 shrink-0" />}
                </div>
              );
            })}
          </div>
        ) : null}
        <p className="mt-2 text-[11px] text-slate-400">
          {is ? "Súla = áætlað heildar-PlayerLoad · % = álags-vegin mark-ákefð. Reglur reikna — ekki AI. Áætlun; þjálfari ræður." : "Bar = predicted total PlayerLoad · % = load-weighted target intensity. Rules compute — not AI. A planning aid; the coach decides."}
        </p>
      </div>
    </div>
  );
}
