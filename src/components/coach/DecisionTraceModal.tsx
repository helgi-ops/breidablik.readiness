"use client";

/**
 * DecisionTraceModal
 *
 * Click "Show full trace" on any Daily Briefing attention row → this
 * modal opens with the complete math behind the verdict: wellness sub-
 * scores summed, personal-norm deltas per driver, load breakdown per
 * source, fatigue signature, the rule reasons that combined into the
 * verdict, and the actionable counterfactual lever.
 *
 * Aligns with explainability-first principle #1 — decision provenance
 * is mandatory. The chips and tooltips above answer "what" in pieces;
 * this answers "how was this computed?" in one place, with formulas
 * spelled out where possible.
 *
 * The component is data-only. It does not refetch; it renders whatever
 * the caller hands it in `item`. Stays out of the morning-brief flow
 * by being modal — coaches who don't want the detail never see it.
 */

import * as React from "react";

// ── Light-weight shape mirror so this component can be reused from
// anywhere that holds an AttentionItem-like object. We only require
// the fields we actually render.
type DriverChip = {
  kind: "sleep" | "energy" | "stress" | "soreness" | "dz" | "total";
  value: number;
  baselineMean?: number;
  baselineSd?: number;
  z?: number;
  baselineSource?: "personal" | "global";
  chronic?: boolean;
};

type TraceItem = {
  playerId: string;
  name: string;
  level: "alert" | "monitor" | "ok";
  reasons: string[];
  score: number | null;
  composite: number | null;
  plSpike: number | null;
  fatigueType: string | null;
  drivers: DriverChip[];
  loadBreakdown: Array<{ label: string; value: number }>;
  baselineMaturity: { obs: number; windowDays: number } | null;
  topCounterfactual?: {
    hypotheticalState: "GREEN" | "YELLOW" | "RED" | "GRAY";
    descriptionEN: string;
    descriptionIS: string;
  } | null;
};

type Props = {
  open: boolean;
  item: TraceItem | null;
  /** Today's wellness sub-scores from the underlying row, when available. */
  subscores?: {
    sleep_quality?: number | null;
    fatigue_energy?: number | null;
    stress_mood?: number | null;
    muscle_soreness?: number | null;
  } | null;
  date: string;
  lang: "IS" | "EN";
  onClose: () => void;
};

