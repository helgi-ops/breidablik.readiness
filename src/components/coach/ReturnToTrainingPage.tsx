"use client";

/**
 * ReturnToTrainingPage — one player's load history (injury-shaded timeline) + an
 * injury-aware return-to-training plan. Layered read: verdict → per-quality
 * targets with why-lines + ACWR → raw history behind Show details. The ceiling
 * is his own HEALTHY baseline; every target cites its % of that baseline. Rules
 * decide; coach edits are logged.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";

type Quality = "volume" | "distance" | "hsr" | "sprint" | "cod";
const ORDER: Quality[] = ["volume", "distance", "hsr", "sprint", "cod"];
const LABEL: Record<Quality, { en: string; is: string; unit: string }> = {
  volume: { en: "Player load", is: "Álag", unit: "" },
  distance: { en: "Distance", is: "Vegalengd", unit: "m" },
  hsr: { en: "High-speed running", is: "Háhraðahlaup", unit: "m" },
  sprint: { en: "Sprinting", is: "Sprettur", unit: "m" },
  cod: { en: "Change of direction", is: "Stefnubreytingar", unit: "" },
};

type Session = { date: string; injured: boolean; isMatch: boolean; estimated: boolean; load: number; distance: number; hsr: number; sprint: number; cod: number; topSpeed: number };
type Win = { start: string; end: string; type: string; source: string; isActive: boolean };
type WeekTarget = { week: number; quality: Quality; target: number; pctOfHealthy: number; wow: number; acwr: number; locked: boolean; unlockWeek: number; why: string };
type Resp = {
  player: { id: string; name: string };
  history: Session[];
  injuryWindows: Win[];
  injuryDiscrepancy: boolean;
  headInjury: boolean;
  currentlyInjured: boolean;
  rttStartDate: string | null;
  baseline: Record<Quality, number> & { builtFromHealthySessions: number; topSpeed: number };
  floor: Record<Quality, number> & { topSpeed: number };
  matchDemand: Record<Quality, number> & { topSpeed: number };
  plan: { verdict: string; weeks: WeekTarget[] } | null;
  confidence: "high" | "medium" | "low";
  error?: string;
};

const f0 = (v: number) => Math.round(v).toLocaleString("en-US");

export default function ReturnToTrainingPage({ playerId }: { playerId: string }) {
  const [lang] = useLang();
  const is = lang === "IS";
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [showMatches, setShowMatches] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [busy, setBusy] = useState(false);

  const token = useCallback(async () => (await supabase.auth.getSession()).data.session?.access_token ?? "", []);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const res = await fetch(`/api/coach/return-to-training/${playerId}?window=180`, { headers: { Authorization: `Bearer ${await token()}` } });
      const j = (await res.json()) as Resp;
      if (!res.ok) { setErr(j.error ?? "Failed"); setData(null); }
      else setData(j);
    } catch (e) { setErr(e instanceof Error ? e.message : "Network error"); }
    finally { setLoading(false); }
  }, [playerId, token]);

  useEffect(() => { void load(); }, [load]);

  async function startPlan() {
    if (!startDate) return;
    setBusy(true);
    try {
      await fetch(`/api/coach/return-to-training/${playerId}`, { method: "PUT", headers: { "content-type": "application/json", Authorization: `Bearer ${await token()}` }, body: JSON.stringify({ rttStartDate: startDate }) });
      await load();
    } finally { setBusy(false); }
  }

  // Week 1 targets (the actionable "this week") + the full plan grid.
  const week1 = useMemo(() => (data?.plan ? data.plan.weeks.filter((w) => w.week === 1) : []), [data]);

  if (loading) return <div className="p-6 text-sm text-slate-500">{is ? "Hleð…" : "Loading…"}</div>;
  if (err || !data) return <div className="p-6"><div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err ?? "No data"}</div></div>;

  const conf = data.confidence;
  const confColor = conf === "high" ? "text-emerald-700 bg-emerald-50 border-emerald-200" : conf === "medium" ? "text-amber-700 bg-amber-50 border-amber-200" : "text-slate-600 bg-slate-50 border-slate-200";

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900">{data.player.name}</h1>
            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-indigo-700">{is ? "Aftur í æfingar" : "Return-to-training"}</span>
            {data.currentlyInjured && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-red-700">{is ? "Meiddur núna" : "Currently injured"}</span>}
          </div>
          <div className={`mt-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${confColor}`} title={is ? "Þroski grunnlínu — fjöldi heilbrigðra æfinga sem loftið er byggt á" : "Baseline maturity — how many healthy sessions the ceiling is built from"}>
            {is ? "Vissa" : "Confidence"}: {conf} · {data.baseline.builtFromHealthySessions} {is ? "heilbrigðar æfingar" : "healthy sessions"}
          </div>
        </div>
      </div>

      {/* Injury source disagreement (surface, don't resolve) */}
      {data.injuryDiscrepancy && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {is ? "Meiðsla-skrár eru ósammála um tegund — báðir gluggar eru notaðir (sameining). Staðfestu réttu skráninguna." : "Injury records disagree on type — both windows are used (union). Confirm the correct record."}
        </div>
      )}
      {data.headInjury && (
        <div className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-800">
          {is ? "Höfuðáverki: endurkoma er einkenna-stýrð (HIA/GRTP). Álagið er ÞAK, ekki kveikja — það má aldrei færa stig sjálfkrafa." : "Head injury: graded return is symptom-limited (HIA/GRTP). Load is a CEILING, not a trigger — it never advances a stage on its own."}
        </div>
      )}

      {/* Load history timeline */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-800">{is ? "Álagssaga" : "Load history"}</div>
          <label className="flex items-center gap-1.5 text-xs text-slate-500">
            <input type="checkbox" checked={showMatches} onChange={(e) => setShowMatches(e.target.checked)} />
            {is ? "Sýna leiki" : "Show matches"}
          </label>
        </div>
        <Timeline history={data.history} windows={data.injuryWindows} showMatches={showMatches} />
        <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-slate-400">
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm bg-slate-400" /> {is ? "Vegalengd (heilbrigt)" : "Distance (healthy)"}</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm bg-red-300" /> {is ? "Meiddur gluggi" : "Injury window"}</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm bg-amber-400" /> {is ? "Áætlað" : "Estimated"}</span>
          <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-3 bg-sky-500" /> {is ? "Hæsti hraði" : "Top speed"}</span>
        </div>
      </div>

      {/* Plan */}
      {data.currentlyInjured && !data.rttStartDate ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm font-semibold text-slate-800">{is ? "Meiddur núna — engin stiguð endurkoma hafin" : "Currently injured — no graded return started"}</div>
          <p className="mt-1 text-sm text-slate-600">
            {is ? "Áætlunin er verkfæri sem þjálfari/sjúkraþjálfari ræsir — hún keyrir ekki sjálfkrafa á meiddan leikmann. Veldu upphafsdag til að byrja stigaða endurkomu." : "The plan is a tool the coach/physio starts — it never auto-runs on an injured athlete. Pick a start date to begin the graded return."}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-9 rounded-lg border border-slate-300 px-3 text-sm" />
            <button type="button" onClick={startPlan} disabled={!startDate || busy} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
              {busy ? "…" : (is ? "Ræsa endurkomu" : "Start return-to-training")}
            </button>
          </div>
        </div>
      ) : data.plan ? (
        <>
          {/* Verdict (layer 0) */}
          <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 px-4 py-3">
            <div className="text-base font-bold text-indigo-900">{data.plan.verdict}</div>
            <div className="mt-0.5 text-xs text-indigo-700/80">{is ? "Loftið = hans eigin heilbrigða grunnlína. Hvert markmið sýnir % af henni." : "Ceiling = his own healthy baseline. Each target shows its % of it."}</div>
          </div>

          {/* This week's per-quality targets (layer 1) */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {week1.map((w) => (
              <QualityCard key={w.quality} w={w} floor={data.floor[w.quality]} ceiling={data.baseline[w.quality]} is={is} />
            ))}
          </div>

          {/* Progression ladder */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-2 text-sm font-semibold text-slate-800">{is ? "Framvindu-stigi" : "Progression ladder"}</div>
            <div className="space-y-1.5">
              {ORDER.map((q, qi) => {
                const uw = data.plan!.weeks.find((w) => w.quality === q)?.unlockWeek ?? qi + 1;
                return (
                  <div key={q} className="flex items-center gap-3 text-sm">
                    <span className="w-6 text-right text-xs text-slate-400">{qi + 1}</span>
                    <span className="flex-1 font-medium text-slate-700">{is ? LABEL[q].is : LABEL[q].en}{q === "cod" ? <span className="ml-1 text-[10px] text-rose-500">({is ? "síðast — mest meiðsla-hætta" : "last — most re-injury-prone"})</span> : null}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">{is ? `opnast viku ${uw}` : `unlocks week ${uw}`}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Layer 2 — raw plan grid + history */}
          <button type="button" onClick={() => setShowDetails((v) => !v)} className="text-xs font-semibold text-slate-500 hover:text-slate-700">
            {showDetails ? (is ? "Fela smáatriði ▲" : "Hide details ▲") : (is ? "Sýna smáatriði (full áætlun · hrá saga) ▼" : "Show details (full plan · raw history) ▼")}
          </button>
          {showDetails && (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <table className="w-full text-xs">
                <thead><tr className="text-left text-slate-500"><th className="py-1 pr-2">{is ? "Vika" : "Week"}</th>{ORDER.map((q) => <th key={q} className="py-1 pr-2">{is ? LABEL[q].is : LABEL[q].en}</th>)}</tr></thead>
                <tbody>
                  {Array.from(new Set(data.plan.weeks.map((w) => w.week))).map((wk) => (
                    <tr key={wk} className="border-t">
                      <td className="py-1 pr-2 font-medium text-slate-700">{wk}</td>
                      {ORDER.map((q) => {
                        const cell = data.plan!.weeks.find((w) => w.week === wk && w.quality === q)!;
                        return <td key={q} className={`py-1 pr-2 tabular-nums ${cell.locked ? "text-slate-300" : "text-slate-700"}`}>{cell.locked ? "—" : `${f0(cell.target)} (${cell.acwr.toFixed(2)})`}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-2 text-[10px] text-slate-400">{is ? "Gildi (ACWR). ACWR = bráða:krónískt álag (Gabbett/Williams) — lýsir stökk-stærð, ekki meiðsla-spá. Reglur reikna." : "value (ACWR). ACWR = acute:chronic workload (Gabbett/Williams) — a spike-size descriptor, not an injury predictor. Rules compute."}</div>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

function QualityCard({ w, floor, ceiling, is }: { w: WeekTarget; floor: number; ceiling: number; is: boolean }) {
  const label = is ? LABEL[w.quality].is : LABEL[w.quality].en;
  const acwrColor = w.acwr > 1.3 ? "bg-red-100 text-red-700" : w.acwr >= 0.8 ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600";
  return (
    <div className={`rounded-xl border p-3 shadow-sm ${w.locked ? "border-slate-200 bg-slate-50" : "border-slate-200 bg-white"}`}>
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-800">{label}</div>
        {w.locked ? (
          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-500">{is ? `læst · vika ${w.unlockWeek}` : `hold · wk ${w.unlockWeek}`}</span>
        ) : (
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${acwrColor}`} title="acute:chronic workload ratio">ACWR {w.acwr.toFixed(2)}</span>
        )}
      </div>
      {!w.locked && (
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className="text-2xl font-bold tabular-nums text-slate-900">{f0(w.target)}</span>
          <span className="text-xs text-slate-400">{LABEL[w.quality].unit}</span>
          <span className="ml-auto text-[11px] text-slate-500">{is ? "af" : "of"} {f0(ceiling)} ({w.pctOfHealthy}%)</span>
        </div>
      )}
      <p className="mt-1 text-[11px] leading-snug text-slate-500">{w.why}</p>
      {!w.locked && <div className="mt-1 text-[10px] text-slate-400">{is ? "núna" : "now"} {f0(floor)} → {f0(w.target)}{w.wow ? ` · ${w.wow > 0 ? "+" : ""}${w.wow}%` : ""}</div>}
    </div>
  );
}

/** Compact injury-shaded timeline: distance bars + top-speed line (pure SVG). */
function Timeline({ history, windows, showMatches }: { history: Session[]; windows: Win[]; showMatches: boolean }) {
  const rows = history.filter((s) => showMatches || !s.isMatch);
  if (!rows.length) return <div className="py-8 text-center text-xs text-slate-400">No sessions</div>;
  const W = 900, H = 180, padL = 8, padR = 8, padT = 8, padB = 18;
  const n = rows.length;
  const bw = Math.max(2, (W - padL - padR) / n - 1);
  const maxDist = Math.max(1, ...rows.map((s) => s.distance));
  const maxSpeed = Math.max(1, ...rows.map((s) => s.topSpeed));
  const x = (i: number) => padL + (i * (W - padL - padR)) / n;
  const yD = (v: number) => H - padB - (v / maxDist) * (H - padT - padB);
  const yS = (v: number) => H - padB - (v / maxSpeed) * (H - padT - padB);
  const inWin = (d: string) => windows.some((w) => d >= w.start && d <= w.end);
  const speedPts = rows.map((s, i) => `${(x(i) + bw / 2).toFixed(1)},${(s.topSpeed > 0 ? yS(s.topSpeed) : H - padB).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 200 }}>
      {rows.map((s, i) => {
        const injured = inWin(s.date);
        const fill = s.estimated ? "#fbbf24" : injured ? "#fca5a5" : s.isMatch ? "#c4b5fd" : "#94a3b8";
        return <rect key={s.date + i} x={x(i)} y={yD(s.distance)} width={bw} height={Math.max(0, H - padB - yD(s.distance))} fill={fill} rx={1} />;
      })}
      <polyline points={speedPts} fill="none" stroke="#0ea5e9" strokeWidth={1.5} />
      {/* month ticks */}
      {rows.map((s, i) => (i % Math.ceil(n / 8) === 0 ? <text key={"t" + i} x={x(i)} y={H - 4} fontSize={9} fill="#94a3b8">{s.date.slice(5)}</text> : null))}
    </svg>
  );
}
