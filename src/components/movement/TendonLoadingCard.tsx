"use client";

/**
 * Tendon loading & collagen nutrition (Baar) — the tendon-adaptation layer: how
 * the tendon itself loads and adapts, alongside movement control (King) and muscle
 * activation (EMG). Layered read: the loading dose + isometric entry at a glance →
 * the optional nutrition-timing prompt and per-tendon notes behind a toggle.
 * Honestly graded (mechanistic-strong / clinical-outcome-emerging). Training
 * support only — never a diagnosis, never a cure claim, never the readiness colour.
 */
import * as React from "react";
import type { Bi } from "@/lib/micropulse/movementScreen/registry";
import type { CompensationKey } from "@/lib/micropulse/movementScreen/correctives/registry";
import {
  TENDON_DOSING, TENDON_ISOMETRIC, TENDON_NUTRITION, TENDON_INTENSITY_NOTE, TENDON_GRADE, TENDON_CAVEAT,
  TENDON_LABEL, PER_TENDON_NOTE, tendonsForCompensations, type TendonKey,
} from "@/lib/micropulse/movementScreen/correctives/tendonLoading";

const TEAL = "#0f766e";
const ALL_TENDONS: TendonKey[] = ["patellar", "achilles", "hamstring", "adductor"];

export default function TendonLoadingCard({ compensations, isEN }: { compensations: CompensationKey[]; isEN: boolean }) {
  const [open, setOpen] = React.useState(false);
  const L = (b: Bi) => (isEN ? b.en : b.is);
  const T = (en: string, is: string) => (isEN ? en : is);
  const derived = React.useMemo(() => tendonsForCompensations(compensations), [compensations]);
  const tendons = derived.length ? derived : ALL_TENDONS;

  return (
    <div className="rounded-xl border p-4" style={{ borderColor: `${TEAL}2a`, background: `${TEAL}0a` }}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: TEAL }}>{T("Tendon loading & collagen nutrition", "Sina-álag & kollagen-næring")}</p>
        <button onClick={() => setOpen((o) => !o)} className="text-[11px] font-semibold" style={{ color: TEAL }}>
          {open ? T("Hide", "Fela") : T("Show tendon guidance", "Sýna sina-leiðbeiningar")}
        </button>
      </div>

      {/* (0) the loading dose — the signature rule, at a glance */}
      <p className="mt-1.5 text-[13px] font-semibold text-slate-800">{L(TENDON_DOSING.rule)}</p>
      <p className="mt-0.5 text-[11px] text-slate-600">{L(TENDON_ISOMETRIC.detail)}</p>

      {open && (
        <div className="mt-3 space-y-2.5">
          <div className="rounded-lg border bg-white p-2.5" style={{ borderColor: `${TEAL}22` }}>
            <p className="text-[12px] font-semibold text-slate-800">{L(TENDON_DOSING.title)}</p>
            <p className="mt-0.5 text-[11px] text-slate-600">{L(TENDON_DOSING.why)}</p>
            <p className="mt-1 text-[9px] text-slate-400">{TENDON_DOSING.citation}</p>
          </div>

          <div className="rounded-lg border bg-white p-2.5" style={{ borderColor: `${TEAL}22` }}>
            <p className="text-[12px] font-semibold text-slate-800">{L(TENDON_ISOMETRIC.title)}</p>
            <p className="mt-0.5 text-[11px] text-slate-600">{L(TENDON_ISOMETRIC.detail)}</p>
            <p className="mt-1 text-[9px] text-slate-400">{TENDON_ISOMETRIC.citation}</p>
          </div>

          {/* Per-tendon specificity */}
          <div className="rounded-lg border bg-white p-2.5" style={{ borderColor: `${TEAL}22` }}>
            <p className="text-[12px] font-semibold text-slate-800">{T("Per tendon", "Per sin")}</p>
            <ul className="mt-1 space-y-1">
              {tendons.map((t) => (
                <li key={t} className="text-[11px]">
                  <span className="font-semibold text-slate-700">{L(TENDON_LABEL[t])}:</span> <span className="text-slate-600">{L(PER_TENDON_NOTE[t])}</span>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-[10px] text-slate-500">{L(TENDON_INTENSITY_NOTE.detail)}</p>
            <p className="mt-1 text-[9px] text-slate-400">{TENDON_INTENSITY_NOTE.citation}</p>
          </div>

          {/* Optional nutrition timing — clearly emerging, nutrition not medical */}
          <div className="rounded-lg border p-2.5" style={{ borderColor: `${TEAL}33`, background: `${TEAL}0d` }}>
            <p className="text-[12px] font-semibold text-slate-800">{L(TENDON_NUTRITION.title)}</p>
            <p className="mt-0.5 text-[11px] text-slate-600">{L(TENDON_NUTRITION.detail)}</p>
            <p className="mt-1 text-[10px] italic text-slate-500">{L(TENDON_NUTRITION.caveat)}</p>
            <p className="mt-1 text-[9px] text-slate-400">{TENDON_NUTRITION.citation}</p>
          </div>

          <p className="text-[9px] font-semibold" style={{ color: TEAL }}>{L(TENDON_GRADE)}</p>
        </div>
      )}

      <p className="mt-2 text-[9px] text-slate-500">{L(TENDON_CAVEAT)}</p>
    </div>
  );
}
