"use client";

/**
 * Conditioning profile (Critical Speed) — CS + D′, the running form of the critical-power
 * model. Sources, honestly distinguished (best first):
 *   • FIELD TEST — CS/D′ from genuine maximal efforts the coach records (e.g. a 4-min "go as far
 *     as you can" run). Two+ efforts of different lengths → a true fit.
 *   • 4-MIN TEST + PEAKS — the recorded 4-min maximal run anchors the fit, completed with only the
 *     session peak windows that stay physically consistent with it (the rest are dropped).
 *   • ESTIMATE (fallback, no test on file) — fitted from the distance power curve's peak windows,
 *     which are the hardest passages of normal sessions, not all-out tests → it under-reads.
 * Descriptive conditioning context — never touches readiness. Bilingual EN/IS.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import ShowDetails from "@/components/common/ShowDetails";
import { computeAnaerobicTank, type CriticalSpeedRead, type CsCombinedResult, type CsTestRead } from "@/lib/micropulse/load/criticalSpeed";

type CurvePoint = { windowMin: number; value: number | null };
type LatestMatch = { date: string; minutes: number | null; aboveCsDistanceM: number | null };
type PeakResp = {
  ok: boolean; peakPeriod?: { seasonBest?: Array<{ metric: string; points: CurvePoint[] }> };
  criticalSpeed?: CsCombinedResult; latestMatch?: LatestMatch | null;
};
type TestEffortRow = { id: string; test_date: string; duration_min: number | string; distance_m: number | string };
type TestResp = { ok: boolean; efforts?: TestEffortRow[]; read?: CsTestRead };

const CONF_TONE: Record<string, string> = { high: "bg-emerald-100 text-emerald-700", medium: "bg-amber-100 text-amber-800", low: "bg-slate-100 text-slate-500" };
const confLabel = (c: string, is: boolean) => (c === "high" ? (is ? "full vissa" : "high") : c === "medium" ? (is ? "miðlungs" : "medium") : (is ? "lítil vissa" : "low"));

/** Distance–time plot: observed points + the fitted CS/D′ line. */
function FitSvg({ pts, cs, dPrime }: { pts: Array<{ t: number; D: number }>; cs: number; dPrime: number }) {
  const W = 300, H = 130, padL = 40, padR = 10, padT = 10, padB = 24;
  if (pts.length < 2) return null;
  const maxT = Math.max(...pts.map((p) => p.t));
  const maxD = Math.max(...pts.map((p) => p.D), dPrime + cs * maxT);
  const x = (t: number) => padL + (t / maxT) * (W - padL - padR);
  const y = (d: number) => padT + (1 - (maxD > 0 ? d / maxD : 0)) * (H - padT - padB);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="critical speed fit">
      <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke="#e2e8f0" />
      <line x1={padL} y1={padT} x2={padL} y2={H - padB} stroke="#e2e8f0" />
      <line x1={x(0)} y1={y(dPrime)} x2={x(maxT)} y2={y(dPrime + cs * maxT)} stroke="#2740e6" strokeWidth="2" />
      <circle cx={x(0)} cy={y(dPrime)} r="2.5" fill="#94a3b8" />
      <text x={x(0) + 4} y={y(dPrime) - 4} fontSize="8" fill="#94a3b8">D′</text>
      {pts.map((p) => (
        <g key={p.t}>
          <circle cx={x(p.t)} cy={y(p.D)} r="3" fill="#2740e6" />
          <text x={x(p.t)} y={H - padB + 12} textAnchor="middle" fontSize="8" fill="#64748b">{p.t}m</text>
        </g>
      ))}
      <text x={padL - 4} y={padT + 6} textAnchor="end" fontSize="8" fill="#94a3b8">m</text>
    </svg>
  );
}

