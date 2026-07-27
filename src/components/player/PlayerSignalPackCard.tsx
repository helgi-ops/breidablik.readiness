"use client";

/**
 * PlayerSignalPackCard — the player-facing Explainable Signal Pack.
 *
 * Same engine as the coach surface (loadPlayerSignalPack), rendered in the PLAYER
 * voice: second-person, plain-language, on the player's OWN norm. These are labelled
 * SUPPORTING signals — cited associations from the research — never the verdict colour
 * and never a risk score. Rules decide the colour; these only explain.
 *
 * Silent on clean days: when nothing is flagged the card renders nothing, so Today
 * stays uncluttered and the card is "loud only when there's something to say" —
 * matching the rest of the player app (PlayerWhyFlaggedCard philosophy).
 *
 * Manifesto: principle #1 (provenance — every signal carries its citation), #2 (plain
 * language, jargon behind a toggle), #3 (counterfactual visible), #8 (two audiences,
 * same engine, different voice).
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { loadPlayerSignalPack, type PlayerSignalPack } from "@/lib/micropulse/signalPack/loader";
import type { SignalContributor } from "@/lib/micropulse/signalPack";

function sevColor(s: number): string { return s > 0.6 ? "#a83e28" : s > 0.3 ? "#de9328" : "#94a3b8"; }

export default function PlayerSignalPackCard({
  playerId,
  teamId,
  lang = "EN",
}: {
  playerId?: string | null;
  teamId?: string | null;
  lang?: "IS" | "EN";
}) {
  const IS = lang === "IS";
  const [pack, setPack] = React.useState<PlayerSignalPack | null>(null);
  const [loading, setLoading] = React.useState(true);
  const today = React.useMemo(() => new Date().toISOString().slice(0, 10), []);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      if (!teamId || !playerId) { setLoading(false); return; }
      setLoading(true);
      try {
        const sb = getSupabaseClient();
        // Player voice → second-person "your …" strings (Icelandic gender-correct).
        const r = await loadPlayerSignalPack(sb, teamId, playerId, today, "player");
        if (alive) setPack(r);
      } catch { if (alive) setPack(null); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [teamId, playerId, today]);

  const pick = (b: { en: string; is: string }) => (IS ? b.is : b.en);
  const flagged = (pack?.pack.contributors ?? []).filter((c) => c.flagged);

  // Silent on clean days / while loading / with no data — the card only appears
  // when there's an actual supporting signal to explain.
  if (loading || !pack || flagged.length === 0) return null;

  return (
    <div data-player-card="signal-pack" className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-base">🔎</span>
        <span className="text-sm font-bold text-zinc-900">
          {IS ? "Það sem gögnin þín sýna" : "What your data is flagging"}
        </span>
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-zinc-500"
          title={IS ? "Vitnaðar vísbendingar úr rannsóknum — ekki liturinn þinn eða áhættutala." : "Cited pointers from the research — not your colour, not a risk score."}>
          {IS ? "Stuðnings-merki" : "Supporting signals"}
        </span>
      </div>
      <p className="mt-1 text-[12px] leading-relaxed text-zinc-500">
        {IS
          ? "Nefndar, vitnaðar vísbendingar — hver á þinni eigin viðmiðun, með því sem myndi hreinsa hana. Þetta breytir ekki litnum þínum."
          : "Named, cited pointers — each on your own norm, with what would clear it. These don't change your colour."}
      </p>

      <div className="mt-3 space-y-1.5">
        {flagged.map((c) => (
          <Contributor key={c.key} c={c} IS={IS} pick={pick} />
        ))}
      </div>

      <details className="mt-3 group/behind">
        <summary className="flex cursor-pointer select-none list-none items-center gap-1.5 text-xs font-semibold text-zinc-500 hover:text-zinc-700">
          <span className="transition group-open/behind:rotate-90">▸</span>
          {IS ? "Á bak við tölurnar" : "Behind the numbers"}
        </summary>
        <div className="mt-2 space-y-1.5 rounded-xl border border-zinc-200 bg-white/70 p-3 text-[11px] leading-relaxed text-zinc-600">
          <ul className="list-inside list-disc space-y-1">
            {flagged.map((c) => (
              <li key={c.key}>{pick(c.detail)} <span className="text-zinc-400">· {c.citation}</span></li>
            ))}
          </ul>
          <p className="pt-1 text-zinc-400">
            {IS
              ? "Öll á þinni eigin viðmiðun. Vantar gögn (GPS/stökk/svefn/meiðsli) → ekkert merki, aldrei núll. Þetta útskýrir — það ræður ekki litnum."
              : "All on your own norm. Missing data (GPS/jump/sleep/injury) → no signal, never a zero. These explain — they don't decide the colour."}
          </p>
        </div>
      </details>
    </div>
  );
}

function Contributor({ c, IS, pick }: { c: SignalContributor; IS: boolean; pick: (b: { en: string; is: string }) => string }) {
  const lowConf = c.confidence === "low";
  return (
    <div className="flex gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[13px] leading-snug text-zinc-800">
      <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: sevColor(c.severity) }} />
      <div className="min-w-0">
        <span className="font-semibold">{pick(c.label)}:</span> <span>{pick(c.why)}</span>
        {c.counterfactual && <span className="italic text-zinc-500"> {pick(c.counterfactual)}</span>}
        {lowConf && (
          <span className="ml-1 text-[10px] text-amber-600">
            · {IS ? "byggt á takmörkuðum gögnum enn" : "based on limited data so far"}
          </span>
        )}
      </div>
    </div>
  );
}
