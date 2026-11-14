"use client";

/**
 * Programme Library "Speed & power" tab: one tab, four qualities — the same four a player can pick as a goal
 * (top speed, acceleration, braking, jump). Top speed shows the existing top-speed library unchanged (methods,
 * three plans, PDF); the other three show their method libraries (lota 1: methods only). Coach-only reference.
 */

import { useState } from "react";
import SpeedMethodLibrary from "@/components/trainer/SpeedMethodLibrary";
import QualityMethodLibrary from "@/components/trainer/QualityMethodLibrary";
import { QUALITY_LIBRARIES } from "@/lib/micropulse/goalPlan/qualityLibrary";
import { GOAL_QUALITIES, type Bi, type GoalQuality } from "@/lib/micropulse/goalPlan/types";

type Lang = "IS" | "EN";

const PILL: Record<GoalQuality, Bi> = {
  top_speed: { en: "Top speed", is: "Hámarkshraði" },
  acceleration: { en: "Acceleration", is: "Hröðun" },
  braking: { en: "Braking", is: "Bremsun" },
  jump: { en: "Jump", is: "Stökk" },
};

export default function SpeedPowerLibrary({ lang }: { lang: Lang }) {
  const [q, setQ] = useState<GoalQuality>("top_speed");
  const L = (b: Bi) => (lang === "IS" ? b.is : b.en);
  return (
    <div>
      <div className="mb-5 flex flex-wrap gap-1.5" role="tablist" aria-label={lang === "IS" ? "Eiginleiki" : "Quality"}>
        {GOAL_QUALITIES.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={k === q}
            onClick={() => setQ(k)}
            className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold ${
              k === q ? "border-[#2740e6] bg-[#2740e6] text-white" : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
            }`}
          >
            {L(PILL[k])}
          </button>
        ))}
      </div>
      {q === "top_speed"
        ? <SpeedMethodLibrary lang={lang} />
        : <QualityMethodLibrary key={q} lib={QUALITY_LIBRARIES[q]} lang={lang} />}
    </div>
  );
}