function CsReadBlock({ cs, sourceLabel, strong, pts, is }: { cs: CriticalSpeedRead; sourceLabel: { en: string; is: string }; strong: boolean; pts: Array<{ t: number; D: number }>; is: boolean }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${strong ? "bg-[#2740e6]/10 text-[#2740e6]" : "bg-slate-100 text-slate-500"}`}>
          {is ? sourceLabel.is : sourceLabel.en}
        </span>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${CONF_TONE[cs.confidence]}`}>{confLabel(cs.confidence, is)}</span>
      </div>
      <p className="text-[15px] font-bold text-slate-900">{is ? cs.verdict.is : cs.verdict.en}</p>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px] text-slate-700">
        <span>Critical speed: <b className="tabular-nums">{cs.csKmh} km/h</b> <span className="text-slate-400">({cs.csMs} m/s)</span></span>
        <span>{is ? "Forði (D′)" : "Reserve (D′)"}: <b className="tabular-nums">{cs.dPrimeM} m</b></span>
        {cs.csPercentile != null ? <span className="text-[12px] text-slate-500">{is ? "CS m.v. lið" : "CS vs squad"}: {cs.csPercentile}%</span> : null}
      </div>
      <ShowDetails label={{ EN: "Show the fit", IS: "Sýna aðhvarfið" }}>
        <FitSvg pts={pts} cs={cs.csMetresPerMin!} dPrime={cs.dPrimeM!} />
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
          <span>R² <b className="tabular-nums text-slate-700">{cs.rSquared}</b></span>
          <span>{is ? "punktar" : "points"} <b className="tabular-nums text-slate-700">{cs.nPoints}</b></span>
          <span>CS <b className="tabular-nums text-slate-700">{cs.csMetresPerMin} m/min</b></span>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{is ? cs.caveat.is : cs.caveat.en}</p>
        <p className="mt-1 text-[10px] text-slate-400">{cs.citation}</p>
      </ShowDetails>
    </div>
  );
}

