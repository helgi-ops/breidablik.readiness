"use client";

/**
 * Top-speed method library — what training has been shown to raise maximum sprint speed, and three ready
 * plans (in season / pre-season / individual). Layered read: the verdict and three plain facts on top; method
 * cards grouped by how strong the evidence is for top speed, each with its dose in one line; the numbers,
 * sources and "full paper / abstract only" behind "Show details". Data lives in `@/lib/micropulse/speedMethods`.
 * Coach-only reference: nothing here is sent to a player.
 */

import { useState } from "react";
import {
  SPEED_CAVEATS,
  SPEED_EVIDENCE_LABEL,
  SPEED_EVIDENCE_ORDER,
  SPEED_FACTS,
  SPEED_METHODS,
  SPEED_PLAN_BASIS,
  SPEED_PLANS,
  SPEED_REFS,
  SPEED_SAFETY,
  SPEED_VERDICT,
  VERIFIED_LABEL,
  type SpeedEvidence,
  type SpeedMethod,
  type SpeedPlan,
  type SpeedPlanKey,
} from "@/lib/micropulse/speedMethods";
import type { Bi } from "@/lib/micropulse/load/peakPeriod";

type Lang = "IS" | "EN";

const EVIDENCE_STYLE: Record<SpeedEvidence, string> = {
  best: "border-[#1c7a4a]/30 bg-[#1c7a4a]/10 text-[#1c7a4a]",
  some: "border-[#2740e6]/30 bg-[#2740e6]/5 text-[#2740e6]",
  accel: "border-[#de9328]/40 bg-[#de9328]/10 text-[#8a5a12]",
  none: "border-slate-300 bg-slate-50 text-slate-600",
};

const EVIDENCE_INTRO: Record<SpeedEvidence, Bi> = {
  best: { en: "Raise top speed: start here", is: "Hækka hámarkshraða: byrjaðu hér" },
  some: { en: "Can help top speed", is: "Geta hjálpað hámarkshraða" },
  accel: { en: "Help the start (first 10–30 m), not top speed", is: "Hjálpa startinu (fyrstu 10–30 m), ekki hámarkshraða" },
  none: { en: "No top-speed gain shown", is: "Engin bæting á hámarkshraða sýnd" },
};