const COPY = {
  IS: {
    title: "Hvernig var litur dagsins reiknaður?",
    subtitle: (name: string, date: string) => `${name} · ${date}`,
    secWellness: "Wellness-skor",
    secWellnessFormula: "Hvert sub-skor 1-5, summan 4-20 (max). Heildar-líðan í kerfinu hækkar þetta upp í max 25.",
    secNorms: "Persónulegt viðmið",
    secNormsHint: "Hvernig sub-skor dagsins ber af venju leikmanns (Robertson 2017).",
    secLoad: "Æfingaálag",
    secLoadHint: "Hreyfingaálag í gær á móti rúllandi 28-daga meðaltali (Gabbett 2017).",
    secUnfamiliar: "Óvanalegt álag",
    unfamiliarBody: (pct: number, ratio: string) => `Hreyfingaálag í gær var +${pct}% yfir hans 28-daga vana (${ratio}×).`,
    unfamiliarTissue: "Vefir í hættu — vöðva-/sina-þreytu-merki til staðar.",
    unfamiliarWhy: "Óvant áreiti er hæsta einstaka meiðslaáhættan: líkaminn fær meira eða annað álag en hann er vanur.",
    secBreakdown: "Sundurliðun álags",
    secBreakdownHint: "Hve mikið hver tegund vinnu var yfir venjulegu í gær.",
    secFatigue: "Mynstur þreytu",
    secReasons: "Reglur sem virkjuðust",
    secCounterfactual: "Hvað gæti breytt verdict-inu",
    secMaturity: "Gæði grunnur (baseline)",
    maturityLine: (n: number, w: number) => `${n} skráningar af ${w} dögum. Lágmark 7 fyrir traustri persónulegri venju.`,
    fatigue: {
      mechanical_fatigue: "Vélrænt — accel/decel + IMA hækkað án samsvarandi PL (McBurnie 2022).",
      metabolic_fatigue: "Efnaskipta — hátt metabolic score án vélræns merkis (di Prampero 2015).",
      global_fatigue: "Heildar — bæði vélræn og efnaskiptamerki hækkuð (Gabbett 2017).",
    },
    notAvailable: "Ekki til staðar",
    close: "Loka",
    refs: "Vísanir: Gabbett 2017 (ACWR) · Buchheit 2024 (microcycle) · Robertson 2017 (persónuleg viðmið) · McBurnie 2022 (decel) · di Prampero 2015 (metabolic).",
  },
  EN: {
    title: "How was today's colour computed?",
    subtitle: (name: string, date: string) => `${name} · ${date}`,
    secWellness: "Wellness score",
    secWellnessFormula: "Each sub-score 1-5, summed 4-20 (max). The engine's overall total scales this up to 25.",
    secNorms: "Personal baseline",
    secNormsHint: "How today's sub-scores compare to his usual (Robertson 2017).",
    secLoad: "Training load",
    secLoadHint: "His movement load yesterday vs his 28-day rolling mean (Gabbett 2017).",
    secUnfamiliar: "Unfamiliar load",
    unfamiliarBody: (pct: number, ratio: string) => `Movement load yesterday was +${pct}% over his 28-day norm (${ratio}×).`,
    unfamiliarTissue: "Tissue at risk — muscle/tendon fatigue signal present.",
    unfamiliarWhy: "An unfamiliar stimulus is the single biggest injury risk: the body gets more or different load than it is used to.",
    secBreakdown: "Load breakdown",
    secBreakdownHint: "How much each type of work was above his usual yesterday.",
    secFatigue: "Fatigue signature",
    secReasons: "Rules that fired",
    secCounterfactual: "What would change the verdict",
    secMaturity: "Baseline quality",
    maturityLine: (n: number, w: number) => `${n} entries across ${w} days. Need 7+ for a trustworthy personal norm.`,
    fatigue: {
      mechanical_fatigue: "Mechanical — accel/decel + IMA elevated without matching PL (McBurnie 2022).",
      metabolic_fatigue: "Metabolic — high metabolic score without mechanical signature (di Prampero 2015).",
      global_fatigue: "Whole-system — both mechanical and metabolic signals elevated (Gabbett 2017).",
    },
    notAvailable: "Not available",
    close: "Close",
    refs: "References: Gabbett 2017 (ACWR) · Buchheit 2024 (microcycle) · Robertson 2017 (personal norms) · McBurnie 2022 (decel) · di Prampero 2015 (metabolic).",
  },
} as const;

function driverLabel(kind: DriverChip["kind"], lang: "IS" | "EN"): string {
  const is = lang === "IS";
  switch (kind) {
    case "sleep":    return is ? "Svefn" : "Sleep";
    case "energy":   return is ? "Orka" : "Energy";
    case "stress":   return is ? "Streita" : "Stress";
    case "soreness": return is ? "Strengir" : "Soreness";
    case "dz":       return is ? "Z-fall" : "Z-drop";
    case "total":    return is ? "Heildar-skor" : "Total score";
  }
}

