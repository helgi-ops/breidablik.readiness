"use client";

/**
 * SignalPackCard — the Explainable Signal Pack surface. Shows, per player carrying an
 * elevated signal, the ranked "why" contributors (EWMA-ACWR load/decel/HSR, monotony,
 * injury recency, sleep, CMJ) — each a plain line with a counterfactual, confidence and
 * citation. These are labelled SUPPORTING signals / associations, never the verdict and
 * never a risk score. Rules decide; these explain.
 */

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import ShowDetails from "@/components/common/ShowDetails";
import MethodologyLink from "@/components/common/MethodologyLink";
import { SIGNAL_PACK_CAVEAT } from "@/lib/methodologyCaveats";
import { loadTeamSignalPack, loadPlayerSignalPack, type PlayerSignalPack } from "@/lib/micropulse/signalPack/loader";
import type { SignalContributor } from "@/lib/micropulse/signalPack";

function sevColor(s: number): string { return s > 0.6 ? "#a83e28" : s > 0.3 ? "#de9328" : "#94a3b8"; }

export default function SignalPackCard({ teamId, playerId, asOf }: { teamId?: string | null; playerId?: string | null; asOf?: string }) {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [lang] = useLang();
  const IS = lang === "IS";
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<PlayerSignalPack[]>([]);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const date = asOf ?? today;

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!teamId) { setLoading(false); return; }
      setLoading(true);
      try {
        if (playerId) { const r = await loadPlayerSignalPack(supabase, teamId, playerId, date); if (alive) setRows(r ? [r] : []); }
        else { const r = await loadTeamSignalPack(supabase, teamId, date); if (alive) setRows(r); }
      } catch { if (alive) setRows([]); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [teamId, playerId, date, supabase]);

  const pick = (b: { en: string; is: string }) => (IS ? b.is : b.en);
  const flaggedPlayers = rows.filter((r) => r.pack.flaggedCount > 0)
    .sort((a, b) => b.pack.flaggedCount - a.pack.flaggedCount);

  if (!teamId) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-slate-900">{IS ? "Merkja-yfirferð" : "Signal check"}</span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-semibold uppercase text-slate-500"
          title={IS ? "Vitnaðar fylgnir, ekki dómur eða áhættutala. Reglur ákveða; merkin útskýra." : "Cited associations, not a verdict or risk score. Rules decide; signals explain."}>
          {IS ? "Stuðnings-merki" : "Supporting signals"}
        </span>
      </div>
      <p className="mt-1 text-[12px] text-slate-500">
        {IS
          ? "Nefnd, vitnuð merki úr rannsóknum — hvert á eigin viðmiðun leikmanns, með mótdæmi. Aldrei litur, aldrei áhættu-prósenta."
          : "Named, cited signals from the literature — each on the player's own norm, with a counterfactual. Never a colour, never a risk %."}
      </p>

      {loading ? (
        <div className="mt-3 text-sm text-slate-400">{IS ? "Reikna merki…" : "Computing signals…"}</div>
      ) : flaggedPlayers.length === 0 ? (
        <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800">
          {playerId
            ? (IS ? "Engin hækkuð merki hjá honum." : "No elevated signals for him.")
            : (IS ? "Engin hækkuð merki hjá liðinu." : "No elevated signals across the squad.")}
        </div>
      ) : (
        <>
          {!playerId && (
            <div className="mt-1 text-[13px] font-medium text-slate-800">
              {IS ? `${flaggedPlayers.length} leikm. með hækkað merki — skoða.` : `${flaggedPlayers.length} player${flaggedPlayers.length === 1 ? "" : "s"} carrying an elevated signal — worth a look.`}
            </div>
          )}
          <div className="mt-2 space-y-2">
            {flaggedPlayers.map((r) => (
              <div key={r.playerId} className="rounded-lg border border-slate-200 p-2.5">
                <div className="text-sm font-medium text-slate-900">{r.playerName}</div>
                <div className="mt-1 space-y-1.5">
                  {r.pack.contributors.filter((c) => c.flagged).map((c) => (
                    <Contributor key={c.key} c={c} IS={IS} pick={pick} />
                  ))}
                </div>
              </div>
            ))}
          </div>

          <ShowDetails label={{ EN: "Behind the numbers", IS: "Á bak við tölurnar" }}>
            <div className="space-y-2 text-[11px] leading-relaxed text-slate-600">
              {flaggedPlayers.map((r) => (
                <div key={r.playerId}>
                  <div className="font-semibold text-slate-700">{r.playerName}</div>
                  <ul className="mt-0.5 list-inside list-disc space-y-0.5">
                    {r.pack.contributors.filter((c) => c.flagged).map((c) => (
                      <li key={c.key}>{pick(c.detail)} <span className="text-slate-400">· {c.citation}</span></li>
                    ))}
                  </ul>
                </div>
              ))}
              <p className="pt-1 text-slate-400">
                {IS
                  ? "Röðun: flögguð merki fyrst, eftir alvarleika. Engin gögn (GPS/CMJ/svefn/meiðsli) → ekkert merki, aldrei núll. Eigin-norm alls staðar."
                  : "Ranked: flagged signals first, by severity. No data (GPS/CMJ/sleep/injury) → no signal, never zero. Own-norm throughout."}
              </p>
            </div>
            <MethodologyLink caveat={SIGNAL_PACK_CAVEAT} />
          </ShowDetails>
        </>
      )}
    </div>
  );
}

function Contributor({ c, IS, pick }: { c: SignalContributor; IS: boolean; pick: (b: { en: string; is: string }) => string }) {
  const conf = c.confidence === "low" ? (IS ? "lítil vissa" : "low confidence") : c.confidence === "moderate" ? (IS ? "miðlungs vissa" : "moderate confidence") : (IS ? "mikil vissa" : "high confidence");
  return (
    <div className="flex gap-2 text-[12px] leading-snug">
      <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: sevColor(c.severity) }} title={pick(c.detail)} />
      <div className="min-w-0">
        <span className="font-medium text-slate-800">{pick(c.label)}:</span> <span className="text-slate-700">{pick(c.why)}</span>
        {c.counterfactual && <span className="italic text-slate-500"> ↑ {pick(c.counterfactual)}</span>}
        <span className="ml-1 text-[10px] text-slate-400">· {c.confidence === "low" ? <span className="text-amber-600">{conf}</span> : conf}</span>
      </div>
    </div>
  );
}