function EvidenceChip({ e, lang }: { e: SpeedEvidence; lang: Lang }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${EVIDENCE_STYLE[e]}`}>
      {lang === "IS" ? SPEED_EVIDENCE_LABEL[e].is : SPEED_EVIDENCE_LABEL[e].en}
    </span>
  );
}

function MethodCard({ m, lang }: { m: SpeedMethod; lang: Lang }) {
  const [open, setOpen] = useState(false);
  const L = (b: Bi) => (lang === "IS" ? b.is : b.en);
  return (
    <div className="flex min-w-0 flex-col rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-[family-name:var(--font-display)] text-base font-semibold text-slate-900">{L(m.label)}</h3>
        <EvidenceChip e={m.evidence} lang={lang} />
      </div>
      <p className="mt-1 text-sm text-slate-700">{L(m.summary)}</p>
      <p className="mt-2 text-xs text-slate-600">
        <span className="font-semibold">{lang === "IS" ? "Skammtur: " : "Dose: "}</span>
        {L(m.dose)}
      </p>

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="mt-3 self-start text-xs font-semibold text-[#2740e6]"
        aria-expanded={open}
      >
        {open ? (lang === "IS" ? "Fela nánar" : "Hide details") : (lang === "IS" ? "Sýna nánar" : "Show details")}
      </button>

      {open && (
        <div className="mt-2 space-y-3 border-t border-slate-100 pt-3 text-xs text-slate-700">
          <div>
            <div className="font-semibold text-slate-900">{lang === "IS" ? "Hvað rannsóknirnar fundu" : "What the studies found"}</div>
            <ul className="mt-1 space-y-1.5">
              {m.findings.map((f) => (
                <li key={f.text.en}>
                  {L(f.text)}{" "}
                  <span className="text-slate-500">
                    ({SPEED_REFS[f.ref].short} · {L(VERIFIED_LABEL[SPEED_REFS[f.ref].verifiedFrom])})
                  </span>
                </li>
              ))}
            </ul>
          </div>
          {m.howTo.length > 0 && (
            <div>
              <div className="font-semibold text-slate-900">{lang === "IS" ? "Hvernig" : "How to run it"}</div>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {m.howTo.map((h) => <li key={h.en}>{L(h)}</li>)}
              </ul>
            </div>
          )}
          {m.caution && <p className="text-slate-500">{L(m.caution)}</p>}
          <div>
            <div className="font-semibold text-slate-900">{lang === "IS" ? "Heimildir" : "References"}</div>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-slate-500">
              {[...new Set(m.findings.map((f) => f.ref))].map((r) => <li key={r}>{SPEED_REFS[r].cite}</li>)}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function PlanView({ plan, lang }: { plan: SpeedPlan; lang: Lang }) {
  const L = (b: Bi) => (lang === "IS" ? b.is : b.en);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const download = async () => {
    setBusy(true);
    setErr(null);
    try {
      const { downloadSpeedPlanPdf } = await import("@/components/coach/SpeedPlanPdf");
      await downloadSpeedPlanPdf(plan.key, lang);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-semibold text-slate-900">{L(plan.verdict)}</p>
          <p className="mt-0.5 text-xs text-slate-500">{L(plan.who)}</p>
        </div>
        <button
          type="button"
          onClick={download}
          disabled={busy}
          className="shrink-0 rounded-lg bg-[#2740e6] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
        >
          {busy ? (lang === "IS" ? "Bý til PDF…" : "Making PDF…") : (lang === "IS" ? "Sækja PDF" : "Download PDF")}
        </button>
      </div>
      {err && <p className="text-xs text-red-700">{err}</p>}

      <ul className="space-y-1 text-sm text-slate-700">
        {plan.facts.map((f) => (
          <li key={f.en} className="flex gap-2">
            <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
            <span>{L(f)}</span>
          </li>
        ))}
      </ul>

      <p className="rounded-lg border border-[#de9328]/40 bg-[#de9328]/5 px-3 py-2 text-xs text-slate-700">{L(SPEED_PLAN_BASIS)}</p>

      <div className="space-y-3">
        {plan.alternatives && (
          <p className="text-xs font-semibold text-slate-700">
            {lang === "IS" ? "Tvær útgáfur af sömu viku: veldu þá sem passar við vikuna þína." : "Two versions of the same week: pick the one that matches your week."}
          </p>
        )}
        {plan.weeks.map((w) => (
          <div key={w.label.en} className="rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-4 py-2 font-[family-name:var(--font-display)] text-sm font-semibold text-slate-900">
              {L(w.label)}
            </div>
            <div className="divide-y divide-slate-100">
              {w.sessions.map((s) => (
                <div key={`${s.day}-${s.dayLabel.en}`} className="grid grid-cols-1 gap-1 px-4 py-2.5 sm:grid-cols-[9rem_1fr] sm:gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{L(s.dayLabel)}</div>
                    <div className="text-xs text-slate-500">{L(s.focus)}</div>
                    {s.subgroup && (
                      <div className="mt-1 inline-block rounded-full border border-[#de9328]/40 bg-[#de9328]/10 px-2 py-0.5 text-[11px] font-medium text-[#8a5a12]">
                        {L(s.subgroup)}
                      </div>
                    )}
                  </div>
                  <ul className="min-w-0 space-y-1">
                    {s.blocks.map((b, i) => (
                      <li key={i} className="text-sm">
                        <span className={`font-medium ${b.test ? "text-[#2740e6]" : "text-slate-800"}`}>{L(b.what)}</span>
                        <span className="block text-xs text-slate-600">{L(b.dose)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-slate-400">
        {lang === "IS" ? "Byggt á: " : "Built from: "}
        {plan.refs.map((r) => SPEED_REFS[r].short).join(" · ")}
      </p>
    </div>
  );
}

const PLAN_TAB: Record<SpeedPlanKey, Bi> = {
  in_season: { en: "In season", is: "Á tímabili" },
  pre_season: { en: "Pre-season", is: "Undirbúningur" },
  individual: { en: "Individual", is: "Einstaklingur" },
};

export default function SpeedMethodLibrary({ lang }: { lang: Lang }) {
  const L = (b: Bi) => (lang === "IS" ? b.is : b.en);
  const [planKey, setPlanKey] = useState<SpeedPlanKey>("in_season");
  const plan = SPEED_PLANS.find((p) => p.key === planKey) ?? SPEED_PLANS[0];

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-slate-900">
          {lang === "IS" ? "Hámarkshraði: hvað virkar" : "Top speed: what works"}
        </h2>
        <p className="mt-2 text-base font-semibold text-slate-900">{L(SPEED_VERDICT)}</p>
        <ul className="mt-2 space-y-1 text-sm text-slate-700">
          {SPEED_FACTS.map((f) => (
            <li key={f.en} className="flex gap-2">
              <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#2740e6]" />
              <span>{L(f)}</span>
            </li>
          ))}
        </ul>
      </div>

      <section className="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <h3 className="font-[family-name:var(--font-display)] text-base font-semibold text-slate-900">
          {lang === "IS" ? "Þrjár áætlanir" : "Three plans"}
        </h3>
        <div className="mt-2 flex flex-wrap gap-1.5" role="tablist">
          {SPEED_PLANS.map((p) => (
            <button
              key={p.key}
              type="button"
              role="tab"
              aria-selected={p.key === planKey}
              onClick={() => setPlanKey(p.key)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                p.key === planKey ? "border-[#2740e6] bg-[#2740e6] text-white" : "border-slate-300 bg-white text-slate-700"
              }`}
            >
              {L(PLAN_TAB[p.key])}
            </button>
          ))}
        </div>
        <div className="mt-3">
          <PlanView key={plan.key} plan={plan} lang={lang} />
        </div>
        <div className="mt-4 rounded-lg border border-[#de9328]/40 bg-white px-3 py-2">
          <div className="text-xs font-semibold text-slate-900">{lang === "IS" ? "Reglur í öllum áætlunum" : "Rules in every plan"}</div>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-slate-700">
            {SPEED_SAFETY.map((s) => <li key={s.en}>{L(s)}</li>)}
          </ul>
        </div>
      </section>

      {SPEED_EVIDENCE_ORDER.map((e) => {
        const group = SPEED_METHODS.filter((m) => m.evidence === e);
        if (group.length === 0) return null;
        return (
          <section key={e} className="mb-5">
            <h3 className="mb-2 text-sm font-semibold text-slate-900">{L(EVIDENCE_INTRO[e])}</h3>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {group.map((m) => <MethodCard key={m.key} m={m} lang={lang} />)}
            </div>
          </section>
        );
      })}

      <div className="mt-2 rounded-xl border border-slate-200 bg-white px-4 py-3">
        <div className="text-xs font-semibold text-slate-900">{lang === "IS" ? "Fyrirvarar" : "Caveats"}</div>
        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-slate-600">
          {SPEED_CAVEATS.map((c) => <li key={c.en}>{L(c)}</li>)}
        </ul>
      </div>
    </div>
  );
}
