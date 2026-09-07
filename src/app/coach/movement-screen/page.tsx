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
            "Step 1 is the AI eye — it reads any movement visually and tells you where to look (no measurements, nothing saved). Steps 2 are the instrument — measure the angles, record, and prescribe. Use 1 to decide, 2 to act. Screening & training only — not a diagnosis; pain / red flags route to a clinician. Never the readiness colour.",
            "Þrep 1 er AI-augað — les hvaða hreyfingu sem er sjónrænt og segir þér hvar á að leita (engar mælingar, ekkert vistað). Þrep 2 eru tækið — mæla hornin, skrá og ávísa. Notaðu 1 til að ákveða, 2 til að framkvæma. Aðeins skimun & þjálfun — ekki greining; verkur / rauð flögg fara til klíníkers. Aldrei readiness-liturinn.",
          )}
        </p>
      </div>

      <section className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#2740e6]">{T("Step 1 · AI read — where to look (optional)", "Þrep 1 · AI-lestur — hvar á að leita (valfrjálst)")}</p>
        <MovementVisionAnalysis />
      </section>

      <section className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#2740e6]">{T("Step 2a · Measure & record (pose test)", "Þrep 2a · Mæla & skrá (pose próf)")}</p>
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
