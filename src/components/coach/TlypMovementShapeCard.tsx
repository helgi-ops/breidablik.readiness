"use client";

/**
 * TlypMovementShapeCard — "Train like you Play" at the MOVEMENT-SHAPE level.
 *
 * Overlays a player's IMA-clock movement rose IN GAMES (dashed) against his rose IN
 * TRAINING (solid), on 12 clock directions, and names where training under/over-does
 * the directions he actually moves in during matches. The shape answer to the page's
 * magnitude board: not "how much" but "does he move the same WAY he plays?".
 *
 * Reads /api/coach/player/[id]/train-vs-play-shape. Reuses the shared ImaClockRadar.
 * Layered read (explainability-first): bold one-line verdict → 2–3 plain facts → raw
 * 12-direction table + coverage behind "Show details". Pro/Catapult only (needs the
 * IMA clock); honest coverage + confidence. Descriptive — never the readiness colour.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import ShowDetails from "@/components/common/ShowDetails";
import ImaClockRadar from "@/components/coach/ImaClockRadar";

type Dir = { dir: string; label: string; game: number; train: number; delta: number };
type Resp = {
  ok: boolean; hasData: boolean; name: string | null;
  nMatchesWithClock: number; nTrainWithClock: number;
  confident?: boolean; calibrating?: boolean; flagged?: boolean; tvdFlag?: number;
  tvd?: number | null;
  gameVector?: Record<string, number>; trainVector?: Record<string, number>;
  gameLoadShare?: Record<string, number> | null; trainLoadShare?: Record<string, number> | null;
  gameLoadPerMin?: number | null; trainLoadPerMin?: number | null; loadPerMinRatio?: number | null;
  perDirection?: Dir[]; underTrained?: Dir[]; overTrained?: Dir[];
  topGameDir?: Dir | null; topTrainDir?: Dir | null;
};

// Clock number (12 = straight forward, clockwise) → plain word, EN/IS. Matches DIRECTION_LABEL.
const DIR_WORD: Record<string, { en: string; is: string }> = {
  "12": { en: "forward", is: "áfram" }, "1": { en: "forward-right", is: "áfram-hægri" },
  "2": { en: "right-forward", is: "hægri-áfram" }, "3": { en: "right", is: "hægri" },
  "4": { en: "right-back", is: "hægri-aftur" }, "5": { en: "back-right", is: "aftur-hægri" },
  "6": { en: "backward", is: "afturábak" }, "7": { en: "back-left", is: "aftur-vinstri" },
  "8": { en: "left-back", is: "vinstri-aftur" }, "9": { en: "left", is: "vinstri" },
  "10": { en: "left-forward", is: "vinstri-áfram" }, "11": { en: "forward-left", is: "áfram-vinstri" },
};
const pct = (v: number | undefined | null) => `${Math.round((v ?? 0) * 100)}%`;

export default function TlypMovementShapeCard({ players, playerId }: { players: Array<{ id: string; name: string }>; playerId?: string }) {
  const [lang] = useLang();
  const is = lang === "IS";
  const [selInternal, setSelInternal] = React.useState("");
  const sel = playerId ?? selInternal;
  const [data, setData] = React.useState<Resp | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [mode, setMode] = React.useState<"density" | "load">("density");

  const dirWord = (d: string) => (DIR_WORD[d] ? (is ? DIR_WORD[d].is : DIR_WORD[d].en) : d);
  const token = React.useCallback(async () => (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? null, []);
  React.useEffect(() => { if (!playerId && !selInternal && players.length) setSelInternal(players[0].id); }, [players, selInternal, playerId]);

  React.useEffect(() => {
    if (!sel) { setData(null); return; }
    let alive = true; setLoading(true);
    (async () => {
      try {
        const tok = await token(); if (!tok) return;
        const res = await fetch(`/api/coach/player/${sel}/train-vs-play-shape`, { headers: { Authorization: `Bearer ${tok}` }, cache: "no-store" });
        const j = (await res.json().catch(() => null)) as Resp | null;
        if (alive) setData(j && j.ok ? j : null);
      } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [sel, token]);

  const hasLoad = !!(data?.gameLoadShare && data?.trainLoadShare);
  const effMode = mode === "load" && hasLoad ? "load" : "density";
  const tvdPct = data?.tvd != null ? Math.round(data.tvd * 100) : null;

  // Verdict (bold, plain) — composed here so it's bilingual.
  const verdict = (() => {
    if (!data?.hasData) return null;
    const under = data.underTrained?.[0];
    if (data.flagged && under) {
      return is
        ? `Æfir ~${tvdPct}% frá því hvernig hann spilar. Stærsta gatið: ${dirWord(under.dir)} — ${pct(under.game)} af leik-hreyfingum en ${pct(under.train)} á æfingu.`
        : `Trains ~${tvdPct}% off how he plays. Biggest gap: ${dirWord(under.dir)} — ${pct(under.game)} of his game moves vs ${pct(under.train)} in training.`;
    }
    if (data.confident) {
      return is
        ? `Æfir líkt og hann spilar — hreyfi-lögun innan ~${tvdPct}% af leik-löguninni.`
        : `Trains close to how he plays — movement shape within ~${tvdPct}% of his game shape.`;
    }
    return is
      ? `Að kvarða — þarf ≥5 leiki með IMA-klukku fyrir öruggan samanburð (${data.nMatchesWithClock} núna).`
      : `Calibrating — needs ≥5 clocked matches for a confident read (${data.nMatchesWithClock} so far).`;
  })();

  const loadGapFact = (() => {
    const r = data?.loadPerMinRatio;
    if (r == null) return null;
    const p = Math.round(r * 100);
    const soft = r < 0.9, hard = r > 1.1;
    return is
      ? `Æfir á ~${p}% af hliðar-/stefnuálagi leiks á mínútu${soft ? " — mýkri á æfingu" : hard ? " — harðari á æfingu" : ""}.`
      : `Trains at ~${p}% of his game change-of-direction load per minute${soft ? " — softer in training" : hard ? " — harder in training" : ""}.`;
  })();

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold text-slate-800">{is ? "Hreyfir hann sig eins og í leik? (IMA-klukka)" : "Does he move like he plays? (IMA clock)"}</span>
        <span className="cursor-help rounded bg-[#2740e6]/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#2740e6]"
          title={is
            ? "Ber saman hreyfi-lögun leikmannsins í LEIK (strikað) við ÆFINGU (heilt) yfir 12 klukku-stefnur úr IMA. Svarar hvort hann æfir sömu stefnur og hann hreyfist í leik — ekki bara magnið. PROXY fyrir stefnu/álag (AU), ekki W/kg. Reglur reikna, ekki AI. Lýsandi — aldrei readiness."
            : "Compares the player's movement shape IN GAMES (dashed) vs IN TRAINING (solid) across 12 IMA clock directions. Answers whether he trains the directions he actually plays in — not just the amount. A proxy for direction/load (AU), not W/kg. Rules compute, not AI. Descriptive — never readiness."}>
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
          {is
            ? `Engin IMA-klukku gögn fyrir leik og æfingu enn (${data.nMatchesWithClock} leikir, ${data.nTrainWithClock} æfingar með klukku).`
            : `No IMA clock data for games and training yet (${data.nMatchesWithClock} matches, ${data.nTrainWithClock} sessions with the clock).`}
        </p>
      ) : null}

      {!loading && data?.hasData ? (
        <div className="mt-3 space-y-3">
          {/* (0) Verdict, boldest, first. */}
          <p className={`text-[13px] font-semibold leading-snug ${data.flagged ? "text-[#a8632a]" : "text-slate-800"}`}>{verdict}</p>

          {/* (1) 2–3 plain facts. */}
          <div className="space-y-1 text-[12px] text-slate-600">
            {data.topGameDir && data.topTrainDir ? (
              <p>
                {is ? "Hreyfist mest " : "Moves most "}<b>{dirWord(data.topGameDir.dir)}</b>{is ? " í leik; mest " : " in games; most "}
                <b>{dirWord(data.topTrainDir.dir)}</b>{is ? " á æfingu." : " in training."}
              </p>
            ) : null}
            {data.underTrained && data.underTrained.length ? (
              <p>
                {is ? "Vanþjálfaðar stefnur (meira í leik): " : "Under-trained (more in games): "}
                <b>{data.underTrained.slice(0, 2).map((d) => dirWord(d.dir)).join(is ? ", " : ", ")}</b>.
              </p>
            ) : null}
            {data.overTrained && data.overTrained.length ? (
              <p>
                {is ? "Ofþjálfaðar stefnur (meira á æfingu): " : "Over-trained (more in training): "}
                <b>{data.overTrained.slice(0, 2).map((d) => dirWord(d.dir)).join(is ? ", " : ", ")}</b>.
              </p>
            ) : null}
            {loadGapFact ? <p>{loadGapFact}</p> : null}
          </div>

          {/* Radar view toggle: density (where he moves) vs load (how hard he cuts there). */}
          {hasLoad ? (
            <div className="flex justify-center gap-1">
              {(["density", "load"] as const).map((m) => (
                <button key={m} onClick={() => setMode(m)}
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${effMode === m ? "bg-[#2740e6] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                  {m === "density" ? (is ? "Þéttleiki" : "Density") : (is ? "Álags-lögun" : "Load shape")}
                </button>
              ))}
            </div>
          ) : null}

          {/* Game = dashed reference, Training = solid. */}
          {effMode === "density" ? (
            <ImaClockRadar usual={data.gameVector ?? null} recent={data.trainVector ?? {}} flagged={!!data.flagged} />
          ) : (
            <ImaClockRadar usual={data.gameLoadShare ?? null} recent={data.trainLoadShare ?? {}} flagged={!!data.flagged} />
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
            <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-4 border-t border-dashed border-slate-400" /> {is ? "Í leik" : "In games"}</span>
            <span className="flex items-center gap-1"><span className={`inline-block h-0.5 w-4 ${data.flagged ? "bg-[#de9328]" : "bg-[#1c7a4a]"}`} /> {is ? "Á æfingu" : "In training"}</span>
            <span className="ml-auto">
              {data.confident ? (is ? "full vissa" : "confident") : data.calibrating ? (is ? "að kvarða" : "calibrating") : (is ? "lítil vissa" : "low confidence")}
              {" · "}{data.nMatchesWithClock} {is ? "leikir" : "matches"} · {data.nTrainWithClock} {is ? "æfingar" : "sessions"}
            </span>
          </div>

          <ShowDetails label={{ EN: "Show the 12 directions", IS: "Sýna stefnurnar 12" }}>
            <table className="w-full text-[12px]">
              <thead><tr className="border-b border-slate-200 text-left text-[10px] uppercase tracking-wide text-slate-500">
                <th className="py-1 font-medium">{is ? "Stefna" : "Direction"}</th>
                <th className="py-1 text-right font-medium">{is ? "Í leik" : "In games"}</th>
                <th className="py-1 text-right font-medium">{is ? "Á æfingu" : "In training"}</th>
                <th className="py-1 text-right font-medium">{is ? "Munur" : "Gap"}</th>
              </tr></thead>
              <tbody className="tabular-nums text-slate-700">
                {(data.perDirection ?? []).map((d) => (
                  <tr key={d.dir} className="border-b border-slate-100">
                    <td className="py-1 text-slate-600">{dirWord(d.dir)}</td>
                    <td className="py-1 text-right">{pct(d.game)}</td>
                    <td className="py-1 text-right text-slate-500">{pct(d.train)}</td>
                    <td className={`py-1 text-right ${d.delta > 0.04 ? "text-[#a8632a]" : d.delta < -0.04 ? "text-[#2740e6]" : "text-slate-400"}`}>
                      {d.delta > 0 ? "+" : ""}{Math.round(d.delta * 100)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[11px] text-slate-400">
              {is
                ? "Munur = leik% − æfing%. Jákvætt (rautt) = stefna sem hann gerir meira í leik en á æfingu (vanþjálfuð). IMA-klukka úr Catapult; stefna er miðuð við hlaupastefnu (12 = beint áfram), proxy fyrir stefnu/álag (AU), ekki W/kg."
                : "Gap = game% − training%. Positive (red) = a direction he does more in games than training (under-trained). IMA clock from Catapult; direction is unit-relative (12 = straight forward), a proxy for direction/load (AU), not W/kg."}
            </p>
          </ShowDetails>

          <p className="text-[11px] text-slate-400">
            {is
              ? "Fjölstefnu-lögun úr IMA (Buchheit 2014) — leikur vs æfing. Reglur reikna, ekki AI. Lýsandi — snertir aldrei readiness."
              : "Multidirectional shape from IMA (Buchheit 2014) — games vs training. Rules compute, not AI. Descriptive — never touches readiness."}
          </p>
        </div>
      ) : null}
    </div>
  );
}
