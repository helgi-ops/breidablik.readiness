/**
 * PDF of one acceleration / braking / jump-height plan (in season / pre-season / individual) from
 * `goalPlan/qualityPlans`, so the paper matches the page. Same layered read as `SpeedPlanPdf`: verdict → 2–3 facts
 * → the week-by-week table → rules → the methods it uses and how they were tested → what it does not show →
 * sources. Rule-based reference content (no AI); the footer says the plan is MicroPulse's combination of doses
 * from the cited studies.
 *
 * Styling: shared MicroPulse PDF kit (src/components/pdf/brand.tsx).
 */

import { Document, Text, View } from "@react-pdf/renderer";
import { BASIS_LABEL, QUALITY_LIBRARIES } from "@/lib/micropulse/goalPlan/qualityLibrary";
import { QUALITY_PLAN_RULES, planMethodKeys, type QualityPlan } from "@/lib/micropulse/goalPlan/qualityPlans";
import type { Bi } from "@/lib/micropulse/goalPlan/types";
import { SWAP_NOTE, SWAPPED_BY_COACH, hasSwaps, swapMark } from "@/lib/micropulse/goalPlan/swaps";
import { VERIFIED_LABEL } from "@/lib/micropulse/speedMethods";
import { BrandPage, Bullets, C, Provenance, Section, Table, Verdict, clean, fb, fh, fileSafe, renderPdfBlob, saveBlob } from "@/components/pdf/brand";

type Lang = "EN" | "IS";

const DOC: Record<QualityPlan["quality"], Bi> = {
  acceleration: { en: "Acceleration plan", is: "Hröðun" },
  braking: { en: "Braking plan", is: "Bremsun" },
  jump: { en: "Jump height plan", is: "Stökkhæð" },
};
const KICKER: Record<QualityPlan["quality"], Bi> = {
  acceleration: { en: "ACCELERATION · PLAN", is: "HRÖÐUN · ÁÆTLUN" },
  braking: { en: "BRAKING · PLAN", is: "BREMSUN · ÁÆTLUN" },
  jump: { en: "JUMP HEIGHT · PLAN", is: "STÖKKHÆÐ · ÁÆTLUN" },
};

export function QualityPlanDoc({ plan, lang }: { plan: QualityPlan; lang: Lang }) {
  const L = (b: Bi) => clean(lang === "IS" ? b.is : b.en);
  const IS = lang === "IS";
  const lib = QUALITY_LIBRARIES[plan.quality];
  const methods = planMethodKeys(plan).map((k) => lib.methods.find((m) => m.key === k)).filter((m) => m != null);
  const individual = plan.key === "individual";
  // Coach's swaps (lota 4, step 3): a swapped exercise is named as such, with the planned one beside it.
  const swapped = hasSwaps(plan);
  const whatCell = (b: { what: Bi }) => {
    const m = swapMark(b);
    if (!m?.swapped) return L(b.what);
    return `${L(b.what)} (${L(SWAPPED_BY_COACH)}; ${IS ? "í áætlun" : "planned"}: ${L(m.planned)})`;
  };

  return (
    <Document title={L(plan.title)}>
      <BrandPage
        doc={L(DOC[plan.quality])}
        context={IS ? "Fyrir þjálfara" : "For the coach"}
        title={L(plan.title)}
        kicker={L(KICKER[plan.quality])}
        subtitle={L(plan.who)}
        note={IS ? "Samsetning MicroPulse úr skömmtum rannsóknanna · ekki prófuð sem heild" : "MicroPulse's combination of doses from the studies · not tested as a whole"}
      >
        <Verdict tone="cobalt" label={IS ? "Áætlunin" : "The plan"} headline={L(plan.verdict)} body={swapped ? `${L(plan.basis)} ${L(SWAP_NOTE)}` : L(plan.basis)} />

        <Section title={IS ? "Í stuttu máli" : "In short"}>
          <Bullets items={plan.facts.map(L)} />
        </Section>

        <Section
          title={IS ? "Vika fyrir viku" : "Week by week"}
          hint={individual
            ? IS ? "Æfing C er aðeins utan tímabils. Mælingar eru merktar bláar." : "Session C is out of season only. Tests are marked blue."
            : IS ? "Hlaup og hopp á undan salnum. Mælingar eru merktar bláar." : "Running and jumps before the gym. Tests are marked blue."}
        >
          {plan.weeks.map((w) => (
            <View key={w.label.en} wrap={false} style={{ marginBottom: 8 }}>
              <Text style={[fh(700), { fontSize: 10, marginBottom: 4 }]}>{L(w.label)}</Text>
              <Table
                cols={[
                  { label: IS ? "Dagur" : "Day", width: 92 },
                  { label: IS ? "Hvað" : "What", flex: 1.1 },
                  { label: IS ? "Skammtur" : "Dose", flex: 1.7 },
                ]}
                rows={w.sessions.flatMap((s) =>
                  s.blocks.map((b, bi) => [
                    bi === 0 ? (
                      <View key="d">
                        <Text style={[fh(700), { fontSize: 8.5 }]}>{L(s.dayLabel)}</Text>
                        <Text style={[fb(400), { fontSize: 7.5, color: C.mute }]}>{L(s.focus)}</Text>
                      </View>
                    ) : (
                      ""
                    ),
                    whatCell(b),
                    L(b.dose),
                  ]),
                )}
                rowTone={(i) => (w.sessions.flatMap((s) => s.blocks)[i]?.test ? "cobalt" : null)}
              />
            </View>
          ))}
        </Section>

        <Section title={IS ? "Reglur sem gilda alltaf" : "Rules that always apply"}>
          <Bullets items={QUALITY_PLAN_RULES.map(L)} tone="amber" />
        </Section>

        <Section title={IS ? "Aðferðirnar í áætluninni" : "The methods in this plan"}>
          <Table
            cols={[
              { label: IS ? "Aðferð" : "Method", flex: 1.1 },
              { label: IS ? "Hvernig prófað" : "How it was tested", flex: 0.8 },
              { label: IS ? "Skammtur" : "Dose", flex: 2 },
            ]}
            rows={methods.map((m) => [
              L(m.label),
              <Text key="b" style={[fb(600), { fontSize: 8, color: m.basis === "trial" ? undefined : C.mute }]}>{L(BASIS_LABEL[m.basis])}</Text>,
              L(m.dose),
            ])}
          />
        </Section>

        {plan.limits.length > 0 && (
          <Section title={IS ? "Það sem þessi áætlun sýnir ekki" : "What this plan does not show"}>
            <Bullets items={plan.limits.map(L)} />
          </Section>
        )}

        <Section title={IS ? "Heimildir" : "Sources"}>
          {plan.refs.map((k) => lib.refs[k]).filter((r) => r != null).map((r) => (
            <Provenance key={r.key}>{clean(`${r.cite} [${L(VERIFIED_LABEL[r.verifiedFrom])}]`)}</Provenance>
          ))}
        </Section>
      </BrandPage>
    </Document>
  );
}

export async function downloadQualityPlanPdf(plan: QualityPlan, lang: Lang) {
  const blob = await renderPdfBlob(() => <QualityPlanDoc plan={plan} lang={lang} />);
  saveBlob(blob, `${fileSafe(lang === "IS" ? plan.title.is : plan.title.en).toLowerCase()}.pdf`);
}
