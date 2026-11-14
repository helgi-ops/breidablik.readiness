"use client";

/**
 * Acceleration / braking / jump-height method library ("Speed & power" tab, lota 1). Same layered read as the
 * top-speed library: the verdict and 2–3 plain facts with their source on top; method cards grouped by how they
 * were tested, each with its dose in one line; findings, sources and "full paper / abstract only" behind
 * "Show details"; what the research does not show at the bottom. Data: `goalPlan/qualityLibrary` (the goal plans'
 * own methods). Coach-only reference: nothing here is sent to a player.
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
