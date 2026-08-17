"use client";

/**
 * Movement Style card — where a player sits on the linear ↔ multidirectional axis, read
 * squad-relative. Combines the two IMA feeds (change-of-direction clock vs fast free-running)
 * so it genuinely differentiates players, unlike the clock alone. ADI's linear-vs-
 * multidirectional distinction, IMA-native. A STYLE descriptor, not a quality. Reads
 * /api/coach/load/movement-style. Descriptive — never touches readiness. Bilingual EN/IS.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import type { StyleLabel } from "@/lib/micropulse/load/movementStyle";

type Style = { ratio: number | null; percentile: number | null; label: StyleLabel; codLoad: number | null; linearFastLoad: number | null; verdict: { en: string; is: string } };
type PositionRef = { scope: "position" | "role"; code: string; nPlayers: number; percentile: number | null; medianRatio: number; squadPctAvg: number | null };
type Resp = { ok: boolean; hasData: boolean; name: string | null; position: string | null; squadRanked?: number; style?: Style; positionRef?: PositionRef | null };

const POS_WORD: Record<string, { en: string; is: string }> = {
  GK: { en: "keepers", is: "markverðir" }, DEF: { en: "defenders", is: "varnarmenn" },
  MID: { en: "midfielders", is: "miðjumenn" }, FWD: { en: "forwards", is: "framherjar" },
};

const TONE: Record<StyleLabel, string> = {
  multidirectional: "bg-[#2740e6]/10 text-[#2740e6]",
  linear: "bg-emerald-100 text-emerald-700",
  balanced: "bg-slate-100 text-slate-600",
  insufficient: "bg-slate-100 text-slate-400",
};
const LABEL_TXT: Record<StyleLabel, { en: string; is: string }> = {
  multidirectional: { en: "Multidirectional", is: "Fjölstefnu" },
  linear: { en: "Linear runner", is: "Línulegur hlaupari" },
  balanced: { en: "Balanced", is: "Jafnvægi" },
  insufficient: { en: "—", is: "—" },
};

export default function MovementStyleCard({ players, playerId }: { players: Array<{ id: string; name: string }>; playerId?: string }) {
  const [lang] = useLang();
  const is = lang === "IS";
  const [selInternal, setSelInternal] = React.useState("");
  const sel = playerId ?? selInternal; // controlled by the page when playerId is passed
  const [data, setData] = React.useState<Resp | null>(null);
  const [loading, setLoading] = React.useState(false);

  const token = React.useCallback(async () => (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? null, []);
  React.useEffect(() => { if (!playerId && !selInternal && players.length) setSelInternal(players[0].id); }, [players, selInternal, playerId]);

  React.useEffect(() => {
    if (!sel) { setData(null); return; }
    let alive = true; setLoading(true);
    (async () => {
      try {
        const tok = await token(); if (!tok) return;
        const res = await fetch(`/api/coach/load/movement-style?player=${sel}`, { headers: { Authorization: `Bearer ${tok}` }, cache: "no-store" });
        const j = (await res.json().catch(() => null)) as Resp | null;
        if (alive) setData(j && j.ok ? j : null);
      } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [sel, token]);

  const st = data?.style ?? null;
  const pct = st?.percentile ?? null;
  const posRef = data?.positionRef ?? null;
  const posLabel = posRef ? (posRef.scope === "position" ? posRef.code : (is ? POS_WORD[posRef.code]?.is : POS_WORD[posRef.code]?.en) ?? posRef.code) : "";
  const posStyleWord = posRef?.percentile == null ? null
    : posRef.percentile >= 60 ? (is ? "fjölstefnulegri en flestir" : "more multidirectional than most")
    : posRef.percentile <= 40 ? (is ? "línulegri en flestir" : "more linear than most")
    : (is ? "dæmigert fyrir stöðuna" : "typical for the position");

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold text-slate-800">{is ? "Hreyfistíll (línulegt ↔ fjölstefnu)" : "Movement Style (linear ↔ multidirectional)"}</span>
        <span className="cursor-help rounded bg-[#2740e6]/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#2740e6]"
          title={is
            ? "Sameinar IMA-klukku (há-ákafar stefnubreytingar) og IMA free-running (hratt línulegt hlaup, bönd 5–8) í eitt stíl-hlutfall, lesið m.v. hópinn. Aðgreinir leikmenn (ólíkt klukkunni einni). STÍLL, ekki gæði — línulegur hlaupari er ekki verri. Proxy úr IMA, ekki W/kg."
            : "Combines the IMA clock (high-intensity change-of-direction) with IMA free-running (fast linear running, bands 5–8) into one style ratio, read vs the squad. It differentiates players (unlike the clock alone). A STYLE, not a quality — a linear runner isn't worse. An IMA proxy, not W/kg."}>
          {is ? "IMA-proxy ⓘ" : "IMA proxy ⓘ"}
        </span>
        {!playerId ? (
          <select value={sel} onChange={(e) => setSelInternal(e.target.value)} className="ml-auto rounded-lg border border-slate-300 px-2 py-1 text-[13px]">
            {players.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        ) : null}
      </div>

      {loading ? <p className="mt-3 text-[13px] text-slate-400">…</p> : null}

      {!loading && data && !data.hasData ? (
        <p className="mt-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-[13px] text-slate-500">
          {is ? "Ekki næg IMA-gögn fyrir þennan leikmann enn." : "Not enough IMA data for this player yet."}
        </p>
      ) : null}

      {!loading && st ? (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[12px] font-semibold ${TONE[st.label]}`}>{is ? LABEL_TXT[st.label].is : LABEL_TXT[st.label].en}</span>
            <span className="text-[13px] text-slate-600">{is ? st.verdict.is : st.verdict.en}</span>
          </div>

          {/* Position comparison — style vs same-position peers, distinct from the whole-squad rank. */}
          {posRef && posStyleWord ? (
            <p className="text-[12px] text-slate-600">
              {is ? "M.v. " : "vs "}<b>{posLabel}</b> <span className="text-slate-400">(n={posRef.nPlayers})</span>: {posStyleWord}
              {posRef.percentile != null ? <span className="text-slate-400">{is ? ` (${posRef.percentile}. percentíl í stöðu)` : ` (${posRef.percentile}th pct in position)`}</span> : null}.
            </p>
          ) : null}

          {/* linear ↔ multidirectional axis with the player's marker + his position's average marker */}
          <div>
            <div className="relative h-3 rounded-full bg-gradient-to-r from-emerald-200 via-slate-100 to-[#2740e6]/30">
              {posRef?.squadPctAvg != null ? (
                <div className="absolute top-1/2 h-5 w-0.5 -translate-x-1/2 -translate-y-1/2 bg-[#2740e6]"
                  style={{ left: `${Math.max(2, Math.min(98, posRef.squadPctAvg))}%` }} title={is ? "meðaltal stöðu" : "position average"} />
              ) : null}
              {pct != null ? (
                <div className="absolute top-1/2 h-5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-800 ring-2 ring-white"
                  style={{ left: `${Math.max(2, Math.min(98, pct))}%` }} title={`${pct}th percentile`} />
              ) : null}
            </div>
            <div className="mt-1 flex justify-between text-[11px] text-slate-400">
              <span>{is ? "Línulegur" : "Linear"}</span>
              <span>{is ? "Jafnvægi" : "Balanced"}</span>
              <span>{is ? "Fjölstefnu" : "Multidirectional"}</span>
            </div>
            {posRef?.squadPctAvg != null ? (
              <p className="mt-1 text-[10px] text-slate-400">
                <span className="mr-1 inline-block h-2 w-0.5 translate-y-[1px] bg-[#2740e6] align-middle" />
                {is ? `meðaltal ${posLabel} · ● = hann` : `${posLabel} average · ● = him`}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-slate-500">
            <span>{is ? "Stefnubreytingar (há)" : "Direction changes (high)"}: <b className="tabular-nums text-slate-700">{Math.round(st.codLoad ?? 0)}</b></span>
            <span>{is ? "Hratt línulegt PL" : "Fast linear PL"}: <b className="tabular-nums text-slate-700">{Math.round(st.linearFastLoad ?? 0)}</b></span>
            <span>{is ? "hlutfall" : "ratio"}: <b className="tabular-nums text-slate-700">{st.ratio ?? "—"}</b></span>
            {data?.squadRanked ? <span className="ml-auto">{is ? `m.v. ${data.squadRanked} leikmenn` : `vs ${data.squadRanked} players`}</span> : null}
          </div>

          <p className="text-[11px] text-slate-400">
            {is
              ? "IMA-klukka + free-running (Buchheit 2014; Gray/ADI línulegt-vs-fjölstefnu). Reglur reikna — ekki AI. Lýsandi — snertir aldrei readiness."
              : "IMA clock + free-running (Buchheit 2014; Gray/ADI linear-vs-multidirectional). Rules compute — not AI. Descriptive — never touches readiness."}
          </p>
        </div>
      ) : null}
    </div>
  );
}