// Standard section wrapper — keeps spacing consistent without a heavier
// primitive layer. Hoisted to module scope so React doesn't treat it as
// a new component on every render.
function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <div>
        <h3 className="text-[11px] uppercase tracking-[0.18em] font-semibold text-slate-500">{title}</h3>
        {hint ? <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

export default function DecisionTraceModal({ open, item, subscores, date, lang, onClose }: Props) {
  // Close on ESC for keyboard users.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !item) return null;
  const t = COPY[lang];

  const subSum = (() => {
    const sub = subscores ?? {};
    const a = typeof sub.sleep_quality === "number" ? sub.sleep_quality : null;
    const b = typeof sub.fatigue_energy === "number" ? sub.fatigue_energy : null;
    const c = typeof sub.stress_mood === "number" ? sub.stress_mood : null;
    const d = typeof sub.muscle_soreness === "number" ? sub.muscle_soreness : null;
    if (a == null || b == null || c == null || d == null) return null;
    return { sleep: a, energy: b, stress: c, soreness: d, sum: a + b + c + d };
  })();

  const wellnessDrivers = item.drivers.filter(
    (d) => d.kind === "sleep" || d.kind === "energy" || d.kind === "stress" || d.kind === "soreness"
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t.title}
        className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl bg-white shadow-xl"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900">{t.title}</h2>
            <p className="mt-0.5 text-xs text-slate-500">{t.subtitle(item.name, date)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            aria-label={t.close}
          >
            ✕
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* (0) Unfamiliar load — FIRST-CLASS. An unfamiliar stimulus (load well
              above his own 28-day norm) is the single biggest injury risk, so it
              leads the trace, not buried in the load breakdown. ≥70% over → red,
              otherwise amber. Only shown when actually elevated (≥50% over). */}
          {item.plSpike != null && item.plSpike >= 1.5 && (() => {
            const pct = Math.round((item.plSpike - 1) * 100);
            const red = item.plSpike >= 1.7; // ≥70% over familiar → destructive
            const tissue = item.fatigueType === "TISSUE";
            const tone = red
              ? "border-red-300 bg-red-50 text-red-800"
              : "border-amber-300 bg-amber-50 text-amber-800";
            return (
              <div className={`rounded-xl border px-4 py-3 ${tone}`}>
                <div className="flex items-center gap-2 text-sm font-bold">
                  <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" /></svg>
                  {t.secUnfamiliar}
                </div>
                <p className="mt-1 text-sm">{t.unfamiliarBody(pct, item.plSpike.toFixed(2))}</p>
                {tissue ? <p className="mt-1 text-[13px] font-medium">{t.unfamiliarTissue}</p> : null}
                <p className="mt-1 text-[11px] opacity-80">{t.unfamiliarWhy}</p>
              </div>
            );
          })()}
          {/* (1) Wellness — sum of sub-scores */}
          {subSum ? (
            <Section title={t.secWellness} hint={t.secWellnessFormula}>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-mono tabular-nums text-slate-800">
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  <span>{driverLabel("sleep", lang)} {subSum.sleep}</span>
                  <span className="opacity-50">+</span>
                  <span>{driverLabel("energy", lang)} {subSum.energy}</span>
                  <span className="opacity-50">+</span>
                  <span>{driverLabel("stress", lang)} {subSum.stress}</span>
                  <span className="opacity-50">+</span>
                  <span>{driverLabel("soreness", lang)} {subSum.soreness}</span>
                  <span className="opacity-50">=</span>
                  <span className="font-semibold">{subSum.sum}/20</span>
                </div>
                {item.score != null && item.score !== subSum.sum ? (
                  <div className="mt-1 text-[11px] text-slate-500">
                    {lang === "IS"
                      ? `Heildar-skor kerfisins: ${item.score}/25 (kerfið bætir við lokahnitum + bonus).`
                      : `Engine's overall total: ${item.score}/25 (engine adds final weights + bonus).`}
                  </div>
                ) : null}
              </div>
            </Section>
          ) : null}

          {/* (2) Personal baselines per driver */}
          {wellnessDrivers.length > 0 ? (
            <Section title={t.secNorms} hint={t.secNormsHint}>
              <ul className="rounded-lg border border-slate-200 divide-y divide-slate-100">
                {wellnessDrivers.map((d, idx) => {
                  const zStr = typeof d.z === "number" ? `${d.z >= 0 ? "+" : ""}${d.z.toFixed(2)} SD` : "—";
                  const normStr = typeof d.baselineMean === "number"
                    ? `${d.baselineMean.toFixed(1)} ± ${typeof d.baselineSd === "number" ? d.baselineSd.toFixed(1) : "?"}`
                    : (lang === "IS" ? "engin venja" : "no baseline");
                  return (
                    <li key={`${d.kind}-${idx}`} className="flex items-baseline justify-between gap-3 px-3 py-2 text-xs">
                      <span className="font-semibold text-slate-700">{driverLabel(d.kind, lang)}</span>
                      <span className="font-mono tabular-nums text-slate-600">
                        {d.value}/5 vs {normStr}
                        {" "}
                        <span className={
                          typeof d.z === "number" && d.z <= -1 ? "text-rose-700 font-semibold"
                          : typeof d.z === "number" && d.z <= -0.5 ? "text-amber-700 font-semibold"
                          : "text-slate-500"
                        }>
                          ({zStr})
                        </span>
                        {d.chronic ? (
                          <span className="ml-2 rounded border border-slate-300 bg-slate-100 px-1 text-[9px] uppercase tracking-wide text-slate-600">
                            chronic
                          </span>
                        ) : null}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Section>
          ) : null}

          {/* (3) Training load — PL spike + composite */}
          {(item.plSpike != null || item.composite != null) ? (
            <Section title={t.secLoad} hint={t.secLoadHint}>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-mono tabular-nums text-slate-800 space-y-1">
                {item.plSpike != null ? (
                  <div>
                    {lang === "IS" ? "Hreyfingaálag í gær" : "Movement load yesterday"}:
                    {" "}
                    <span className="font-semibold">{item.plSpike.toFixed(2)}×</span>
                    {" "}
                    {lang === "IS" ? "rúllandi 28-d meðaltal" : "of his 28-d rolling mean"}
                    {" = "}
                    <span className={item.plSpike >= 1.6 ? "text-rose-700 font-semibold"
                      : item.plSpike >= 1.15 ? "text-amber-700 font-semibold"
                      : "text-slate-600"}>
                      {item.plSpike >= 1 ? "+" : ""}{Math.round((item.plSpike - 1) * 100)}%
                    </span>
                  </div>
                ) : null}
                {item.composite != null ? (
                  <div>
                    {lang === "IS" ? "Heildaræfingaálag síðustu daga" : "Combined recent load"}:
                    {" "}
                    <span className={item.composite >= 0.75 ? "text-rose-700 font-semibold"
                      : item.composite >= 0.5 ? "text-amber-700 font-semibold"
                      : "text-slate-600"}>
                      {item.composite.toFixed(2)} / 1.00
                    </span>
                    {" "}
                    <span className="text-slate-500">
                      ({lang === "IS"
                        ? item.composite >= 0.75 ? "töluvert yfir venjulegu" : item.composite >= 0.5 ? "yfir venjulegu" : "innan venjulegs"
                        : item.composite >= 0.75 ? "clearly above usual" : item.composite >= 0.5 ? "above usual" : "within usual"})
                    </span>
                  </div>
                ) : null}
              </div>
            </Section>
          ) : null}

          {/* (4) Load breakdown — per-source spikes */}
          {item.loadBreakdown.length > 0 ? (
            <Section title={t.secBreakdown} hint={t.secBreakdownHint}>
              <ul className="rounded-lg border border-slate-200 divide-y divide-slate-100">
                {item.loadBreakdown.map((b, i) => {
                  const pct = Math.round((b.value - 1) * 100);
                  return (
                    <li key={i} className="flex items-baseline justify-between gap-3 px-3 py-2 text-xs">
                      <span className="font-semibold text-slate-700">{b.label}</span>
                      <span className="font-mono tabular-nums text-slate-600">
                        {b.value.toFixed(2)}× ={" "}
                        <span className={b.value >= 1.6 ? "text-rose-700 font-semibold"
                          : b.value >= 1.3 ? "text-amber-700 font-semibold"
                          : "text-slate-600"}>
                          +{pct}%
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Section>
          ) : null}

          {/* (5) Fatigue signature */}
          {item.fatigueType && item.fatigueType !== "normal" ? (
            <Section title={t.secFatigue}>
              <p className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-900 leading-relaxed">
                {t.fatigue[item.fatigueType as keyof typeof t.fatigue]}
              </p>
            </Section>
          ) : null}

          {/* (6) Rule reasons */}
          {item.reasons.length > 0 ? (
            <Section title={t.secReasons}>
              <ul className="rounded-lg border border-slate-200 divide-y divide-slate-100">
                {item.reasons.map((r, i) => (
                  <li key={i} className="px-3 py-1.5 text-xs text-slate-700 font-mono">
                    {r}
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          {/* (7) Counterfactual */}
          {item.topCounterfactual ? (
            <Section title={t.secCounterfactual}>
              <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900 italic leading-relaxed">
                → {item.topCounterfactual.hypotheticalState}:{" "}
                {lang === "IS" ? item.topCounterfactual.descriptionIS : item.topCounterfactual.descriptionEN}
              </p>
            </Section>
          ) : null}

          {/* (8) Baseline maturity */}
          {item.baselineMaturity ? (
            <Section title={t.secMaturity}>
              <p className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                {t.maturityLine(item.baselineMaturity.obs, item.baselineMaturity.windowDays)}
              </p>
            </Section>
          ) : null}

          {/* References footer */}
          <p className="text-[10px] leading-snug text-slate-400 pt-2 border-t border-slate-100">
            {t.refs}
          </p>
        </div>
      </div>
    </div>
  );
}
