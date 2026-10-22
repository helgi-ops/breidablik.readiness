"use client";

export const dynamic = "force-dynamic";

/**
 * Season-end / national-team BRIDGE plan — a clear entry point for the off-week maintenance program
 * when the domestic season ends and players must stay fit until a later assignment (e.g. a KSÍ camp).
 * Reuses the same per-player, data-driven maintenance engine as Week Setup (running + strength from the
 * player's own MAS / 1RM / needs), sends it to the players' app, and exports a squad PDF to hand over.
 */

import OffWeekProgramButton from "@/components/coach/OffWeekProgramButton";
import { useLang } from "@/lib/lang";

export default function BridgePlanPage() {
  const [lang] = useLang();
  const is = lang === "IS";
  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="text-xl font-bold text-slate-900">{is ? "Brú-plan (lok tímabils / landsliðs-verkefni)" : "Bridge plan (season-end / national-team)"}</h1>
      <p className="mt-1 max-w-3xl text-sm text-slate-600">
        {is
          ? "Þegar deildin klárast og leikmenn þurfa að halda sér í formi fram að verkefni (t.d. landsliðsgluggi) býr þetta til einstaklingsmiðað viðhaldsplan fyrir hvern leikmann — hlaup og styrk út frá HANS gögnum (MAS, 1RM, áherslur) — sendir það í leikmannaappið og gefur liðs-PDF sem má afhenda sambandinu."
          : "When the league ends and players must stay fit until an assignment (e.g. a national-team window), this builds a per-player maintenance plan — running and strength from HIS own data (MAS, 1RM, needs) — sends it to the players' app, and exports a squad PDF you can hand to the association."}
      </p>
      <ul className="mt-2 max-w-3xl list-disc pl-5 text-[13px] text-slate-500">
        <li>{is ? "Veldu lengd (allt að 3 vikur) og hvort leikmenn hafa ræktaraðgang eða æfa á líkamsþyngd (ferðalag)." : "Pick the length (up to 3 weeks) and whether players have gym access or train on bodyweight (travel)."}</li>
        <li>{is ? "Sjálf-leiðbeint: álag sem RPE / tími / vegalengd — ekkert GPS eða þjálfari þarf að vera til staðar." : "Self-guided: prescriptions as RPE / time / distance — no GPS or coach needed on the day."}</li>
        <li>{is ? "Viðhald, ekki uppbygging — þjálfari lagar áður en sent er." : "Maintenance, not a building block — the coach edits before sending."}</li>
      </ul>
      <div className="mt-5">
        <OffWeekProgramButton />
      </div>
    </div>
  );
}