export default function CriticalSpeedCard({ players }: { players: Array<{ id: string; name: string }> }) {
  const [lang] = useLang();
  const is = lang === "IS";
  const [sel, setSel] = React.useState("");
  const [peak, setPeak] = React.useState<PeakResp | null>(null);
  const [test, setTest] = React.useState<TestResp | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [dur, setDur] = React.useState("");
  const [dist, setDist] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  const token = React.useCallback(async () => (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? null, []);
  React.useEffect(() => { if (!sel && players.length) setSel(players[0].id); }, [players, sel]);

  const load = React.useCallback(async () => {
    if (!sel) { setPeak(null); setTest(null); return; }
    setLoading(true);
    try {
      const tok = await token(); if (!tok) return;
      const h = { Authorization: `Bearer ${tok}` };
      const [pr, tr] = await Promise.all([
        fetch(`/api/coach/load/peak-period?player=${sel}`, { headers: h, cache: "no-store" }).then((r) => r.json()).catch(() => null),
        fetch(`/api/coach/player/${sel}/cs-test`, { headers: h, cache: "no-store" }).then((r) => r.json()).catch(() => null),
      ]);
      setPeak(pr && pr.ok ? pr : null);
      setTest(tr && tr.ok ? tr : null);
    } finally { setLoading(false); }
  }, [sel, token]);
  React.useEffect(() => { setMsg(null); setDur(""); setDist(""); void load(); }, [load]);

  async function save() {
    const durationMin = Number(dur), distanceM = Number(dist);
    if (!Number.isFinite(durationMin) || durationMin <= 0 || durationMin > 60) { setMsg(is ? "Lengd 0–60 mín." : "Duration 0–60 min."); return; }
    if (!Number.isFinite(distanceM) || distanceM <= 0 || distanceM >= 20000) { setMsg(is ? "Vegalengd 0–20000 m." : "Distance 0–20000 m."); return; }
    setBusy(true); setMsg(null);
    try {
      const tok = await token(); if (!tok) return;
      const res = await fetch(`/api/coach/player/${sel}/cs-test`, { method: "POST", headers: { Authorization: `Bearer ${tok}`, "content-type": "application/json" }, body: JSON.stringify({ durationMin, distanceM }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) { setMsg(j.error ?? "Error"); return; }
      setDur(""); setDist(""); await load();
    } finally { setBusy(false); }
  }

  // Preference: a pure field-test fit (≥2 real maximal efforts) > the test-anchored combined fit
  // (a 4-min max + guardrailed session peaks) > the plain MII estimate.
  const combined = peak?.criticalSpeed ?? null;
  const testCs = test?.read?.cs && test.read.cs.csMetresPerMin != null ? test.read.cs : null;
  const combinedCs = combined && combined.csMetresPerMin != null && (combined.usedTestAnchor || combined.confidence !== "low") ? combined : null;
  const primary: CriticalSpeedRead | null = testCs ?? combinedCs;

  const efforts = (test?.efforts ?? []).map((e) => ({ t: Number(e.duration_min), D: Number(e.distance_m) })).sort((a, b) => a.t - b.t);
  const combinedPts = (combined?.fitPoints ?? []).map((p) => ({ t: p.t, D: p.D })).sort((a, b) => a.t - b.t);
  const primaryPts = testCs ? efforts : combinedPts;
  // Anaerobic "tank" over the latest match — tankfuls = above-CS distance ÷ D′ of the shown CS.
  const tank = primary
    ? computeAnaerobicTank({
        dPrimeM: primary.dPrimeM, aboveCsDistanceM: peak?.latestMatch?.aboveCsDistanceM ?? null,
        matchDate: peak?.latestMatch?.date ?? null, minutes: peak?.latestMatch?.minutes ?? null,
      })
    : null;
  const strong = Boolean(testCs) || Boolean(combinedCs?.usedTestAnchor);
  const sourceLabel = testCs
    ? { en: "field test", is: "úr prófi" }
    : combinedCs?.usedTestAnchor
      ? { en: "4-min test + peaks", is: "4-mín próf + toppar" }
      : { en: "estimate · match peaks", is: "áætlun · leik-toppar" };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold text-slate-800">{is ? "Úthalds-prófíll (Critical Speed)" : "Conditioning profile (Critical Speed)"}</span>
        <span className="cursor-help rounded bg-[#2740e6]/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#2740e6]"
          title={is
            ? "CS = hraðinn sem hann getur haldið (D = D′ + CS·t). Fest við 4-mín hámarkspróf ef til (+ topp-gluggar sem standast), annars ÁÆTLUN úr leik-toppum (vanmetur). Ekki W/kg."
            : "CS = the pace he can sustain (D = D′ + CS·t). Anchored on the 4-min maximal test when on file (+ the peak windows that stay consistent), else an ESTIMATE from match peaks (under-reads). Not W/kg."}>
          {is ? "CS · D′ ⓘ" : "CS · D′ ⓘ"}
        </span>
        <select value={sel} onChange={(e) => setSel(e.target.value)} className="ml-auto rounded-lg border border-slate-300 px-2 py-1 text-[13px]">
          {players.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {loading ? <p className="mt-3 text-[13px] text-slate-400">…</p> : null}

      {!loading ? (
        <div className="mt-3 space-y-3">
          {/* Primary read: a fitted CS/D′ when we have one, else an honest "add an effort" state. */}
          {primary ? (
            <CsReadBlock cs={primary} sourceLabel={sourceLabel} strong={strong} pts={primaryPts} is={is} />
          ) : combined?.usedTestAnchor ? (
            // A 4-min max is on file but the session peaks can't pin the curve → ask for a shorter effort.
            <p className="rounded-lg border border-[#2740e6]/20 bg-[#2740e6]/5 px-3 py-2 text-[13px] text-slate-700">
              {is ? combined.verdict.is : combined.verdict.en}
            </p>
          ) : (
            <p className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-[13px] text-slate-500">
              {is ? "Ekki næg gögn enn — skráðu hámarks-próf hér að neðan, eða bíddu eftir fleiri lotum." : "Not enough data yet — record a maximal test below, or wait for more sessions."}
            </p>
          )}

          {/* Anaerobic tank over the latest match — how many times he spent & refilled D′. */}
          {tank ? (
            <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-[12px] font-semibold text-slate-600">{is ? "Loftfirrtur forði í leik" : "Anaerobic reserve in a match"}</span>
                {tank.matchDate ? <span className="text-[11px] text-slate-400">{tank.matchDate}{tank.minutes != null ? ` · ${tank.minutes} ${is ? "mín" : "min"}` : ""}</span> : null}
              </div>
              <p className="mt-1 text-[13px] text-slate-800">
                <b className="tabular-nums">~{Math.round(tank.tankfuls)}×</b> {is ? "tankfyllingar" : "tankfuls"}
                <span className="text-slate-400"> — {tank.aboveCsDistanceM} m {is ? "yfir CS" : "above CS"} ÷ {tank.dPrimeM} m {is ? "tankur" : "tank"}</span>
              </p>
              <p className="text-[12px] text-slate-500">{is ? tank.profile.is : tank.profile.en}</p>
              <ShowDetails label={{ EN: "What is this?", IS: "Hvað er þetta?" }}>
                <p className="text-[11px] leading-relaxed text-slate-500">{is ? tank.caveat.is : tank.caveat.en}</p>
                <p className="mt-1 text-[10px] text-slate-400">{tank.citation}</p>
              </ShowDetails>
            </div>
          ) : null}

          {/* The maximal-effort benchmark line (its average speed) when a single test is on file. */}
          {test?.read?.maxEffort && !testCs ? (
            <p className="text-[12px] text-slate-500">
              {is
                ? `Hámarkshraði á ${String(test.read.maxEffort.durationMin).replace(".", ",")} mín ≈ `
                : `Max ${test.read.maxEffort.durationMin}-min speed ≈ `}
              <b className="tabular-nums text-slate-700">{test.read.maxEffort.kmh} km/h</b>
              <span className="text-slate-400"> · {test.read.maxEffort.distanceM} m</span>
            </p>
          ) : null}

          {/* Record a maximal test effort. */}
          <details className="group rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[12px] font-semibold text-slate-600">
              <span className="transition-transform group-open:rotate-90">▸</span>
              {is ? "Skrá hámarks-próf (t.d. 4-mín all-out)" : "Record a maximal test (e.g. 4-min all-out)"}
            </summary>
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <label className="text-[11px] text-slate-500">{is ? "Lengd (mín)" : "Duration (min)"}
                <input value={dur} onChange={(e) => setDur(e.target.value)} inputMode="decimal" placeholder="4" className="mt-0.5 block w-20 rounded border border-slate-300 px-2 py-1 text-[13px] tabular-nums" />
              </label>
              <label className="text-[11px] text-slate-500">{is ? "Vegalengd (m)" : "Distance (m)"}
                <input value={dist} onChange={(e) => setDist(e.target.value)} inputMode="decimal" placeholder="1050" className="mt-0.5 block w-24 rounded border border-slate-300 px-2 py-1 text-[13px] tabular-nums" />
              </label>
              <button onClick={() => void save()} disabled={busy || !dur || !dist} className="rounded-lg bg-[#2740e6] px-3 py-1 text-[12px] font-semibold text-white disabled:opacity-40">{busy ? "…" : (is ? "Skrá" : "Save")}</button>
              {msg ? <span className="text-[11px] font-medium text-red-700">{msg}</span> : null}
            </div>
            {(test?.efforts ?? []).length ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(test?.efforts ?? []).map((e) => (
                  <span key={e.id} className="rounded-full bg-white px-2 py-0.5 text-[11px] text-slate-600 ring-1 ring-slate-200">
                    {e.test_date} · {Number(e.duration_min)}m · {Number(e.distance_m)}m
                  </span>
                ))}
              </div>
            ) : null}
          </details>

          <p className="text-[11px] text-slate-400">{is ? "Reglur reikna — ekki AI. Lýsandi — snertir aldrei readiness." : "Rules compute — not AI. Descriptive — never touches readiness."}</p>
        </div>
      ) : null}
    </div>
  );
}
