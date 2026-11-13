/**
 * PDF of one top-speed plan (in season / pre-season / individual) from `@/lib/micropulse/speedMethods`, so
 * the paper matches the page. Layered read: verdict → 2–3 facts → the week-by-week table → the methods it
 * uses with their evidence → safety rules → sources. Rule-based reference content (no AI); the footer says
 * the plan is MicroPulse's combination of doses from the cited studies.
 *
 * Styling: shared MicroPulse PDF kit (src/components/pdf/brand.tsx).
 */

import { Document, Text, View } from "@react-pdf/renderer";
import {
  SPEED_EVIDENCE_LABEL,
  SPEED_METHOD_BY_KEY,
  SPEED_PLAN_BASIS,
  SPEED_PLAN_BY_KEY,
  SPEED_REFS,
  SPEED_SAFETY,
  VERIFIED_LABEL,
  planMethodKeys,
  type Bi,
  type SpeedPlanKey,
} from "@/lib/micropulse/speedMethods";
import { BrandPage, Bullets, C, Provenance, Section, Table, Verdict, clean, fb, fh, fileSafe, renderPdfBlob, saveBlob } from "@/components/pdf/brand";

type Lang = "EN" | "IS";

export function SpeedPlanDoc({ planKey, lang }: { planKey: SpeedPlanKey; lang: Lang }) {
  const L = (b: Bi) => clean(lang === "IS" ? b.is : b.en);
  const plan = SPEED_PLAN_BY_KEY[planKey];
  const IS = lang === "IS";
  const methods = planMethodKeys(plan).map((k) => SPEED_METHOD_BY_KEY[k]);
  const refKeys = [...new Set([...plan.refs, "malone2017" as const, "buchheit2023" as const])];

  return (
    <Document title={L(plan.title)}>
      <BrandPage
        doc={IS ? "Hámarkshraði" : "Top speed plan"}
        context={IS ? "Fyrir þjálfara" : "For the coach"}
        title={L(plan.title)}
        kicker={IS ? "HÁMARKSHRAÐI · ÁÆTLUN" : "TOP SPEED · PLAN"}
        subtitle={L(plan.who)}
        note={IS ? "Samsetning MicroPulse úr skömmtum rannsóknanna · ekki prófuð sem heild" : "MicroPulse's combination of doses from the studies · not tested as a whole"}
      >
        <Verdict tone="cobalt" label={IS ? "Áætlunin" : "The plan"} headline={L(plan.verdict)} body={L(SPEED_PLAN_BASIS)} />

        <Section title={IS ? "Í stuttu máli" : "In short"}>
          <Bullets items={plan.facts.map(L)} />
        </Section>

        <Section title={IS ? "Vika fyrir viku" : "Week by week"} hint={IS ? "Hlaupin fyrst, salurinn á eftir. Fljúgandi = aðhlaup og svo hraðasvæði á fullum hraða." : "Running first, gym after. Flying = a build-up, then a fast zone at full speed."}>
          {plan.weeks.map((w) => (
            <View key={w.label.en} style={{ marginBottom: 8 }}>
              <Text style={[fh(700), { fontSize: 10, marginBottom: 4 }]}>{L(w.label)}</Text>
              <Table
                cols={[
                  { label: IS ? "Dagur" : "Day", width: 78 },
                  { label: IS ? "Hvað" : "What", flex: 1.1 },
                  { label: IS ? "Skammtur" : "Dose", flex: 1.6 },
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
                    L(b.what),
                    L(b.dose),
                  ]),
                )}
                rowTone={(i) => {
                  const flat = w.sessions.flatMap((s) => s.blocks);
                  return flat[i]?.test ? "cobalt" : null;
                }}
              />
            </View>
          ))}
        </Section>

        <Section title={IS ? "Reglur sem gilda alltaf" : "Rules that always apply"}>
          <Bullets items={SPEED_SAFETY.map(L)} tone="amber" />
        </Section>

        <Section title={IS ? "Aðferðirnar í áætluninni" : "The methods in this plan"}>
          <Table
            cols={[
              { label: IS ? "Aðferð" : "Method", flex: 1.1 },
              { label: IS ? "Gögn fyrir hámarkshraða" : "Evidence for top speed", flex: 1 },
              { label: IS ? "Skammtur" : "Dose", flex: 1.9 },
            ]}
            rows={methods.map((m) => [
              L(m.label),
              <Text key="e" style={[fb(600), { fontSize: 8, color: m.evidence === "none" ? C.mute : undefined }]}>{L(SPEED_EVIDENCE_LABEL[m.evidence])}</Text>,
              L(m.dose),
            ])}
          />
        </Section>

        <Section title={IS ? "Heimildir" : "Sources"}>
          {refKeys.map((k) => (
            <Provenance key={k}>
              {clean(`${SPEED_REFS[k].cite} [${L(VERIFIED_LABEL[SPEED_REFS[k].verifiedFrom])}]`)}
            </Provenance>
          ))}
        </Section>
      </BrandPage>
    </Document>
  );
}

export async function downloadSpeedPlanPdf(planKey: SpeedPlanKey, lang: Lang) {
  const plan = SPEED_PLAN_BY_KEY[planKey];
  const blob = await renderPdfBlob(() => <SpeedPlanDoc planKey={planKey} lang={lang} />);
  saveBlob(blob, `${fileSafe(lang === "IS" ? plan.title.is : plan.title.en).toLowerCase()}.pdf`);
}
