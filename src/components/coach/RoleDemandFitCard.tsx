"use client";

/**
 * Role-Demand Fit — the first fusion card. Does the player's physical ENGINE match the
 * physical demands of his ROLE, and does his tactical OUTPUT confirm it? Fuses athlete-profile
 * percentiles (Engine) x roleModel demand x movement archetype (Driver) x per-90 output.
 *
 * Explainability-first: (0) one-sentence verdict + confidence, (1) three fused tiles + the
 * amber watch-item, all visible without a click; (2) the demand-weight table + raw numbers +
 * citations behind "Show details". Descriptive / advisory — never touches the readiness colour.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import ShowDetails from "@/components/common/ShowDetails";
import type { RoleDemandFitRead, EngineBand, DriverFit, OutputRead } from "@/lib/micropulse/roleDemandFit";

type PlayerLite = { id: string; name: string };
type Resp = { ok: boolean; asOf?: string; read: RoleDemandFitRead };

const engineTone: Record<EngineBand, { dot: string; text: string; en: string; is: string }> = {
  elite: { dot: "#1c7a4a", text: "text-emerald-700", en: "Elite", is: "Elite" },
  solid: { dot: "#2740e6", text: "text-blue-700", en: "Solid", is: "Traust" },
  below: { dot: "#a83e28", text: "text-rose-700", en: "Below", is: "Undir pari" },
  unknown: { dot: "#94a3b8", text: "text-slate-400", en: "No data", is: "Engin gögn" },
};
const driverTone: Record<DriverFit, { dot: string; text: string; en: string; is: string }> = {
  fits: { dot: "#1c7a4a", text: "text-emerald-700", en: "Fits", is: "Passar" },
  atypical: { dot: "#de9328", text: "text-amber-700", en: "Atypical", is: "Óvenjulegt" },
  unknown: { dot: "#94a3b8", text: "text-slate-400", en: "No data", is: "Engin gögn" },
};
const outputTone: Record<OutputRead, { dot: string; text: string; en: string; is: string }> = {
  productive: { dot: "#1c7a4a", text: "text-emerald-700", en: "Productive", is: "Skilar" },
  at_norm: { dot: "#2740e6", text: "text-blue-700", en: "At norm", is: "Á venju" },
  under: { dot: "#a83e28", text: "text-rose-700", en: "Under", is: "Undir" },
  unknown: { dot: "#94a3b8", text: "text-slate-400", en: "No data", is: "Engin gögn" },
};
const confPill: Record<string, string> = {
  high: "bg-emerald-50 text-emerald-700 border-emerald-200",
  moderate: "bg-amber-50 text-amber-700 border-amber-200",
  low: "bg-slate-100 text-slate-500 border-slate-200",
};

function Tile({ label, word, tone, fact }: { label: string; word: string; tone: { dot: string; text: string }; fact: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-0.5 flex items-center gap-1.5 text-[15px] font-bold ${tone.text}`}>
        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tone.dot }} />
        {word}
      </div>
      <p className="mt-1 text-[12px] leading-snug text-slate-600">{fact}</p>
    </div>
  );
}

export default function RoleDemandFitCard({ playerId }: { players: PlayerLite[]; playerId: string }) {
  const [lang] = useLang();
  const is = lang === "IS";
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [data, setData] = React.useState<Resp | null>(null);

  React.useEffect(() => {
    if (!playerId) { setData(null); return; }
    let alive = true;
    setLoading(true); setErr(null);
    (async () => {
      try {
        const { data: sess } = await getSupabaseClient().auth.getSession();
        const token = sess?.session?.access_token;
        if (!token) { if (alive) setErr(is ? "Ekki innskráð(ur)." : "Not signed in."); return; }
        const res = await fetch(`/api/coach/role-demand-fit?playerId=${playerId}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
        const j = (await res.json().catch(() => null)) as Resp | null;
        if (!alive) return;
        if (!res.ok || !j?.ok) { setErr(is ? "Náði ekki í gögn." : "Couldn't load."); return; }
        setData(j);
      } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [playerId, is]);

  const title = is ? "Staða vs geta (fusion)" : "Role-demand fit";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold text-slate-800">{title}</span>
        <span className="cursor-help rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500"
          title={is ? "Sameinar líkamlega vél (GPS/VALD), hlutverkskröfu, hreyfistíl (IMA) og leikja-output. Þróunar-/skátalestur — snertir aldrei readiness-litinn."
                    : "Fuses the physical engine (GPS/VALD), role demand, movement style (IMA) and match output. A development / scouting read — it never touches the readiness colour."}>
          {is ? "fusion ⓘ" : "fusion ⓘ"}
        </span>
      </div>

      {loading ? <p className="mt-3 text-[13px] text-slate-400">…</p> : null}
      {err ? <p className="mt-3 text-[13px] font-medium text-red-700">{err}</p> : null}
      {!playerId ? <p className="mt-2 text-[13px] text-slate-500">{is ? "Veldu leikmann." : "Pick a player."}</p> : null}

      {data && !loading && !err ? (() => {
        const r = data.read;
        if (!r.scored) return <p className="mt-2 text-[13px] text-slate-500">{r.verdict[is ? "is" : "en"]}</p>;
        const eT = engineTone[r.engine.band], dT = driverTone[r.driver.fit], oT = outputTone[r.output.read];
        const confWord = is ? { high: "há", moderate: "meðal", low: "lág" }[r.confidence] : r.confidence;
        return (
          <div className="mt-3 space-y-3">
            {/* (0) verdict + confidence */}
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="text-[15px] font-bold leading-snug text-slate-900">{r.verdict[is ? "is" : "en"]}</p>
              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${confPill[r.confidence]}`}>
                {is ? "vissa" : "conf"}: {confWord}
              </span>
            </div>

            {/* (1) three fused tiles */}
            <div className="grid gap-2 sm:grid-cols-3">
              <Tile label={is ? `Vél × ${r.roleLabel.is}` : `Engine × ${r.roleLabel.en}`} word={is ? eT.is : eT.en} tone={eT} fact={r.engine.fact[is ? "is" : "en"]} />
              <Tile label={is ? "Hreyfistíll" : "Driver"} word={is ? dT.is : dT.en} tone={dT} fact={r.driver.fact[is ? "is" : "en"]} />
              <Tile label={is ? "Output" : "Output"} word={is ? oT.is : oT.en} tone={oT} fact={r.output.fact[is ? "is" : "en"]} />
            </div>

            {/* watch-item strip */}
            {r.watch.length ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-800">{is ? "Fylgstu með" : "Watch-item"}</span>
                <p className="mt-0.5 text-[13px] text-amber-900">
                  {r.watch.map((w) => (is ? w.label.is : w.label.en)).join(is ? " og " : " and ")}
                  {" — "}
                  {is ? "grunnurinn undir endurteknu hámarki fyrir stöðuna." : "the base under the role's repeated peaks."}
                </p>
                {r.counterfactual ? <p className="mt-0.5 text-[11px] text-amber-800">↳ {r.counterfactual[is ? "is" : "en"]}</p> : null}
              </div>
            ) : null}

            {/* (2) details */}
            <ShowDetails
              label={{ EN: "Show the demand weights & numbers", IS: "Sýna kröfu-vægi og tölur" }}
              hint={{ EN: "role demand × his position percentiles", IS: "hlutverkskrafa × hundraðsraðir hans" }}
            >
              <div className="space-y-3 text-[12px]">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-[10px] uppercase tracking-wide text-slate-500">
                      <th className="py-1 font-medium">{is ? "Geta (fyrir stöðuna)" : "Quality (for the role)"}</th>
                      <th className="py-1 text-right font-medium">{is ? "Krafa" : "Demand"}</th>
                      <th className="py-1 text-right font-medium">{is ? "Hundraðsröð" : "Percentile"}</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums text-slate-700">
                    {r.demand.map((d) => (
                      <tr key={d.quality} className="border-b border-slate-100">
                        <td className="py-1 text-slate-600">{d.label[is ? "is" : "en"]}</td>
                        <td className="py-1 text-right text-slate-500">{Math.round(d.weight * 100)}%</td>
                        <td className={`py-1 text-right font-medium ${d.percentile == null ? "text-slate-300" : d.percentile >= 55 ? "text-emerald-600" : d.percentile >= 40 ? "text-amber-600" : "text-rose-600"}`}>
                          {d.percentile == null ? "–" : Math.round(d.percentile)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-[11px] text-slate-500">
                  {is ? "Vél-fit stig" : "Engine-fit score"}: <b>{r.engine.score ?? "–"}</b> · {is ? "þekja" : "sources"}: {r.sources.join(", ") || "–"}{data.asOf ? ` · ${is ? "frá" : "as of"} ${data.asOf}` : ""}
                </p>
                <p className="text-[11px] leading-relaxed text-slate-400">{r.citeRow} · {r.citations.join(" · ")}</p>
              </div>
            </ShowDetails>

            <p className="text-[11px] text-slate-400">{is ? "Reglur reikna — ekki AI." : "Rules compute — not AI."}</p>
          </div>
        );
      })() : null}
    </div>
  );
}
