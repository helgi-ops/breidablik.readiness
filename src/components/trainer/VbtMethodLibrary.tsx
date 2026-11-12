"use client";

/**
 * Bar-speed (VBT) method library — the six "commonly used velocity-based training methods" of
 * Weakley et al. 2021, Table 5, as reference cards (layered read: name + one sentence + what is fixed vs
 * decided on the day + what the player reads; the paper's wording, rules, Table 2 and references behind
 * "Show details"). Data lives in `@/lib/micropulse/vbtMethods`; the team strength rules and the PT plan
 * builder pick from the same list.
 */

import { useState } from "react";
import {
  VBT_METHODS,
  V1RM_TABLE2,
  VBT_DEVICE_NOTE,
  LVP_1RM_CAVEAT,
  VL_FATIGUE_NOTE,
  LOAD_DIRECTION_NOTE,
  VBT_CITE,
  formatVbtForPlayer,
  fmtSpeed,
  type VbtControl,
  type VbtMethod,
  type VbtParamKey,
} from "@/lib/micropulse/vbtMethods";
import type { Bi } from "@/lib/micropulse/load/peakPeriod";

type Lang = "IS" | "EN";

const PARAM_LABEL: Record<VbtParamKey, Bi> = {
  targetVelocity: { en: "target speed", is: "markhraði" },
  velocityRange: { en: "speed zone", is: "hraðabil" },
  velocityLossPct: { en: "speed drop that ends a set", is: "hraðatap sem endar sett" },
  repCap: { en: "most reps per set", is: "mest endurtekningar í setti" },
  totalReps: { en: "total reps", is: "heildarfjöldi endurtekninga" },
};

const CONTROL_LABEL: Record<VbtControl, Bi> = {
  prescribed: { en: "set in advance", is: "ákveðið fyrirfram" },
  flexible: { en: "decided on the day", is: "ræðst á deginum" },
};

