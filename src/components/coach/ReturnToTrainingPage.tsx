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

type Quality = "volume" | "distance" | "hsr" | "sprint" | "accel" | "decel" | "decelHigh" | "cod";
const ORDER: Quality[] = ["volume", "distance", "hsr", "sprint", "accel", "decel", "decelHigh", "cod"];
const LABEL: Record<Quality, { en: string; is: string; unit: string }> = {
  volume: { en: "Weekly player load", is: "Vikuálag", unit: "" },
  distance: { en: "Weekly distance", is: "Vikuvegalengd", unit: "m" },
  hsr: { en: "Weekly high-speed running", is: "Vikuháhraðahlaup", unit: "m" },
  sprint: { en: "Weekly sprinting", is: "Vikusprettur", unit: "m" },
  accel: { en: "Accelerations (IMA)", is: "Hröðun (IMA)", unit: "" },
  decel: { en: "Decelerations (IMA)", is: "Hemlun (IMA)", unit: "" },
  decelHigh: { en: "High-intensity braking (IMA)", is: "Háákefðar hemlun (IMA)", unit: "" },
  cod: { en: "Change of direction (IMA)", is: "Stefnubreytingar (IMA)", unit: "" },
};

type Session = { date: string; injured: boolean; isMatch: boolean; estimated: boolean; load: number; distance: number; hsr: number; sprint: number; cod: number; topSpeed: number };
type Win = { start: string; end: string; type: string; source: string; isActive: boolean };
type WeekTarget = { week: number; quality: Quality; target: number; pctOfHealthy: number; wow: number; acwr: number; locked: boolean; unlockWeek: number; caution: boolean; why: string };
type InjuryProfile = { category: string; label: { en: string; is: string }; riskQualities: Quality[] };
type Resp = {
  player: { id: string; name: string };
  history: Session[];
  injuryWindows: Win[];
  injuryDiscrepancy: boolean;
  headInjury: boolean;
  injuryProfile?: InjuryProfile;
  currentlyInjured: boolean;
  rttStartDate: string | null;
  baseline: Record<Quality, number> & { builtFromHealthyWeeks: number; topSpeed: number };
  floor: Record<Quality, number> & { topSpeed: number };
  rampFrom?: Record<Quality, number> & { topSpeed: number };
  layoff?: { days: number | null; retainedPct: number | null; rampWeeks: number };
  asymmetry: { healthyLeftPct: number | null; currentLeftPct: number | null; imbalanced: boolean };
  plan: { verdict: string; currentWeek: number; weeks: WeekTarget[] } | null;
  adherence?: AdherenceWeek[];
  confidence: "high" | "medium" | "low";
  error?: string;
};
type AdherenceCell = { quality: Quality; target: number; actual: number; deltaPct: number; status: "under" | "on" | "over" };
type AdherenceWeek = { week: number; weekStart: string; sessions: number; inProgress: boolean; cells: AdherenceCell[] };

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

  // The CURRENT plan week (the actionable "this week") — its targets, the actual
  // load he has logged against them, and that week's sessions.
  const curWeek = data?.plan?.currentWeek ?? 1;
  const weekNow = useMemo(() => (data?.plan ? data.plan.weeks.filter((w) => w.week === curWeek) : []), [data, curWeek]);
  const curAdh = useMemo(() => data?.adherence?.find((a) => a.week === curWeek) ?? null, [data, curWeek]);
  const actualByQ = useMemo(() => {
    const m = new Map<Quality, AdherenceCell>();
    curAdh?.cells.forEach((c) => m.set(c.quality, c));
    return m;
  }, [curAdh]);
  // The real sessions that fall inside the current plan week (Mon–Sun of weekStart).
  const weekSessions = useMemo(() => {
    if (!curAdh) return [];
    const start = curAdh.weekStart;
    const end = new Date(`${start}T00:00:00Z`); end.setUTCDate(end.getUTCDate() + 7);
    const endIso = end.toISOString().slice(0, 10);
    return (data?.history ?? []).filter((s) => !s.estimated && s.date >= start && s.date < endIso).sort((a, b) => a.date.localeCompare(b.date));
  }, [data, curAdh]);

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
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${confColor}`} title={is ? "Þroski grunnlínu — fjöldi heilbrigðra vikna sem loftið er byggt á" : "Baseline maturity — how many healthy weeks the ceiling is built from"}>
              {is ? "Vissa" : "Confidence"}: {conf} · {data.baseline.builtFromHealthyWeeks} {is ? "heilbrigðar vikur" : "healthy weeks"}
            </span>
            {data.layoff?.days != null && (
              <span className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] text-indigo-700" title={is ? "Lengd fjarveru ræður hversu hátt og lengi upptröppunin er — stutt fjarvera heldur mestu álagsþoli (detraining)." : "Layoff length sets how high and long the ramp is — a short layoff keeps most capacity (detraining)."}>
                {data.layoff.days} {is ? "daga frá" : "day layoff"} · ~{data.layoff.retainedPct}% {is ? "álagsþol eftir" : "capacity"} · {data.layoff.rampWeeks} {is ? "vikna plan" : "wk plan"}
              </span>
            )}
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
      {/* Injury-type awareness: the injury's key re-injury qualities ramp slower. */}
      {!data.headInjury && data.injuryProfile && data.injuryProfile.riskQualities.length > 0 && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-800">
          <span className="font-semibold">{is ? "Meiðsla-aðlögun: " : "Injury-specific: "}</span>
          {is ? data.injuryProfile.label.is : data.injuryProfile.label.en}. {" "}
          {is ? "Þessi gæði aukast hægar (7%/viku) og eru sett inn lægra." : "These qualities ramp more slowly (7%/week) and start lower."}
          <span className="ml-1">({data.injuryProfile.riskQualities.map((q) => (is ? LABEL[q].is : LABEL[q].en)).join(", ")})</span>
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

      {/* L/R change-of-direction asymmetry — monitor (not ramp), key after a one-sided injury. */}
      {data.asymmetry.currentLeftPct != null && (
        <div className={`rounded-xl border p-4 shadow-sm ${data.asymmetry.imbalanced ? "border-rose-200 bg-rose-50/60" : "border-slate-200 bg-white"}`}>
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-800">{is ? "Vinstri / hægri stefnubreytingar (jafnvægi)" : "Change-of-direction L / R balance"}</div>
            {data.asymmetry.imbalanced && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-rose-700">{is ? "ójafnvægi" : "imbalanced"}</span>}
          </div>
          <div className="mt-2 flex items-center gap-4 text-sm">
            <div><span className="text-slate-400">{is ? "Núna" : "Now"}:</span> <span className="font-semibold text-slate-800">{data.asymmetry.currentLeftPct}% {is ? "vinstri" : "left"} / {100 - (data.asymmetry.currentLeftPct ?? 0)}% {is ? "hægri" : "right"}</span></div>
            {data.asymmetry.healthyLeftPct != null && <div className="text-slate-400">{is ? "heilbrigt" : "healthy"}: {data.asymmetry.healthyLeftPct}% {is ? "vinstri" : "left"}</div>}
          </div>
          <p className="mt-1 text-[11px] leading-snug text-slate-500">
            {is ? "Fylgst með — ekki stigmagnað. Eftir einhliða meiðsli getur leikmaður forðast meidda hliðina; markmið er að ná aftur hans eðlilega jafnvægi." : "Monitored, not ramped. After a one-sided injury a player can avoid the injured side; the goal is to restore his normal balance."}
          </p>
        </div>
      )}

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

          {/* This week's per-quality targets — recommended vs actual (layer 1) */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {weekNow.map((w) => (
              <QualityCard key={w.quality} w={w} floor={data.floor[w.quality]} ceiling={data.baseline[w.quality]} actual={actualByQ.get(w.quality)} is={is} />
            ))}
          </div>

          {/* Actual load this week vs the recommended ramp — closes the loop */}
          {curAdh && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-slate-800">
                  {is ? `Raunálag · vika ${curAdh.week}` : `Actual load · week ${curAdh.week}`}
                  {curAdh.inProgress && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-700">{is ? "í gangi" : "in progress"}</span>}
                </div>
                <div className="text-[11px] text-slate-500">{curAdh.sessions} {is ? "æfingar/leikir í vikunni" : "sessions this week"}</div>
              </div>
              {/* Per-session load */}
              {weekSessions.length ? (
                <div className="mb-3 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="text-left text-slate-400"><th className="py-1 pr-3 font-medium">{is ? "Dagur" : "Day"}</th><th className="py-1 pr-3 font-medium">{is ? "Álag" : "Load"}</th><th className="py-1 pr-3 font-medium">{is ? "Vegalengd" : "Distance"}</th><th className="py-1 pr-3 font-medium">{is ? "Háhraði" : "HSR"}</th><th className="py-1 pr-3 font-medium">{is ? "Sprettur" : "Sprint"}</th><th className="py-1 pr-3 font-medium">{is ? "Tegund" : "Type"}</th></tr></thead>
                    <tbody>
                      {weekSessions.map((s) => (
                        <tr key={s.date} className="border-t border-slate-100">
                          <td className="py-1 pr-3 tabular-nums text-slate-600">{s.date.slice(5)}</td>
                          <td className="py-1 pr-3 tabular-nums font-semibold text-slate-800">{f0(s.load)}</td>
                          <td className="py-1 pr-3 tabular-nums text-slate-600">{f0(s.distance)} m</td>
                          <td className="py-1 pr-3 tabular-nums text-slate-600">{f0(s.hsr)} m</td>
                          <td className="py-1 pr-3 tabular-nums text-slate-600">{f0(s.sprint)} m</td>
                          <td className="py-1 pr-3 text-slate-500">{s.isMatch ? (is ? "leikur" : "match") : s.injured ? (is ? "meiddur" : "injured") : (is ? "æfing" : "training")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="mb-2 text-xs text-slate-400">{is ? "Engar æfingar skráðar í vikunni enn." : "No sessions logged this week yet."}</p>
              )}
              {/* Weekly total vs recommended, per quality */}
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {curAdh.cells.filter((c) => c.target > 0 || c.actual > 0).map((c) => (
                  <AdherenceBar key={c.quality} c={c} inProgress={curAdh.inProgress} is={is} />
                ))}
              </div>
              <div className="mt-2 text-[10px] text-slate-400">{is ? "Raunverulegt vikuálag borið saman við það sem mælt var með. Í gangi-vika er hluti — „undir“ þýðir ekki á eftir." : "Actual weekly load vs what was recommended. An in-progress week is partial — “under” isn’t behind."}</div>
            </div>
          )}

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
                  {Array.from(new Set(data.plan.weeks.map((w) => w.week))).map((wk) => {
                    const adh = data.adherence?.find((a) => a.week === wk);
                    return (
                    <tr key={wk} className="border-t">
                      <td className="py-1 pr-2 font-medium text-slate-700">{wk}{adh ? <span className="ml-1 text-[9px] text-slate-400">{adh.inProgress ? (is ? "· nú" : "· now") : "✓"}</span> : null}</td>
                      {ORDER.map((q) => {
                        const cell = data.plan!.weeks.find((w) => w.week === wk && w.quality === q)!;
                        const act = adh?.cells.find((c) => c.quality === q);
                        return (
                          <td key={q} className={`py-1 pr-2 tabular-nums ${cell.locked ? "text-slate-300" : "text-slate-700"}`}>
                            {cell.locked ? "—" : `${f0(cell.target)} (${cell.acwr.toFixed(2)})`}
                            {act && (act.actual > 0 || act.target > 0) && !cell.locked && (
                              <span className={`ml-1 ${act.status === "over" ? "text-rose-600" : act.status === "under" ? "text-slate-400" : "text-emerald-600"}`}>· {f0(act.actual)}</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="mt-2 text-[10px] text-slate-400">{is ? "Markmið (ACWR) · raunálag. ACWR = bráða:krónískt álag (Gabbett/Williams) — lýsir stökk-stærð, ekki meiðsla-spá. Reglur reikna." : "target (ACWR) · actual. ACWR = acute:chronic workload (Gabbett/Williams) — a spike-size descriptor, not an injury predictor. Rules compute."}</div>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

function QualityCard({ w, floor, ceiling, actual, is }: { w: WeekTarget; floor: number; ceiling: number; actual?: AdherenceCell; is: boolean }) {
  const label = is ? LABEL[w.quality].is : LABEL[w.quality].en;
  const acwrColor = w.acwr > 1.3 ? "bg-red-100 text-red-700" : w.acwr >= 0.8 ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600";
  return (
    <div className={`rounded-xl border p-3 shadow-sm ${w.locked ? "border-slate-200 bg-slate-50" : "border-slate-200 bg-white"}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
          {label}
          {w.caution && <span className="rounded-full bg-orange-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-orange-700" title={is ? "Lykil-endurmeiðsla-gæði fyrir þetta meiðsli — hægari aðlögun" : "Key re-injury quality for this injury — slower ramp"}>{is ? "gát" : "caution"}</span>}
        </div>
        {w.locked ? (
          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-500">{is ? `læst · vika ${w.unlockWeek}` : `hold · wk ${w.unlockWeek}`}</span>
        ) : (
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${acwrColor}`} title="acute:chronic workload ratio">ACWR {w.acwr.toFixed(2)}</span>
        )}
      </div>
      {!w.locked && ceiling <= 0 ? (
        <p className="mt-1 text-[11px] text-slate-400">{is ? "Engin heilbrigð grunnlína fyrir þessa breytu (t.d. ekkert IMA)." : "No healthy baseline for this quality (e.g. no IMA captured)."}</p>
      ) : !w.locked ? (
        <>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold tabular-nums text-slate-900">{f0(w.target)}</span>
            <span className="text-xs text-slate-400">{LABEL[w.quality].unit}</span>
            <span className="ml-auto text-[11px] text-slate-500">{is ? "af" : "of"} {f0(ceiling)} ({w.pctOfHealthy}%)</span>
          </div>
          <p className="mt-1 text-[11px] leading-snug text-slate-500">{w.why}</p>
          <div className="mt-1 text-[10px] text-slate-400">{is ? "núna" : "now"} {f0(floor)} → {f0(w.target)}{w.wow ? ` · ${w.wow > 0 ? "+" : ""}${w.wow}%` : ""}</div>
          {actual && (actual.actual > 0 || actual.target > 0) && (
            <div className="mt-1.5 flex items-center gap-1.5 border-t border-slate-100 pt-1.5 text-[11px]">
              <span className="text-slate-400">{is ? "raun" : "actual"}</span>
              <span className="font-semibold tabular-nums text-slate-800">{f0(actual.actual)}</span>
              <span className={`ml-auto rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase ${actual.status === "over" ? "bg-rose-100 text-rose-700" : actual.status === "under" ? "bg-slate-100 text-slate-500" : "bg-emerald-100 text-emerald-700"}`}>
                {actual.status === "over" ? (is ? "yfir" : "over") : actual.status === "under" ? (is ? "undir" : "under") : (is ? "á áætlun" : "on plan")} {actual.deltaPct > 0 ? "+" : ""}{actual.deltaPct}%
              </span>
            </div>
          )}
        </>
      ) : (
        <p className="mt-1 text-[11px] leading-snug text-slate-500">{w.why}</p>
      )}
    </div>
  );
}

/** Actual vs recommended for one quality this week — a bar filled to actual/target. */
function AdherenceBar({ c, inProgress, is }: { c: AdherenceCell; inProgress: boolean; is: boolean }) {
  const label = is ? LABEL[c.quality].is : LABEL[c.quality].en;
  const pct = c.target > 0 ? Math.min(140, Math.round((c.actual / c.target) * 100)) : c.actual > 0 ? 140 : 0;
  const color = c.status === "over" ? "bg-rose-500" : c.status === "under" ? "bg-slate-300" : "bg-emerald-500";
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-2">
      <div className="flex items-baseline justify-between text-[11px]">
        <span className="truncate font-medium text-slate-600" title={label}>{label}</span>
        <span className="tabular-nums text-slate-400">{f0(c.actual)} / {f0(c.target)}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <div className="mt-0.5 text-right text-[10px] text-slate-400">
        {c.target > 0 ? <>{c.deltaPct > 0 ? "+" : ""}{c.deltaPct}% {inProgress && c.status === "under" ? (is ? "hingað til" : "so far") : ""}</> : (is ? "engin viðmiðun" : "no target")}
      </div>
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
