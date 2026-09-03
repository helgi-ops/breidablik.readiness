"use client";

export const dynamic = "force-dynamic";

/**
 * /coach/player-analysis — the single home for a player's season football profile.
 *
 * IA: organise by SUBJECT (my players), the data SOURCE is a toggle within the page —
 * never a separate page. Wyscout view = descriptive season/per-match football stats +
 * imports; StatsBomb view = per-90 percentile role read + GK + StatsBomb imports.
 * Mirrors the Team Match Insights DATA toggle. Descriptive only — nothing here touches
 * the readiness colour, load, or the daily decision.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import PageCrossRef from "@/components/coach/PageCrossRef";
import PlayerStatsWyscoutView from "@/components/coach/PlayerStatsWyscoutView";
import InstatBasketballUpload from "@/components/coach/InstatBasketballUpload";
import PlayerAnalysisStatsbombView from "@/components/coach/PlayerAnalysisStatsbombView";

type Source = "wyscout" | "statsbomb";
type Providers = { wyscout: boolean; statsbomb: boolean };
const LS_KEY = "player-analysis-source";

export default function PlayerAnalysisPage() {
  const [lang] = useLang();
  const is = lang === "IS";
  const [providers, setProviders] = React.useState<Providers | null>(null);
  const [sport, setSport] = React.useState<string | undefined>(undefined);
  const [source, setSource] = React.useState<Source | null>(null); // null = not chosen yet → server/default

  // Detect this team's providers + sport (same config the Wyscout view reads).
  React.useEffect(() => {
    (async () => {
      const tok = (await getSupabaseClient().auth.getSession()).data.session?.access_token;
      if (!tok) return;
      const res = await fetch("/api/coach/player-stats/config", { cache: "no-store", headers: { Authorization: `Bearer ${tok}` } });
      if (res.ok) { const j = await res.json(); setProviders(j.providers ?? { wyscout: false, statsbomb: false }); setSport(j.sport); }
    })();
  }, []);

  // Resolve the initial selection once providers are known: ?source= → localStorage →
  // Wyscout-when-present → the only provider that has data → wyscout.
  React.useEffect(() => {
    if (!providers || source != null) return;
    const param = new URLSearchParams(window.location.search).get("source");
    const stored = (typeof window !== "undefined" ? window.localStorage.getItem(LS_KEY) : null) as Source | null;
    const valid = (s: string | null): s is Source => s === "wyscout" || s === "statsbomb";
    let pick: Source;
    if (valid(param)) pick = param;
    else if (valid(stored) && providers[stored]) pick = stored;
    else if (providers.wyscout) pick = "wyscout";
    else if (providers.statsbomb) pick = "statsbomb";
    else pick = "wyscout";
    setSource(pick);
  }, [providers, source]);

  const choose = (s: Source) => { setSource(s); try { window.localStorage.setItem(LS_KEY, s); } catch { /* ignore */ } };

  const isBasketball = String(sport ?? "").toLowerCase() === "basketball";
  const sel: Source = source ?? "wyscout";
  const selHasData = providers ? providers[sel] : true;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="text-2xl font-bold text-slate-900">{is ? "Leikmanna-tímabilsgreining" : "Player Season Analysis"}</h1>
      <PageCrossRef
        en="This page: his season match-stats vs the squad (per-90 percentiles, role, AI). For the footballer + athlete combined read → Total Player Analysis. For one game in depth → Single Match Analysis."
        is="Þessi síða: tímabils-tölfræði hans vs liðið (per-90 hlutfallsröðun, hlutverk, AI). Fyrir fótboltamann + íþróttamann saman → Heildar leikmannagreining. Fyrir einn leik í dýpt → Stakur leikur."
      />

      {/* Source toggle (football teams with the data model; basketball has no Wyscout/StatsBomb) */}
      {!isBasketball && providers ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">{is ? "Gögn" : "Data"}</span>
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-[13px] shadow-sm">
            {(["wyscout", "statsbomb"] as const).map((p) => {
              const has = providers[p];
              return (
                <button key={p} onClick={() => choose(p)}
                  className={`rounded-md px-3 py-1 font-semibold ${sel === p ? "bg-[#2740e6] text-white" : "text-slate-600 hover:bg-slate-100"}`}>
                  {p === "statsbomb" ? "StatsBomb" : "Wyscout"}
                  {!has ? <span className={`ml-1 text-[10px] font-normal ${sel === p ? "text-blue-100" : "text-slate-400"}`}>{is ? "· engin gögn" : "· no data"}</span> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="mt-4">
        {/* Empty-state for a selected-but-absent provider — never a blank/broken view. */}
        {!isBasketball && providers && !selHasData ? (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
            {sel === "statsbomb"
              ? (is ? "Engin StatsBomb-gögn enn — flyttu inn StatsBomb Squad CSV hér að neðan." : "No StatsBomb data yet — import your StatsBomb Squad CSV below.")
              : (is ? "Engin Wyscout-gögn enn — flyttu inn Wyscout leikmanna-skrá í Innflutningi hér að neðan." : "No Wyscout data yet — import your Wyscout player file on the Import tab below.")}
          </div>
        ) : null}

        {/* Basketball: import InStat per-player tables (advanced metrics) right here. */}
        {isBasketball ? (
          <details className="mb-4 rounded-xl border border-orange-200 bg-orange-50/40 px-4 py-2.5">
            <summary className="cursor-pointer text-[12px] font-semibold text-orange-800">
              {is ? "Flytja inn InStat gögn (leikskýrsla PDF / tafla)" : "Import InStat data (Game Report PDF / table)"}
            </summary>
            <div className="mt-3"><InstatBasketballUpload onImported={() => window.location.reload()} /></div>
          </details>
        ) : null}

        {isBasketball || sel === "wyscout" ? <PlayerStatsWyscoutView /> : <PlayerAnalysisStatsbombView />}
      </div>
    </div>
  );
}
