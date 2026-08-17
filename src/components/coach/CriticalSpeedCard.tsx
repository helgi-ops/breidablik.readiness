"use client";

/**
 * Conditioning profile (Critical Speed) — CS + D′ fitted from the player's DISTANCE power
 * curve, the running form of the critical-power model. CS = the pace he can sustain (km/h),
 * D′ = a distance reserve above it (m). Reads /api/coach/load/peak-period (the criticalSpeed
 * block). Layered read: verdict → 2-3 plain facts → "Show details" (the fitted line + R²).
 * Descriptive conditioning context — never touches readiness. Bilingual EN/IS.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import ShowDetails from "@/components/common/ShowDetails";
import type { CriticalSpeedRead } from "@/lib/micropulse/load/criticalSpeed";

type CurvePoint = { windowMin: number; value: number | null };
type Resp = {
  ok: boolean; hasData: boolean; name: string | null;
  peakPeriod?: { seasonBest?: Array<{ metric: string; unit: string | null; points: CurvePoint[] }> };
  criticalSpeed?: CriticalSpeedRead;
};

const CONF_TONE: Record<string, string> = {
  high: "bg-emerald-100 text-emerald-700", medium: "bg-amber-100 text-amber-800", low: "bg-slate-100 text-slate-500",
};
const confLabel = (c: string, is: boolean) => (c === "high" ? (is ? "full vissa" : "high") : c === "medium" ? (is ? "miðlungs" : "medium") : (is ? "lítil vissa" : "low"));

/** Distance–time plot: reconstructed peak distance (points) + the fitted CS/D′ line. */
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
      {/* fitted line D = D' + CS·t, from t=0 (intercept) to maxT */}
      <line x1={x(0)} y1={y(dPrime)} x2={x(maxT)} y2={y(dPrime + cs * maxT)} stroke="#2740e6" strokeWidth="2" />
      {/* D′ intercept marker on the y-axis */}
      <circle cx={x(0)} cy={y(dPrime)} r="2.5" fill="#94a3b8" />
      <text x={x(0) + 4} y={y(dPrime) - 4} fontSize="8" fill="#94a3b8">D′</text>
      {/* observed points */}
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

export default function CriticalSpeedCard({ players }: { players: Array<{ id: string; name: string }> }) {
  const [lang] = useLang();
  const is = lang === "IS";
  const [sel, setSel] = React.useState("");
  const [data, setData] = React.useState<Resp | null>(null);
  const [loading, setLoading] = React.useState(false);

  const token = React.useCallback(async () => (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? null, []);
  React.useEffect(() => { if (!sel && players.length) setSel(players[0].id); }, [players, sel]);

  React.useEffect(() => {
    if (!sel) { setData(null); return; }
    let alive = true; setLoading(true);
    (async () => {
      try {
        const tok = await token(); if (!tok) return;
        const res = await fetch(`/api/coach/load/peak-period?player=${sel}`, { headers: { Authorization: `Bearer ${tok}` }, cache: "no-store" });
        const j = (await res.json().catch(() => null)) as Resp | null;
        if (alive) setData(j && j.ok ? j : null);
      } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [sel, token]);

  const cs = data?.criticalSpeed ?? null;
  const valid = cs && cs.csMetresPerMin != null && cs.confidence !== "low";
  const distPts = (data?.peakPeriod?.seasonBest?.find((c) => c.metric === "distance")?.points ?? [])
    .filter((p) => p.value != null && p.value > 0)
    .map((p) => ({ t: p.windowMin, D: (p.value as number) * p.windowMin }))
    .sort((a, b) => a.t - b.t);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold text-slate-800">{is ? "Úthalds-prófíll (Critical Speed)" : "Conditioning profile (Critical Speed)"}</span>
        <span className="cursor-help rounded bg-[#2740e6]/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#2740e6]"
          title={is
            ? "CS = hraðinn sem hann getur haldið (metinn úr distance afl-kúrfunni: D = D′ + CS·t). D′ = vegalengdar-forði yfir CS. Hlaupa-útgáfa critical-power líkansins — vallar-mat, ekki próf til örmögnunar. Ekki W/kg."
            : "CS = the pace he can sustain (fitted from the distance power curve: D = D′ + CS·t). D′ = a distance reserve above CS. The running form of the critical-power model — a field estimate, not a test to exhaustion. Not W/kg."}>
          {is ? "CS · D′ ⓘ" : "CS · D′ ⓘ"}
        </span>
        <select value={sel} onChange={(e) => setSel(e.target.value)} className="ml-auto rounded-lg border border-slate-300 px-2 py-1 text-[13px]">
          {players.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {loading ? <p className="mt-3 text-[13px] text-slate-400">…</p> : null}

      {!loading && cs && !valid ? (
        <p className="mt-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-[13px] text-slate-500">
          {is ? cs.verdict.is : cs.verdict.en}
        </p>
      ) : null}

      {!loading && valid && cs ? (
        <div className="mt-3 space-y-3">
          {/* (0) verdict, first and boldest */}
          <p className="text-[15px] font-bold text-slate-900">{is ? cs.verdict.is : cs.verdict.en}</p>

          {/* (1) 2–3 plain facts, no click */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px] text-slate-700">
            <span>{is ? "Critical speed" : "Critical speed"}: <b className="tabular-nums">{cs.csKmh} km/h</b> <span className="text-slate-400">({cs.csMs} m/s)</span></span>
            <span>{is ? "Forði (D′)" : "Reserve (D′)"}: <b className="tabular-nums">{cs.dPrimeM} m</b></span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${CONF_TONE[cs.confidence]}`}>{confLabel(cs.confidence, is)}</span>
            {cs.csPercentile != null ? <span className="text-[12px] text-slate-500">{is ? "CS m.v. lið" : "CS vs squad"}: {cs.csPercentile}%</span> : null}
          </div>

          {/* (2) details behind a toggle */}
          <ShowDetails label={{ EN: "Show the fit", IS: "Sýna aðhvarfið" }}>
            <FitSvg pts={distPts} cs={cs.csMetresPerMin!} dPrime={cs.dPrimeM!} />
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
              <span>R² <b className="tabular-nums text-slate-700">{cs.rSquared}</b></span>
              <span>{is ? "gluggar" : "windows"} <b className="tabular-nums text-slate-700">{cs.nPoints}</b></span>
              <span title={is ? "Metrar á mínútu" : "Metres per minute"}>CS <b className="tabular-nums text-slate-700">{cs.csMetresPerMin} m/min</b></span>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{is ? cs.caveat.is : cs.caveat.en}</p>
            <p className="mt-1 text-[10px] text-slate-400">{cs.citation}</p>
          </ShowDetails>

          <p className="text-[11px] text-slate-400">{is ? "Reglur reikna — ekki AI. Lýsandi — snertir aldrei readiness." : "Rules compute — not AI. Descriptive — never touches readiness."}</p>
        </div>
      ) : null}
    </div>
  );
}
