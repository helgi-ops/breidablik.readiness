"use client";

/**
 * Acceleration / braking / jump-height method library ("Speed & power" tab, lota 1). Same layered read as the
 * top-speed library: the verdict and 2–3 plain facts with their source on top; method cards grouped by how they
 * were tested, each with its dose in one line; findings, sources and "full paper / abstract only" behind
 * "Show details"; what the research does not show at the bottom. Lota 2: three plans (in season / pre-season /
 * individual) with a PDF between the facts and the methods, as in the top-speed library. Data:
 * `goalPlan/qualityLibrary` + `goalPlan/qualityPlans` (the goal plans' own methods and blocks). Coach-only
 * reference: nothing here is sent to a player.
 */

import { useState } from "react";
import {
  BASIS_INTRO,
  BASIS_LABEL,
  BASIS_ORDER,
  LIBRARY_SOURCE_NOTE,
  libraryRefShort,
  methodsByBasis,
  type MethodBasis,
  type QualityLibrary,
} from "@/lib/micropulse/goalPlan/qualityLibrary";
import {
  INDIVIDUAL_STARTS,
  QUALITY_PLAN_KEYS,
  QUALITY_PLAN_RULES,
  QUALITY_PLAN_TAB,
  qualityPlan,
  type QualityPlan,
  type QualityPlanKey,
} from "@/lib/micropulse/goalPlan/qualityPlans";
import type { Bi, GoalMethod, GoalRef } from "@/lib/micropulse/goalPlan/types";
import { VERIFIED_LABEL } from "@/lib/micropulse/speedMethods";

type Lang = "IS" | "EN";

const BASIS_STYLE: Record<MethodBasis, string> = {
  trial: "border-[#1c7a4a]/30 bg-[#1c7a4a]/10 text-[#1c7a4a]",
  review: "border-[#2740e6]/30 bg-[#2740e6]/5 text-[#2740e6]",
  rule: "border-slate-300 bg-slate-50 text-slate-600",
};

