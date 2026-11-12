"use client";

/**
 * Pick a bar-speed (VBT) method and its numbers — Weakley et al. 2021, Table 5. Shared by the team
 * strength rules (per block) and the PT plan builder (per exercise). Picking a method pre-fills the
 * paper's own example numbers; only the fields that method uses are shown. A live preview shows the
 * line the player will read, and a missing number is named plainly (an incomplete pick is dropped on
 * save, never sent to a player).
 */

import {
  VBT_METHODS,
  VBT_METHOD_BY_KEY,
  VBT_VL_OPTIONS,
  VBT_DEVICE_NOTE,
  isVbtMethodKey,
  vbtParamsFor,
  missingVbtParams,
  sanitizeVbtPrescription,
  formatVbtForPlayer,
  type VbtDraft,
  type VbtParamKey,
} from "@/lib/micropulse/vbtMethods";
import type { Bi } from "@/lib/micropulse/load/peakPeriod";

type Lang = "EN" | "IS";

const MISSING_LABEL: Record<VbtParamKey, Bi> = {
  targetVelocity: { en: "a target speed", is: "markhraða" },
  velocityRange: { en: "a speed zone (from–to)", is: "hraðabil (frá–til)" },
  velocityLossPct: { en: "the speed drop", is: "hraðatapið" },
  repCap: { en: "the rep cap", is: "hámark endurtekninga" },
  totalReps: { en: "the total reps", is: "heildarfjöldann" },
};

const numOrUndef = (s: string): number | undefined => {
  const n = Number(s.replace(",", "."));
  return s.trim() === "" || !Number.isFinite(n) ? undefined : n;
};

