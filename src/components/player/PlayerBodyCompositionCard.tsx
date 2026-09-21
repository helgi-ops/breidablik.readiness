"use client";

/**
 * Player-facing body-composition card — READ-ONLY. The athlete's own %fat trend over time.
 *
 * Wellbeing (non-negotiable): an INDIVIDUAL TREND, never a verdict — no ideal %, no target line, no
 * red/amber judgement, no comparison to teammates. The ±3–5 % estimate error is shown every time, and
 * a method/tester CHANGE between measurements is flagged (else the change is noise, not real). Neutral
 * language. The player cannot enter measurements here (a practitioner records them). Renders nothing
 * until there is at least one measurement — the athlete isn't prompted about body fat unbidden.
 * Descriptive — never touches readiness.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";

type Row = { measuredOn: string; bodyFatPct: number; method: string | null; sumSkinfoldsMm: number | null; leanKg: number | null; massKg: number | null };
type Resp = { ok: boolean; bodyComp?: Row[]; consistency?: { methodChanged: boolean; testerChanged: boolean } | null };

const BF_BAND = 4; // ±% shown with every estimate

function Sparkline({ vals }: { vals: number[] }) {
  if (vals.length < 2) return null;
  const W = 120, H = 28, min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * W},${H - 2 - ((v - min) / span) * (H - 4)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-7 w-[120px]" role="img" aria-label="trend">
      <polyline points={pts} fill="none" stroke="#64748b" strokeWidth={1.4} />
    </svg>
  );
}

export default function PlayerBodyCompositionCard() {
  const [lang] = useLang();
  const is = lang === "IS";
  const [data, setData] = React.useState<Resp | null>(null);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      const tok = (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? null;
      if (!tok) return;
      const res = await fetch("/api/player/body-composition", { headers: { Authorization: `Bearer ${tok}` }, cache: "no-store" });
      const j = await res.json().catch(() => null);
      if (alive) setData(j && j.ok ? j : null);
    })();
    return () => { alive = false; };
  }, []);

  const bc = data?.bodyComp ?? [];
  const latest = bc[0] ?? null;
  const prev = bc[1] ?? null;
  const cons = data?.consistency ?? null;
  if (!latest) return null; // never prompt the athlete about body fat unbidden

  const methodLabel = (m: string | null) => (m === "jp7" ? "JP-7" : m === "jp3" ? "JP-3" : m === "navy" ? (is ? "Ummál" : "Navy") : m ?? "");
  const delta = prev ? Math.round((latest.bodyFatPct - prev.bodyFatPct) * 10) / 10 : null;
  const days = prev ? Math.round((Date.parse(latest.measuredOn) - Date.parse(prev.measuredOn)) / 86400000) : null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {is ? "Líkamssamsetning (mat)" : "Body composition (estimate)"}
      </div>

      {delta != null && !cons?.methodChanged ? (
        <p className="mt-1 text-[13px] text-slate-700">
          {is ? "Þróun" : "Trend"}: <b className="text-slate-900">{delta > 0 ? "+" : ""}{delta}%</b>{" "}
          {is ? "frá síðustu mælingu" : "vs last measurement"}{days != null ? ` (${days} ${is ? "dagar" : "days"})` : ""}
        </p>
      ) : null}

      <p className="mt-0.5 text-[20px] font-semibold text-slate-900 tabular-nums">
        {latest.bodyFatPct}% <span className="text-[12px] font-normal text-slate-400">± {BF_BAND} · {is ? "mat" : "estimate"}</span>
      </p>
      <p className="text-[12px] text-slate-500">
        {latest.leanKg != null ? <>{is ? "Fitufrír massi" : "Lean mass"} {latest.leanKg} kg · </> : null}
        {methodLabel(latest.method)} · {latest.measuredOn}
      </p>

      {bc.length >= 2 ? <div className="mt-1"><Sparkline vals={[...bc].reverse().map((x) => x.bodyFatPct)} /></div> : null}

      {cons?.methodChanged ? (
        <p className="mt-1 text-[11px] font-medium text-amber-700">
          ⚠ {is ? "Aðferð breyttist milli mælinga — þróun ekki samanburðarhæf." : "Method changed between measurements — trend not comparable."}
        </p>
      ) : null}
      {cons?.testerChanged ? (
        <p className="mt-0.5 text-[11px] font-medium text-amber-700">
          ⚠ {is ? "Annar mælandi — samanburður óviss." : "Different tester — comparison uncertain."}
        </p>
      ) : null}

      <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
        {is
          ? "MAT (±3–5 %), ekki nákvæm mæling. Þetta er þín eigin þróun yfir tíma — ekkert kjörhlutfall og ekkert markmið. Talaðu við þjálfara/sjúkraþjálfara ef þú hefur spurningar."
          : "An ESTIMATE (±3–5 %), not an exact measure. This is your own trend over time — there is no ideal % and no target. Talk to your coach/physio with any questions."}
      </p>
    </div>
  );
}