function ControlChip({ what, control, lang }: { what: Bi; control: VbtControl; lang: Lang }) {
  const L = (b: Bi) => (lang === "IS" ? b.is : b.en);
  const fixed = control === "prescribed";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${
        fixed ? "border-slate-300 bg-white text-slate-700" : "border-[#2740e6]/30 bg-[#2740e6]/5 text-[#2740e6]"
      }`}
    >
      <span className="font-semibold">{L(what)}:</span> {L(CONTROL_LABEL[control])}
    </span>
  );
}

function MethodCard({ m, lang }: { m: VbtMethod; lang: Lang }) {
  const [open, setOpen] = useState(false);
  const L = (b: Bi) => (lang === "IS" ? b.is : b.en);
  const card = formatVbtForPlayer(m.example, lang);
  const needs = m.requires
    .map((g) => g.map((k) => L(PARAM_LABEL[k])).join(" + "))
    .join(lang === "IS" ? " eða " : " or ");
  const optional = m.optional.map((k) => L(PARAM_LABEL[k]));
  return (
    <div className="flex min-w-0 flex-col rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-[family-name:var(--font-display)] text-base font-semibold text-slate-900">{L(m.label)}</h3>
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          {lang === "IS" ? "Tafla 5 · lína" : "Table 5 · row"} {m.tableRow}
        </span>
      </div>
      <p className="mt-1 text-sm text-slate-700">{L(m.summary)}</p>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <ControlChip what={{ en: "Sets", is: "Sett" }} control={m.control.sets} lang={lang} />
        <ControlChip what={{ en: "Reps", is: "Endurtekningar" }} control={m.control.reps} lang={lang} />
        <ControlChip what={{ en: "Weight", is: "Þyngd" }} control={m.control.load} lang={lang} />
      </div>

      <p className="mt-2 text-xs text-slate-600">
        <span className="font-semibold">{lang === "IS" ? "Þú stillir: " : "You set: "}</span>
        {needs}
        {optional.length > 0 && (lang === "IS" ? ` (valfrjálst: ${optional.join(", ")})` : ` (optional: ${optional.join(", ")})`)}
      </p>

      <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          {lang === "IS" ? "Leikmaðurinn les (dæmi greinarinnar)" : "The player reads (the paper's example)"}
        </div>
        <p className="mt-0.5 text-sm font-medium text-slate-900">{card.headline}</p>
        {card.facts.map((f) => (
          <p key={f} className="mt-0.5 text-xs text-slate-600">{f}</p>
        ))}
      </div>

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
            <div className="font-semibold text-slate-900">{lang === "IS" ? "Hvernig þú keyrir hana" : "How to run it"}</div>
            <ol className="mt-1 list-decimal space-y-0.5 pl-4">
              {m.coachSteps.map((s) => <li key={s.en}>{L(s)}</li>)}
            </ol>
          </div>
          <div>
            <div className="font-semibold text-slate-900">{lang === "IS" ? "Í greininni" : "In the paper"}</div>
            <p className="mt-0.5 italic text-slate-500">{m.paperName}</p>
            <p className="mt-0.5">{L(m.paperRule)}</p>
            {m.rules.loadStep && <p className="mt-1 text-slate-500">{L(LOAD_DIRECTION_NOTE)}</p>}
            {m.requires.flat().includes("velocityLossPct") && <p className="mt-1 text-slate-500">{L(VL_FATIGUE_NOTE)}</p>}
          </div>
          <div>
            <div className="font-semibold text-slate-900">{lang === "IS" ? "Heimildir" : "References"}</div>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-slate-500">
              {m.refs.map((r) => <li key={r}>{r}</li>)}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

export default function VbtMethodLibrary({ lang }: { lang: Lang }) {
  const [showTable2, setShowTable2] = useState(false);
  const L = (b: Bi) => (lang === "IS" ? b.is : b.en);
  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-slate-900">
          {lang === "IS" ? "Hraðastýrð styrkþjálfun: sex aðferðir" : "Bar-speed training: six methods"}
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          {lang === "IS"
            ? "Algengustu leiðirnar til að stýra lyftu með stangarhraða, samkvæmt Weakley o.fl. 2021. Hver aðferð segir hvað er ákveðið fyrirfram og hvað ræðst af líðan dagsins."
            : "The common ways to run a lift by bar speed, from Weakley et al. 2021. Each method says what is set in advance and what is decided by how the athlete moves that day."}
        </p>
      </div>

      <div className="mb-4 space-y-1 rounded-xl border border-[#de9328]/40 bg-[#de9328]/5 px-4 py-3 text-sm text-slate-800">
        <p className="font-medium">{L(VBT_DEVICE_NOTE)}</p>
        <p className="text-xs text-slate-600">{L(LVP_1RM_CAVEAT)}</p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {VBT_METHODS.map((m) => <MethodCard key={m.key} m={m} lang={lang} />)}
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
        <button
          type="button"
          onClick={() => setShowTable2((o) => !o)}
          className="text-sm font-semibold text-[#2740e6]"
          aria-expanded={showTable2}
        >
          {showTable2
            ? (lang === "IS" ? "Fela hraða við hámarkslyftu" : "Hide bar speed at a max lift")
            : (lang === "IS" ? "Sýna hraða við hámarkslyftu (tafla 2)" : "Show bar speed at a max lift (Table 2)")}
        </button>
        {showTable2 && (
          <div className="mt-3 overflow-x-auto">
            <p className="mb-2 text-xs text-slate-600">
              {lang === "IS"
                ? "Meðalhraði stangar í einni hámarkslyftu. Notað til að lesa hámark út frá hraða-þyngdarprófíl."
                : "Average bar speed in a one-rep max. Used to read a max off a load-velocity profile."}
            </p>
            <table className="w-full min-w-[280px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500">
                  <th className="py-1 pr-4 font-medium">{lang === "IS" ? "Lyfta" : "Lift"}</th>
                  <th className="py-1 font-medium tabular-nums">m/s</th>
                </tr>
              </thead>
              <tbody>
                {V1RM_TABLE2.map((r) => (
                  <tr key={r.key} className="border-b border-slate-100">
                    <td className="py-1 pr-4">{L(r.name)}</td>
                    <td className="py-1 tabular-nums">{fmtSpeed(r.v1rm, lang)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="mt-4 text-[11px] text-slate-400">{VBT_CITE}</p>
    </div>
  );
}