export default function VbtMethodPicker({ value, onChange, lang, compact = false, idPrefix }: {
  value?: VbtDraft | null;
  onChange: (v: VbtDraft | undefined) => void;
  lang: Lang;
  compact?: boolean;
  /** Unique prefix for input ids (several pickers on one page). */
  idPrefix: string;
}) {
  const L = (b: Bi) => (lang === "IS" ? b.is : b.en);
  const method = value?.method && isVbtMethodKey(value.method) ? value.method : null;
  const params = method ? vbtParamsFor(method) : [];
  const valid = value && method ? sanitizeVbtPrescription(value) : null;
  const missing = value && method ? missingVbtParams(value) : [];

  const pick = (key: string) => {
    if (!isVbtMethodKey(key)) { onChange(undefined); return; }
    onChange({ ...VBT_METHOD_BY_KEY[key].example });
  };
  const set = (patch: Partial<VbtDraft>) => {
    if (!value || !method) return;
    const next: VbtDraft = { ...value, ...patch };
    for (const k of Object.keys(patch) as (keyof VbtDraft)[]) if (next[k] === undefined) delete next[k];
    onChange(next);
  };

  const input = "h-9 w-20 rounded-lg border border-slate-300 px-2 text-[13px] tabular-nums";
  const lbl = "text-[11px] font-semibold text-slate-500";

  return (
    <div className={`min-w-0 ${compact ? "space-y-1.5" : "space-y-2"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`${idPrefix}-method`} className="sr-only">{lang === "IS" ? "Hraðastýrð aðferð" : "Bar-speed method"}</label>
        <select
          id={`${idPrefix}-method`}
          value={method ?? ""}
          onChange={(e) => pick(e.target.value)}
          className={`h-9 min-w-0 max-w-full rounded-lg border px-2.5 text-[13px] ${method ? "border-2 border-[#2740e6] bg-white font-semibold text-slate-900" : "border-slate-300 bg-slate-50 text-slate-600"}`}
        >
          <option value="">{lang === "IS" ? "Engin hraðastýring" : "No bar-speed method"}</option>
          {VBT_METHODS.map((m) => (
            <option key={m.key} value={m.key}>{L(m.label)}</option>
          ))}
        </select>
        <a href="/coach/programme-library?tab=vbt" className="text-[11px] font-semibold text-[#2740e6] hover:underline">
          {lang === "IS" ? "Um aðferðirnar" : "About the methods"}
        </a>
      </div>

      {method && (
        <>
          <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
            {params.includes("velocityLossPct") && (
              <div className="flex flex-col gap-0.5">
                <label htmlFor={`${idPrefix}-vl`} className={lbl}>{lang === "IS" ? "Hætta við hraðatap" : "Stop at speed drop"}</label>
                <select
                  id={`${idPrefix}-vl`}
                  value={value?.velocityLossPct ?? ""}
                  onChange={(e) => set({ velocityLossPct: numOrUndef(e.target.value) })}
                  className="h-9 rounded-lg border border-slate-300 px-2 text-[13px]"
                >
                  <option value="">–</option>
                  {[...new Set([...VBT_VL_OPTIONS, ...(value?.velocityLossPct != null ? [value.velocityLossPct] : [])])]
                    .sort((a, b) => a - b)
                    .map((v) => <option key={v} value={v}>{v}%</option>)}
                </select>
              </div>
            )}
            {params.includes("targetVelocity") && (
              <div className="flex flex-col gap-0.5">
                <label htmlFor={`${idPrefix}-tv`} className={lbl}>{lang === "IS" ? "Markhraði (m/s)" : "Target speed (m/s)"}</label>
                <input id={`${idPrefix}-tv`} type="number" inputMode="decimal" step="0.01" min="0.05" max="2.5" className={input}
                  value={value?.targetVelocity ?? ""} onChange={(e) => set({ targetVelocity: numOrUndef(e.target.value) })} />
              </div>
            )}
            {params.includes("targetVelocity") && params.includes("velocityRange") && (
              <span className="pb-2 text-[11px] text-slate-500">{lang === "IS" ? "eða" : "or"}</span>
            )}
            {params.includes("velocityRange") && (
              <div className="flex flex-col gap-0.5">
                <span className={lbl}>{lang === "IS" ? "Hraðabil (m/s)" : "Speed zone (m/s)"}</span>
                <div className="flex items-center gap-1">
                  <input aria-label={lang === "IS" ? "Frá (m/s)" : "From (m/s)"} type="number" inputMode="decimal" step="0.01" min="0.05" max="2.5" className={input}
                    value={value?.velocityMin ?? ""} onChange={(e) => set({ velocityMin: numOrUndef(e.target.value) })} />
                  <span className="text-slate-400">–</span>
                  <input aria-label={lang === "IS" ? "Til (m/s)" : "To (m/s)"} type="number" inputMode="decimal" step="0.01" min="0.05" max="2.5" className={input}
                    value={value?.velocityMax ?? ""} onChange={(e) => set({ velocityMax: numOrUndef(e.target.value) })} />
                </div>
              </div>
            )}
            {params.includes("repCap") && (
              <div className="flex flex-col gap-0.5">
                <label htmlFor={`${idPrefix}-cap`} className={lbl}>{lang === "IS" ? "Mest endurt. í setti" : "Most reps per set"}</label>
                <input id={`${idPrefix}-cap`} type="number" inputMode="numeric" step="1" min="1" max="20" className={input}
                  value={value?.repCap ?? ""} onChange={(e) => set({ repCap: numOrUndef(e.target.value) })} />
              </div>
            )}
            {params.includes("totalReps") && (
              <div className="flex flex-col gap-0.5">
                <label htmlFor={`${idPrefix}-tot`} className={lbl}>{lang === "IS" ? "Endurt. samtals" : "Total reps"}</label>
                <input id={`${idPrefix}-tot`} type="number" inputMode="numeric" step="1" min="2" max="100" className={input}
                  value={value?.totalReps ?? ""} onChange={(e) => set({ totalReps: numOrUndef(e.target.value) })} />
              </div>
            )}
          </div>

          {valid ? (
            <div className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-[12px] text-slate-700">
              <span className="font-semibold text-slate-500">{lang === "IS" ? "Leikmaðurinn les: " : "The player reads: "}</span>
              {formatVbtForPlayer(valid, lang).headline}
              {!compact && <span className="mt-0.5 block text-[11px] text-slate-500">{L(VBT_DEVICE_NOTE)}</span>}
            </div>
          ) : (
            <p className="text-[12px] font-medium text-[#a83e28]">
              {lang === "IS" ? "Vantar " : "Missing "}
              {missing.map((k) => L(MISSING_LABEL[k])).join(lang === "IS" ? " og " : " and ")}
              {lang === "IS" ? ". Ófullgert val vistast ekki." : ". An incomplete pick isn't saved."}
            </p>
          )}
        </>
      )}
    </div>
  );
}
