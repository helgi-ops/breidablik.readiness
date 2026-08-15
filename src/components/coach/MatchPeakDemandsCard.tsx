"use client";

/**
 * Peak demands — the most intense sessions a player has faced, and how they compare
 * to his own typical. Follows the player selected in the Match Movement comparison
 * above. Reads the peak-intensity fingerprint (PlayerLoad/min, peak metabolic power,
 * high-speed rate, high-intensity efforts/min) and mechanical-load intensity from the
 * session summaries. Layered read: verdict → plain why → confidence → detail.
 *
 * Phase 1 uses session-summary proxies — a peak-intensity fingerprint, NOT a true
 * rolling peak period (that needs the per-interval Catapult export, Phase 2). Labelled
 * as a proxy throughout. Descriptive load context — it never touches the readiness
 * colour, the load target, or the daily decision.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import ShowDetails from "@/components/common/ShowDetails";
import type { PeakRead, PeakLevel } from "@/lib/micropulse/load/peakIntensity";
import type { MechRead, MechDemand } from "@/lib/micropulse/load/mechanicalPower";

type Resp = {
  ok: boolean;
  name: string | null;
  position: string | null;
  hasData: boolean;
  peak: PeakRead;
  mechanical: MechRead;
};

function levelTone(level: PeakLevel): { dot: string; text: string } {
  switch (level) {
    case "peak": return { dot: "#a83e28", text: "text-rose-700" };
    case "elevated": return { dot: "#de9328", text: "text-amber-700" };
    case "below": return { dot: "#2740e6", text: "text-blue-700" };
    case "typical": return { dot: "#1c7a4a", text: "text-emerald-700" };
    default: return { dot: "#94a3b8", text: "text-slate-400" };
  }
}

function levelWord(level: PeakLevel, is: boolean): string {
  const en: Record<PeakLevel, string> = { peak: "Peak", elevated: "Elevated", typical: "Typical", below: "Below usual", insufficient: "Not enough data" };
  const isl: Record<PeakLevel, string> = { peak: "Hámark", elevated: "Hækkað", typical: "Dæmigert", below: "Undir venju", insufficient: "Ekki næg gögn" };
  return is ? isl[level] : en[level];
}

function demandWord(d: MechDemand, is: boolean): string {
  const en: Record<MechDemand, string> = { high: "High", typical: "Typical", low: "Low", insufficient: "n/a" };
  const isl: Record<MechDemand, string> = { high: "Há", typical: "Dæmigerð", low: "Lág", insufficient: "n/a" };
  return is ? isl[d] : en[d];
}

const fmt = (v: number | null | undefined, d = 1): string => (v == null ? "–" : v.toFixed(d));
const idx = (v: number | null | undefined): string => (v == null ? "–" : `${Math.round(v)}`);

export default function MatchPeakDemandsCard({ selectedPlayerId }: { selectedPlayerId: string }) {
  const [lang] = useLang();
  const is = lang === "IS";
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [data, setData] = React.useState<Resp | null>(null);

  React.useEffect(() => {
    if (!selectedPlayerId) { setData(null); return; }
    let alive = true;
    setLoading(true); setErr(null);
    (async () => {
      try {
        const sb = getSupabaseClient();
        const { data: sess } = await sb.auth.getSession();
        const token = sess?.session?.access_token;
        if (!token) { if (alive) setErr(is ? "Ekki innskráð(ur)." : "Not signed in."); return; }
        const res = await fetch(`/api/coach/player/${selectedPlayerId}/peak-demands`, {
          headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
        });
        const j = (await res.json().catch(() => null)) as Resp | null;
        if (!alive) return;
        if (!res.ok || !j?.ok) { setErr(is ? "Náði ekki í gögn." : "Couldn't load."); return; }
        setData(j);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [selectedPlayerId, is]);

  const title = is ? "Hámarkskrafa" : "Peak demands";

  if (!selectedPlayerId) {
    return (
      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="text-sm font-bold text-slate-800">{title}</div>
        <p className="mt-1 text-[13px] text-slate-500">
          {is ? "Veldu leikmann að ofan til að sjá hámarkskröfu hans." : "Pick a player above to see his peak demands."}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold text-slate-800">{title}</span>
        <span
          className="cursor-help rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500"
          title={is
            ? "Hámarks-ákefðar fingrafar úr lotu-samantektum (PlayerLoad/mín, hámarks efnaskiptaafl, háhraðahlaup, hákröftug átök/mín) — nálgun, ekki raunverulegt rúllandi hámarkstímabil."
            : "A peak-intensity fingerprint from session summaries (PlayerLoad/min, peak metabolic power, high-speed rate, high-intensity efforts/min) — a proxy, not a true rolling peak period."}
        >
          {is ? "nálgun ⓘ" : "proxy ⓘ"}
        </span>
      </div>

      {loading ? <p className="mt-3 text-[13px] text-slate-400">…</p> : null}
      {err ? <p className="mt-3 text-[13px] font-medium text-red-700">{err}</p> : null}

      {data && !loading && !err ? (
        !data.hasData ? (
          <p className="mt-2 text-[13px] text-slate-500">
            {is ? "Engin GPS/IMA lotu-gögn fyrir þennan leikmann enn." : "No GPS/IMA session data for this player yet."}
          </p>
        ) : (() => {
          const peak = data.peak;
          const mech = data.mechanical;
          const latest = peak.latest;
          const worst = peak.worstCase;
          const tone = levelTone(latest?.level ?? "insufficient");

          // Layer 0 — verdict.
          const verdict = latest?.level && latest.level !== "insufficient"
            ? (is
                ? `Síðasta lota: ${levelWord(latest.level, true).toLowerCase()} ákefð fyrir hann (${idx(latest.fingerprint)} vs 100 = venja).`
                : `Latest session: ${levelWord(latest.level, false).toLowerCase()} intensity for him (${idx(latest.fingerprint)} vs 100 = his usual).`)
            : (is ? "Ekki næg gögn til að staðsetja síðustu lotu enn." : "Not enough data to place his latest session yet.");

          // Layer 1 — 2–3 plain facts.
          const facts: string[] = [];
          if (worst) {
            facts.push(is
              ? `Ákafasta lota tímabilsins: ${worst.date.slice(5)} (fingrafar ${idx(worst.fingerprint)}, PlayerLoad ${fmt(worst.proxies.loadPerMin)}/mín) — versta-tilfellis krafan.`
              : `Most intense session this window: ${worst.date.slice(5)} (fingerprint ${idx(worst.fingerprint)}, PlayerLoad ${fmt(worst.proxies.loadPerMin)}/min) — the worst-case demands.`);
          }
          if (mech.latest?.demand && mech.latest.demand !== "insufficient") {
            facts.push(is
              ? `Vélræn krafa síðustu lotu: ${demandWord(mech.latest.demand, true).toLowerCase()} (${idx(mech.latest.mechIndex)} vs venja) — skurðir, hröðun og hemlun á mínútu.`
              : `Latest mechanical demand: ${demandWord(mech.latest.demand, false).toLowerCase()} (${idx(mech.latest.mechIndex)} vs usual) — cuts, accelerations and decelerations per minute.`);
          }
          if (latest?.proxies.metabolicPeak != null) {
            facts.push(is
              ? `Hámarks efnaskiptaafl síðast: ${fmt(latest.proxies.metabolicPeak)} W/kg (${idx(latest.indices.metabolicPeak)} vs venja).`
              : `Peak metabolic power last out: ${fmt(latest.proxies.metabolicPeak)} W/kg (${idx(latest.indices.metabolicPeak)} vs usual).`);
          }

          const confWord = is
            ? { high: "há", medium: "meðal", low: "lág" }[peak.confidence]
            : peak.confidence;

          return (
            <div className="mt-3 space-y-2">
              <p className={`flex items-center gap-2 text-sm font-medium ${tone.text}`}>
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tone.dot }} />
                {verdict}
              </p>
              {facts.length ? (
                <ul className="space-y-1 text-[13px] text-slate-600">
                  {facts.map((f, i) => <li key={i}>• {f}</li>)}
                </ul>
              ) : null}
              <p className="text-[11px] text-slate-400" title={peak.caveat[is ? "is" : "en"]}>
                {is ? "Áreiðanleiki" : "Confidence"}: {confWord} · {peak.dataCoverage.sessions} {is ? "lotur" : "sessions"} · {peak.dataCoverage.proxies}/4 {is ? "mælikvarðar" : "proxies"}
              </p>

              <ShowDetails
                label={{ EN: "Show the peak-intensity fingerprint", IS: "Sýna hámarks-ákefðar fingrafar" }}
                hint={{ EN: "each proxy vs his own norm", IS: "hver mælikvarði vs eigin viðmið" }}
              >
                <div className="space-y-3 text-[12px]">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-[10px] uppercase tracking-wide text-slate-500">
                        <th className="py-1 font-medium">{is ? "Mælikvarði (síðast)" : "Proxy (latest)"}</th>
                        <th className="py-1 text-right font-medium">{is ? "Gildi" : "Value"}</th>
                        <th className="py-1 text-right font-medium">{is ? "vs venja" : "vs usual"}</th>
                        <th className="py-1 text-right font-medium">{is ? "Versta lota" : "Worst"}</th>
                      </tr>
                    </thead>
                    <tbody className="tabular-nums text-slate-700">
                      {([
                        ["PlayerLoad/min", latest?.proxies.loadPerMin, latest?.indices.loadPerMin, worst?.proxies.loadPerMin, 1],
                        [is ? "Hámarks efnaskiptaafl (W/kg)" : "Peak metab. power (W/kg)", latest?.proxies.metabolicPeak, latest?.indices.metabolicPeak, worst?.proxies.metabolicPeak, 1],
                        [is ? "Háhraðahlaup (m/mín)" : "High-speed (m/min)", latest?.proxies.hsrRate, latest?.indices.hsrRate, worst?.proxies.hsrRate, 1],
                        [is ? "Hákröftug átök/mín" : "High-intensity efforts/min", latest?.proxies.effortsPerMin, latest?.indices.effortsPerMin, worst?.proxies.effortsPerMin, 2],
                      ] as Array<[string, number | null | undefined, number | null | undefined, number | null | undefined, number]>).map(([label, v, ix, w, dp]) => (
                        <tr key={label} className="border-b border-slate-100">
                          <td className="py-1 text-slate-600">{label}</td>
                          <td className="py-1 text-right">{fmt(v, dp)}</td>
                          <td className="py-1 text-right">{idx(ix)}</td>
                          <td className="py-1 text-right text-slate-500">{fmt(w, dp)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="leading-relaxed text-slate-500">{peak.caveat[is ? "is" : "en"]}</p>
                </div>
              </ShowDetails>

              <p className="text-[11px] text-slate-400">
                {is ? "Reglur reikna — ekki AI." : "Rules compute — not AI."} · {peak.citation}
              </p>
            </div>
          );
        })()
      ) : null}
    </div>
  );
}
