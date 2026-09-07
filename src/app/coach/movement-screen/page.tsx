"use client";

export const dynamic = "force-dynamic";

import { useLang } from "@/lib/lang";
import MovementVisionAnalysis from "@/components/movement/MovementVisionAnalysis";
import MovementScreenClient from "@/components/movement/MovementScreenClient";
import RegionAssessmentForm from "@/components/movement/RegionAssessmentForm";

export default function MovementScreenPage() {
  const [lang] = useLang();
  const is = lang === "IS";
  const T = (en: string, isT: string) => (is ? isT : en);

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4">
      <div>
        <h1 className="text-lg font-bold text-slate-900">{T("Movement Screen", "Hreyfiskimun")}</h1>
        <p className="mt-0.5 text-[12px] text-slate-500">
          {T(
            "Two steps: read the movement visually with AI, then record the assessment it points you to — pose-measured findings, cited correctives sent to the player, PDF + re-screen. Screening & training only — not a diagnosis; pain / red flags route to a clinician. Never the readiness colour.",
            "Tvö þrep: lestu hreyfinguna sjónrænt með AI, skráðu svo matið sem hún beinir þér að — pose-mældar niðurstöður, tilvitnaðar leiðréttingar sendar á leikmann, PDF + endurskimun. Aðeins skimun & þjálfun — ekki greining; verkur / rauð flögg fara til klíníkers. Aldrei readiness-liturinn.",
          )}
        </p>
      </div>

      <section className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#2740e6]">{T("Step 1 · Analyse (AI)", "Þrep 1 · Greining (AI)")}</p>
        <MovementVisionAnalysis />
      </section>

      <section className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#2740e6]">{T("Step 2a · Test screen (pose + prescribe)", "Þrep 2a · Prófskimun (pose + forskrift)")}</p>
        <MovementScreenClient hideHeader />
      </section>

      <section className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#2740e6]">{T("Step 2b · Region assessment", "Þrep 2b · Svæðismat")}</p>
        <p className="text-[11px] text-slate-500">{T("Field-by-field per body region — seeded by the analysis (priority fields starred). Flagged fields feed the same corrective → send-to-player loop.", "Reit-fyrir-reit per líkamssvæði — sáð úr greiningunni (forgangsreitir stjörnumerktir). Flögguð atriði fæða sömu leiðréttingar → senda-á-leikmann lykkju.")}</p>
        <RegionAssessmentForm />
      </section>
    </div>
  );
}
