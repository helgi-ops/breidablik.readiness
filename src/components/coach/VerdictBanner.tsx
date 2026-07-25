"use client";

/**
 * VerdictBanner — the shared explainability-first header for coach analysis
 * pages (docs/explainability-first.md).
 *
 * One plain-language verdict in a traffic-light tone, a confidence chip, and
 * named drivers/exceptions — the exact pattern Load Intelligence (LoadVerdictCard)
 * and Indoor Load already use, factored out so every page reads the same way.
 *
 * Rules decide, this only renders. The page computes {tone, sentence, confidence,
 * drivers} deterministically from data it already has and drops the banner on top;
 * the dense S&C content stays UNCHANGED below it. Jargon (IMA, ACWR, HSR, FMP…)
 * belongs in driver tooltips / the optional subtitle, never the headline sentence.
 */

import * as React from "react";

export type Lang = "EN" | "IS";
type L = { EN: string; IS: string };
type Txt = L | string;

export type VerdictTone = "good" | "watch" | "concern" | "neutral";
export type ConfidenceLevel = "high" | "moderate" | "low";

export type VerdictDriver = {
  /** Short plain label, e.g. a player first name or a signal name. */
  label: string;
  /** Optional secondary text shown after a dot, e.g. "braking load". */
  detail?: Txt;
  /** Tooltip — the place jargon + the paper citation live (e.g. "McBurnie 2022"). */
  tip?: Txt;
  /** Tone for the driver chip; defaults to the banner tone. */
  tone?: VerdictTone;
};

export type VerdictBannerProps = {
  lang: Lang;
  tone: VerdictTone;
  /** The one-sentence verdict a non-S&C coach reads in five seconds. */
  sentence: Txt;
  /** Optional plain-language explainer line under the sentence (no raw jargon). */
  subtitle?: Txt;
  /** Optional "what to do" — a plain coaching prompt with its reasoning (coach's call). */
  action?: Txt;
  /** Confidence — never hidden (principle #4). Pass level and/or a note. */
  confidence?: { level?: ConfidenceLevel; note?: Txt } | null;
  /** Named drivers / exceptions — the "why" (principle #1). */
  drivers?: VerdictDriver[];
  /** Optional small kicker label shown above the sentence (e.g. a plain page name). */
  kicker?: Txt;
};

const TONE: Record<VerdictTone, { wrap: string; chip: string; accent: string }> = {
  good: { wrap: "border-emerald-200 bg-emerald-50/60", chip: "bg-emerald-100 text-emerald-800 border-emerald-200", accent: "bg-emerald-400" },
  watch: { wrap: "border-amber-200 bg-amber-50/60", chip: "bg-amber-100 text-amber-800 border-amber-200", accent: "bg-amber-400" },
  concern: { wrap: "border-red-200 bg-red-50/60", chip: "bg-red-100 text-red-800 border-red-200", accent: "bg-red-400" },
  neutral: { wrap: "border-slate-200 bg-white", chip: "bg-slate-100 text-slate-700 border-slate-200", accent: "bg-slate-300" },
};

const CONF_LABEL: Record<ConfidenceLevel, L> = {
  high: { EN: "high", IS: "mikil" },
  moderate: { EN: "moderate", IS: "miðlungs" },
  low: { EN: "low", IS: "lítil" },
};

export default function VerdictBanner({ lang, tone, sentence, subtitle, action, confidence, drivers, kicker }: VerdictBannerProps) {
  const IS = lang === "IS";
  const tx = (t?: Txt): string => (t == null ? "" : typeof t === "string" ? t : IS ? t.IS : t.EN);
  const tones = TONE[tone];

  return (
    <div className={`relative overflow-hidden rounded-xl border ${tones.wrap} p-4 shadow-sm`}>
      {/* Tone accent rail */}
      <div className={`absolute inset-y-0 left-0 w-1 ${tones.accent}`} aria-hidden />

      <div className="pl-2">
        {/* Kicker + rules-not-AI label */}
        <div className="flex flex-wrap items-center gap-2">
          {kicker != null && (
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{tx(kicker)}</span>
          )}
          <span className="text-[11px] text-slate-400" title={IS ? "Reglur ákveða — ekki AI" : "Rules decide — not AI"}>
            {IS ? "Niðurstaða" : "Verdict"}
          </span>
        </div>

        {/* The one-sentence verdict */}
        <p className="mt-1 text-[15px] font-semibold leading-snug text-slate-900">{tx(sentence)}</p>

        {/* Optional plain-language explainer */}
        {subtitle != null && <p className="mt-1 text-[13px] leading-snug text-slate-600">{tx(subtitle)}</p>}

        {/* Optional "what to do" — plain coaching prompt with its reasoning */}
        {action != null && (
          <div className="mt-2 flex gap-1.5 rounded-lg border border-slate-200 bg-white/70 px-2.5 py-1.5 text-[12px] leading-snug text-slate-700">
            <span className="shrink-0 font-semibold">{IS ? "Hvað á að gera:" : "What to do:"}</span>
            <span>{tx(action)}</span>
          </div>
        )}

        {/* Confidence chip — never hidden */}
        {confidence != null && (confidence.level != null || confidence.note != null) && (
          <div
            className="mt-2 inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white/70 px-2 py-0.5 text-[11px] text-slate-600"
            title={IS ? "Þekja merkja + grunnlínu-þroski" : "Signal coverage + baseline maturity"}
          >
            <span className="font-medium">{IS ? "Vissa" : "Confidence"}:</span>
            {confidence.level != null && <span>{tx(CONF_LABEL[confidence.level])}</span>}
            {confidence.note != null && <span className="text-slate-400">· {tx(confidence.note)}</span>}
          </div>
        )}

        {/* Drivers / named exceptions — the "why" */}
        {drivers != null && drivers.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {drivers.map((d, i) => {
              const dt = TONE[d.tone ?? tone];
              return (
                <span
                  key={`${d.label}-${i}`}
                  className={`rounded border px-2 py-0.5 text-[11px] ${dt.chip}`}
                  title={d.tip != null ? tx(d.tip) : undefined}
                >
                  {d.label}
                  {d.detail != null && <span className="font-normal opacity-80"> · {tx(d.detail)}</span>}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
