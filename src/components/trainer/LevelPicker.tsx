"use client";

/**
 * Level picker for the "Speed & power" plans (lota 4): beginner · intermediate · advanced. Shows who the chosen level
 * is for (MicroPulse's guidance, said so) and that the studies tested the intermediate level. For the youth start the
 * picker is hidden and the youth note is shown instead: the youth rules hold at every level.
 */

import {
  LEVEL_BASIS,
  LEVEL_GUIDE_NOTE,
  LEVEL_LABEL,
  LEVEL_WHO,
  LEVEL_YOUTH_NOTE,
  TRAINING_LEVELS,
  type TrainingLevel,
} from "@/lib/micropulse/goalPlan/levels";
import type { Bi } from "@/lib/micropulse/goalPlan/types";

type Lang = "IS" | "EN";

export default function LevelPicker({
  level,
  onChange,
  lang,
  youth = false,
  disabled = false,
}: {
  level: TrainingLevel;
  onChange: (lv: TrainingLevel) => void;
  lang: Lang;
  /** Youth start: no picker, the youth note instead. */
  youth?: boolean;
  disabled?: boolean;
}) {
  const L = (b: Bi) => (lang === "IS" ? b.is : b.en);
  if (youth) {
    return <p className="mt-3 text-xs text-slate-600">{L(LEVEL_YOUTH_NOTE)}</p>;
  }
  return (
    <div className="mt-3">
      <div className="text-xs font-semibold text-slate-700">{lang === "IS" ? "Stig" : "Level"}</div>
      <div className="mt-1 flex flex-wrap gap-1.5" role="radiogroup" aria-label={lang === "IS" ? "Stig" : "Level"}>
        {TRAINING_LEVELS.map((lv) => (
          <button
            key={lv}
            type="button"
            role="radio"
            aria-checked={lv === level}
            disabled={disabled}
            onClick={() => onChange(lv)}
            className={`rounded-lg border px-2.5 py-1 text-xs font-medium disabled:opacity-60 ${
              lv === level ? "border-[#2740e6] bg-white text-[#2740e6]" : "border-slate-300 bg-white text-slate-600"
            }`}
          >
            {L(LEVEL_LABEL[lv])}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-xs text-slate-700">
        <span className="font-semibold">{L(LEVEL_LABEL[level])}: </span>
        {L(LEVEL_WHO[level])}
      </p>
      <p className="mt-0.5 text-[11px] text-slate-500">
        {L(LEVEL_BASIS)} {L(LEVEL_GUIDE_NOTE)}
      </p>
    </div>
  );
}
