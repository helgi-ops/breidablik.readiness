"use client";

export const dynamic = "force-dynamic";

import { useLang } from "@/lib/lang";
import MovementScreenClient from "@/components/movement/MovementScreenClient";
import RegionAssessmentForm from "@/components/movement/RegionAssessmentForm";

export default function MovementScreenPage() {
  const [lang] = useLang();
  const is = lang === "IS";
  const T = (en: string, isT: string) => (is ? isT : en);

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4">
      <div>
        <h1 className="text-lg font-bold text-slate-900">{T("Movement Screen", "Hreyfiskimun")}</h1>
        <p className="mt-0.5 text-[12px] text-slate-500">
          {T(
            "Upload a test's clips once — the same clips drive both the pose measurement AND the AI read (the qualitative eye that points you to a region). For anything not in the list (e.g. gait), pick “Other movement” for an AI read. Then record the assessment and prescribe. Screening & training only — not a diagnosis; pain / red flags route to a clinician. Never the readiness colour.",
            "Hladdu upp klippum prófs einu sinni — sömu klippur keyra bæði pose-mælinguna OG AI-lesturinn (eigindlega augað sem beinir þér að svæði). Fyrir hvað sem er ekki í listanum (t.d. göngulag), veldu „Önnur hreyfing“ fyrir AI-lestur. Skráðu svo matið og ávísaðu. Aðeins skimun & þjálfun — ekki greining; verkur / rauð flögg fara til klíníkers. Aldrei readiness-liturinn.",
          )}
        </p>
      </div>

      <section className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#2740e6]">{T("Step 1 · Movement test — measure + AI read (one upload)", "Þrep 1 · Hreyfipróf — mæla + AI-lestur (ein upphleðsla)")}</p>
        <MovementScreenClient hideHeader />
      </section>

      <section className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#2740e6]">{T("Step 2 · Region assessment", "Þrep 2 · Svæðismat")}</p>
        <p className="text-[11px] text-slate-500">{T("Field-by-field per body region — seeded by the AI read (priority fields starred). Flagged fields feed the same corrective → send-to-player loop.", "Reit-fyrir-reit per líkamssvæði — sáð úr AI-lestrinum (forgangsreitir stjörnumerktir). Flögguð atriði fæða sömu leiðréttingar → senda-á-leikmann lykkju.")}</p>
        <RegionAssessmentForm />
      </section>
    </div>
  );
}
