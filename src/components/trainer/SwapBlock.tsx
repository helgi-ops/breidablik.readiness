"use client";

/**
 * One exercise line in a "Speed & power" plan, with the coach's swap (lota 4, step 3). A swappable line has a
 * "Swap" button that lists similar exercises; a swapped line says "swapped by coach", shows the planned exercise and
 * has "Back to planned". Only the exercise changes; the dose stays (see goalPlan/swaps.ts).
 */

import { useState } from "react";
import { PLANNED, SWAP_NOTE, SWAPPED_BY_COACH, SWAP_SLOT_BY_KEY, swapMark, type SwapSlotKey } from "@/lib/micropulse/goalPlan/swaps";
import type { Bi } from "@/lib/micropulse/goalPlan/types";
import type { LiftRx } from "@/lib/micropulse/goalPlan/liftRx";
import { LiftRxDetails } from "@/components/trainer/LiftRxTable";

type Lang = "IS" | "EN";

export type OnSwap = (slot: SwapSlotKey, option: string) => void;

export function SwapBlock({
  b,
  lang,
  onSwap,
  disabled = false,
}: {
  b: { what: Bi; dose: Bi; test?: boolean; rx?: LiftRx[] };
  lang: Lang;
  onSwap?: OnSwap;
  disabled?: boolean;
}) {
  const L = (x: Bi) => (lang === "IS" ? x.is : x.en);
  const IS = lang === "IS";
  const [open, setOpen] = useState(false);
  const mark = swapMark(b);
  const slot = mark ? SWAP_SLOT_BY_KEY[mark.slot] : null;
  const choose = (key: string) => {
    if (!slot || !onSwap) return;
    onSwap(slot.key, key);
    setOpen(false);
  };
  return (
    <li className="text-sm">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className={`font-medium ${b.test ? "text-[#2740e6]" : "text-slate-800"}`}>{L(b.what)}</span>
        {mark?.swapped && (
          <span className="rounded bg-[#2740e6]/10 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-[#2740e6]">
            {L(SWAPPED_BY_COACH)}
          </span>
        )}
        {slot && onSwap && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            disabled={disabled}
            className="text-[11px] font-semibold text-[#2740e6] underline-offset-2 hover:underline disabled:opacity-50"
          >
            {IS ? "Skipta" : "Swap"}
          </button>
        )}
      </div>
      <span className="block text-xs text-slate-600">{L(b.dose)}</span>
      <LiftRxDetails rx={b.rx} lang={lang} />
      {mark?.swapped && (
        <span className="block text-[11px] text-slate-500">
          {IS ? "Í áætluninni: " : "Planned: "}
          {L(mark.planned)}
          {onSwap && (
            <>
              {" · "}
              <button
                type="button"
                onClick={() => choose(PLANNED)}
                disabled={disabled}
                className="font-semibold text-[#2740e6] underline-offset-2 hover:underline disabled:opacity-50"
              >
                {IS ? "Til baka" : "Back to planned"}
              </button>
            </>
          )}
        </span>
      )}
      {open && slot && mark && (
        <div className="mt-1.5 rounded-lg border border-slate-200 bg-slate-50 p-2">
          <div className="text-[11px] font-semibold text-slate-700">{L(slot.label)}</div>
          <div className="mt-1 flex flex-wrap gap-1.5" role="radiogroup" aria-label={L(slot.label)}>
            {slot.options.map((o) => (
              <button
                key={o.key}
                type="button"
                role="radio"
                aria-checked={o.key === mark.option}
                disabled={disabled}
                onClick={() => choose(o.key)}
                className={`rounded-lg border px-2 py-0.5 text-xs font-medium disabled:opacity-60 ${
                  o.key === mark.option ? "border-[#2740e6] bg-white text-[#2740e6]" : "border-slate-300 bg-white text-slate-600"
                }`}
              >
                {L(o.label)}
                {o.key === PLANNED ? (IS ? " (í áætlun)" : " (planned)") : ""}
              </button>
            ))}
          </div>
          {slot.options.filter((o) => o.note).map((o) => (
            <p key={o.key} className="mt-1 text-[11px] text-slate-600">
              <span className="font-medium">{L(o.label)}:</span> {L(o.note!)}
            </p>
          ))}
          <p className="mt-1 text-[11px] text-slate-500">
            {IS
              ? "Skiptin gilda um þessa æfingu alls staðar í áætlunum eiginleikans. Skammturinn breytist ekki."
              : "The swap holds for this exercise everywhere in this quality's plans. The dose does not change."}
          </p>
        </div>
      )}
    </li>
  );
}

/** Shown once under the plan's basis line when anything is swapped. */
export function SwapNote({ lang }: { lang: Lang }) {
  return (
    <p className="rounded-lg border border-[#2740e6]/30 bg-[#2740e6]/5 px-3 py-2 text-xs text-slate-700">
      {lang === "IS" ? SWAP_NOTE.is : SWAP_NOTE.en}
    </p>
  );
}
