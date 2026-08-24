"use client";

/**
 * Robustness watch (fusion #5) — the LABELLED injury early-warning read for one
 * player. Sits NEXT TO the readiness colour and never becomes it: a "steady" /
 * "watch" / "elevated" WORD level, the ranked plain "why" contributors (each with
 * a counterfactual), the neuromuscular fatigue type, and the forward trajectory.
 *
 * Layered read (manifesto): (0) one-sentence verdict, bold + first; (1) 2-3 plain
 * flagged contributors with counterfactuals; (2) raw z-scores / thresholds /
 * citations + provenance behind "Show details". Confidence always. No single
 * injury-probability number — the ML literature is decisive that a classifier
 * over-flags at this squad size (Haller 2023 / Leckey 2024): we surface the
 * signals, personal-norm + confidence + counterfactual, and let the coach read
 * them. Rules compute; this is not AI.
 *
 * Descriptive / advisory only. It never changes the readiness colour, the load
 * target, or the daily decision.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import ShowDetails from "@/components/common/ShowDetails";
import type { RobustnessWatch, RobustnessLevel } from "@/lib/micropulse/robustnessWatch";

type Resp = { ok: boolean; name: string | null; watch: RobustnessWatch };

const LEVEL_TONE: Record<RobustnessLevel, { dot: string; text: string; chipBg: string; chipText: string }> = {
  steady: { dot: "#1c7a4a", text: "text-[#1c7a4a]", chipBg: "#e6f2ec", chipText: "#1c7a4a" },
  watch: { dot: "#de9328", text: "text-[#a86f14]", chipBg: "#fbf0dc", chipText: "#a86f14" },
  elevated: { dot: "#a83e28", text: "text-[#a83e28]", chipBg: "#f6e2dc", chipText: "#a83e28" },
};

const levelWord = (l: RobustnessLevel, is: boolean): string =>
  is ? { steady: "Stöðug", watch: "Fylgstu með", elevated: "Hækkað" }[l]
     : { steady: "Steady", watch: "Watch", elevated: "Elevated" }[l];

const confWord = (c: "low" | "moderate" | "high", is: boolean): string =>
  is ? { low: "lág", moderate: "meðal", high: "há" }[c] : c;

const trendWord = (t: RobustnessWatch["trend"], is: boolean): string | null => {
  if (t === "improving") return is ? "batnar" : "improving";
  if (t === "declining") return is ? "lækkar" : "declining";
  if (t === "sharply_declining") return is ? "lækkar skarpt" : "sharply declining";
  return null; // stable → nothing worth saying
};

export default function RobustnessWatchCard({ selectedPlayerId, date }: { selectedPlayerId: string; date?: string }) {
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
        const qs = date ? `?date=${encodeURIComponent(date)}` : "";
        const res = await fetch(`/api/coach/player/${selectedPlayerId}/robustness-watch${qs}`, {
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
  }, [selectedPlayerId, date, is]);

  const title = is ? "Álagsþol — snemmbúið eftirlit" : "Robustness watch";

  if (!selectedPlayerId) {
    return (
      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="text-sm font-bold text-slate-800">{title}</div>
        <p className="mt-1 text-[13px] text-slate-500">
          {is ? "Veldu leikmann til að sjá álagsþols-eftirlit hans." : "Pick a player to see his robustness watch."}
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
            ? "Sjálfstætt, merkt viðvörunar-merki sem situr VIÐ HLIÐINA á áreiðanleika-litnum og breytir honum aldrei. Engin ein meiðsla-líkindatala — við sýnum merkin (eigin-viðmið, tilvitnuð, með áreiðanleika og gagn-staðreynd)."
            : "A standalone, labelled early-warning read that sits NEXT TO the readiness colour and never changes it. No single injury-probability number — we surface the signals (personal-norm, cited, with confidence + counterfactual)."}
        >
          {is ? "eftirlit ⓘ" : "watch ⓘ"}
        </span>
      </div>

      {loading ? <p className="mt-3 text-[13px] text-slate-400">…</p> : null}
      {err ? <p className="mt-3 text-[13px] font-medium text-red-700">{err}</p> : null}

      {data && !loading && !err ? (() => {
        const w = data.watch;
        const tone = LEVEL_TONE[w.level];
        const flagged = w.contributors.filter((c) => c.flagged);
        const shown = flagged.slice(0, 3);
        const trend = trendWord(w.trend, is);

        return (
          <div className="mt-3 space-y-2">
            {/* Layer 0 — verdict, bold + first, with a level chip. */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tone.dot }} />
              <span className={`text-sm font-bold ${tone.text}`}>{is ? w.verdict.is : w.verdict.en}</span>
              <span
                className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                style={{ backgroundColor: tone.chipBg, color: tone.chipText }}
              >
                {levelWord(w.level, is)}
              </span>
            </div>

            {/* Layer 1 — plain flagged contributors + counterfactuals. */}
            {shown.length ? (
              <ul className="space-y-1.5 text-[13px] text-slate-600">
                {shown.map((c) => (
                  <li key={c.key}>
                    • {is ? c.why.is : c.why.en}
                    {c.counterfactual ? (
                      <span className="block pl-3 text-[12px] text-slate-400">↳ {is ? c.counterfactual.is : c.counterfactual.en}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-slate-500">
                {is ? "Engin merki yfir hans eigin viðmiði núna." : "No signals above his own norm right now."}
              </p>
            )}

            {/* Confidence + fatigue type + trend line. */}
            <p className="text-[11px] text-slate-400">
              {is ? "Áreiðanleiki" : "Confidence"}: {confWord(w.confidence, is)}
              {w.fatigueType ? ` · ${is ? "þreytutegund" : "fatigue type"}: ${w.fatigueType}` : ""}
              {trend ? ` · ${is ? "þróun" : "trend"}: ${trend}` : ""}
            </p>

            {/* Layer 2 — raw z-scores / thresholds / citations + provenance. */}
            <ShowDetails
              label={{ EN: "Show the signals behind this", IS: "Sýna merkin á bak við þetta" }}
              hint={{ EN: "each signal vs his own norm, with thresholds + citation", IS: "hvert merki vs eigin viðmið, með mörkum + tilvitnun" }}
            >
              <div className="space-y-2 text-[12px]">
                <ul className="space-y-2">
                  {w.contributors.map((c) => (
                    <li key={c.key} className="border-b border-slate-100 pb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-700">{is ? c.label.is : c.label.en}</span>
                        {c.flagged ? <span className="rounded bg-[#f6e2dc] px-1 py-0.5 text-[9px] font-semibold uppercase text-[#a83e28]">{is ? "flagg" : "flag"}</span> : null}
                        <span className="ml-auto text-[10px] text-slate-400">{is ? "áreiðanl." : "conf."} {confWord(c.confidence, is)}</span>
                      </div>
                      <p className="mt-0.5 leading-relaxed text-slate-500">{is ? c.detail.is : c.detail.en}</p>
                      <p className="text-[10px] text-slate-400">{c.citation}</p>
                    </li>
                  ))}
                </ul>
                <p className="leading-relaxed text-slate-500">
                  {is ? "Til staðar" : "Inputs present"}: {w.presentInputs.length ? w.presentInputs.join(", ") : "—"}
                  {w.missingInputs.length ? ` · ${is ? "vantar (bíður Catapult endur-samstillingar)" : "missing (awaiting Catapult re-sync)"}: ${w.missingInputs.join(", ")}` : ""}
                </p>
              </div>
            </ShowDetails>

            <p className="text-[11px] text-slate-400">
              {is ? "Reglur reikna — ekki AI. Situr við hlið litarins, breytir honum aldrei." : "Rules compute — not AI. Sits beside the colour, never changes it."} · {w.citations}
            </p>
          </div>
        );
      })() : null}
    </div>
  );
}