function MethodCard({ m, refs, lang }: { m: GoalMethod; refs: Record<string, GoalRef>; lang: Lang }) {
  const [open, setOpen] = useState(false);
  const L = (b: Bi) => (lang === "IS" ? b.is : b.en);
  return (
    <div className="flex min-w-0 flex-col rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-[family-name:var(--font-display)] text-base font-semibold text-slate-900">{L(m.label)}</h3>
        <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${BASIS_STYLE[m.basis]}`}>
          {L(BASIS_LABEL[m.basis])}
        </span>
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
              {m.findings.map((f) => {
                const r = refs[f.ref];
                return (
                  <li key={f.text.en}>
                    {L(f.text)}{" "}
                    {r && <span className="text-slate-500">({r.short} · {L(VERIFIED_LABEL[r.verifiedFrom])})</span>}
                  </li>
                );
              })}
            </ul>
          </div>
          {m.howTo && m.howTo.length > 0 && (
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
              {[...new Set(m.findings.map((f) => f.ref))].map((k) => refs[k] && <li key={k}>{refs[k].cite}</li>)}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function PlanView({ plan, lib, lang }: { plan: QualityPlan; lib: QualityLibrary; lang: Lang }) {
  const L = (b: Bi) => (lang === "IS" ? b.is : b.en);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const download = async () => {
    setBusy(true);
    setErr(null);
    try {
      const { downloadQualityPlanPdf } = await import("@/components/coach/QualityPlanPdf");
      await downloadQualityPlanPdf(plan, lang);
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

      <p className="rounded-lg border border-[#de9328]/40 bg-[#de9328]/5 px-3 py-2 text-xs text-slate-700">{L(plan.basis)}</p>

      <div className="space-y-3">
        {plan.weeks.map((w) => (
          <div key={w.label.en} className="rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-4 py-2 font-[family-name:var(--font-display)] text-sm font-semibold text-slate-900">
              {L(w.label)}
            </div>
            <div className="divide-y divide-slate-100">
              {w.sessions.map((s) => (
                <div key={`${s.dayLabel.en}-${s.focus.en}`} className="grid grid-cols-1 gap-1 px-4 py-2.5 sm:grid-cols-[11rem_1fr] sm:gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900">{L(s.dayLabel)}</div>
                    <div className="text-xs text-slate-500">{L(s.focus)}</div>
                    {s.when && <div className="mt-0.5 text-[11px] text-slate-400">{L(s.when)}</div>}
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

      {plan.limits.length > 0 && (
        <div className="text-xs text-slate-600">
          <div className="font-semibold text-slate-900">{lang === "IS" ? "Það sem þessi áætlun sýnir ekki" : "What this plan does not show"}</div>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {plan.limits.map((l) => <li key={l.en}>{L(l)}</li>)}
          </ul>
        </div>
      )}

      <p className="text-[11px] text-slate-400">
        {lang === "IS" ? "Byggt á: " : "Built from: "}
        {plan.refs.map((r) => lib.refs[r]?.short).filter(Boolean).join(" · ")}
      </p>
    </div>
  );
}

function PlansSection({ lib, lang }: { lib: QualityLibrary; lang: Lang }) {
  const L = (b: Bi) => (lang === "IS" ? b.is : b.en);
  const [key, setKey] = useState<QualityPlanKey>("in_season");
  const starts = INDIVIDUAL_STARTS[lib.quality];
  const [start, setStart] = useState<string>(starts[0].key);
  const plan = qualityPlan(lib.quality, key, start);
  return (
    <section className="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <h3 className="font-[family-name:var(--font-display)] text-base font-semibold text-slate-900">
        {lang === "IS" ? "Þrjár áætlanir" : "Three plans"}
      </h3>
      <div className="mt-2 flex flex-wrap gap-1.5" role="tablist">
        {QUALITY_PLAN_KEYS.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={k === key}
            onClick={() => setKey(k)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${
              k === key ? "border-[#2740e6] bg-[#2740e6] text-white" : "border-slate-300 bg-white text-slate-700"
            }`}
          >
            {L(QUALITY_PLAN_TAB[k])}
          </button>
        ))}
      </div>
      {key === "individual" && (
        <div className="mt-3">
          <div className="text-xs font-semibold text-slate-700">{lang === "IS" ? "Upphaf" : "Start"}</div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {starts.map((s) => (
              <button
                key={s.key}
                type="button"
                aria-pressed={s.key === start}
                onClick={() => setStart(s.key)}
                className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${
                  s.key === start ? "border-[#2740e6] bg-white text-[#2740e6]" : "border-slate-300 bg-white text-slate-600"
                }`}
              >
                {L(s.label)}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="mt-3">
        <PlanView key={`${plan.key}-${plan.start ?? ""}`} plan={plan} lib={lib} lang={lang} />
      </div>
      <div className="mt-4 rounded-lg border border-[#de9328]/40 bg-white px-3 py-2">
        <div className="text-xs font-semibold text-slate-900">{lang === "IS" ? "Reglur í öllum áætlunum" : "Rules in every plan"}</div>
        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-slate-700">
          {QUALITY_PLAN_RULES.map((r) => <li key={r.en}>{L(r)}</li>)}
        </ul>
      </div>
    </section>
  );
}

export default function QualityMethodLibrary({ lib, lang }: { lib: QualityLibrary; lang: Lang }) {
  const L = (b: Bi) => (lang === "IS" ? b.is : b.en);
  return (
    <div>
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-slate-900">{L(lib.title)}</h2>
        <p className="mt-2 text-base font-semibold text-slate-900">{L(lib.verdict)}</p>
        <ul className="mt-2 space-y-1 text-sm text-slate-700">
          {lib.facts.map((f) => (
            <li key={f.text.en} className="flex gap-2">
              <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#2740e6]" />
              <span>
                {L(f.text)} <span className="text-slate-500">({libraryRefShort(lib, f.refs)})</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <PlansSection lib={lib} lang={lang} />

      {BASIS_ORDER.map((b) => {
        const group = methodsByBasis(lib, b);
        if (group.length === 0) return null;
        return (
          <section key={b} className="mb-5">
            <h3 className="mb-2 text-sm font-semibold text-slate-900">{L(BASIS_INTRO[b])}</h3>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {group.map((m) => <MethodCard key={m.key} m={m} refs={lib.refs} lang={lang} />)}
            </div>
          </section>
        );
      })}

      <div className="mt-2 rounded-xl border border-slate-200 bg-white px-4 py-3">
        <div className="text-xs font-semibold text-slate-900">{lang === "IS" ? "Það sem rannsóknir sýna ekki" : "What the research does not show"}</div>
        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-slate-600">
          {lib.caveats.map((c) => <li key={c.en}>{L(c)}</li>)}
        </ul>
        <p className="mt-2 text-[11px] text-slate-500">{L(LIBRARY_SOURCE_NOTE)}</p>
      </div>
    </div>
  );
}
