/**
 * PDF of one player's goal plan (lota 4): the outcome, the sessions ticked, the test results, the 8 weeks as
 * approved, why this start, the safety rules, the limits of the research and the history.
 *
 * Layered read: <Verdict> (rule-based outcome, or where the plan stands) → <FactRow> (sessions done, the main test,
 * the "clear change" mark) → tables. Rules only, no AI. GPS numbers are printed as context, never as the verdict.
 *
 * Styling: shared MicroPulse PDF kit (src/components/pdf/brand.tsx).
 */

import { Document, Text, View } from "@react-pdf/renderer";
import type { Bi, GoalPlan } from "@/lib/micropulse/goalPlan/types";
import { QUALITY_LABEL } from "@/lib/micropulse/goalPlan/common";
import { EVENT_LABEL, STATUS_LABEL, type GoalPlanEventRow, type GoalPlanStatus } from "@/lib/micropulse/goalPlan/requests";
import { MEASURE_DEF, PHASE_LABEL, type GoalProgress } from "@/lib/micropulse/goalPlan/outcome";
import { BrandPage, Bullets, C, FactRow, Provenance, Section, Table, Verdict, clean, fb, fh, fileSafe, renderPdfBlob, saveBlob, type Tone } from "@/components/pdf/brand";

type Lang = "EN" | "IS";

export type GoalPlanPdfData = {
  playerName: string | null;
  status: GoalPlanStatus;
  startDate: string | null;
  endDate: string | null;
  coachNote: string | null;
  plan: GoalPlan;
  progress: GoalProgress | null;
  events: GoalPlanEventRow[];
};

const dateOf = (iso: string | null, lang: Lang) =>
  iso ? new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString(lang === "IS" ? "is-IS" : "en-GB", { day: "numeric", month: "short", year: "numeric" }) : "-";

export function GoalPlanDoc({ d, lang }: { d: GoalPlanPdfData; lang: Lang }) {
  const IS = lang === "IS";
  const L = (b: Bi) => clean(IS ? b.is : b.en);
  const T = (en: string, is: string) => (IS ? is : en);
  const { plan, progress } = d;
  const q = QUALITY_LABEL[plan.quality];
  const name = d.playerName ?? T("Player", "Leikmaður");
  const o = progress?.outcome ?? null;
  const main = o?.measures.find((m) => m.measure === o.main) ?? null;

  const tone: Tone = o?.state === "improved" ? "cobalt" : o?.state === "worse" ? "amber" : "neutral";
  const label = o
    ? o.state === "improved" ? T("Clear change", "Skýr breyting")
      : o.state === "no_clear_change" ? T("No clear change", "Engin skýr breyting")
        : o.state === "worse" ? T("Changed the wrong way", "Breyting í ranga átt") : T("Waiting for tests", "Bíður prófa")
    : T("Plan", "Áætlun");
  const headline = o ? L(o.verdict) : L(plan.verdict);
  const body = o?.state === "waiting"
    ? `${T("Tests:", "Próf:")} ${L(plan.tests.what)}`
    : main ? `${T("Clear change from", "Skýr breyting frá")} ${MEASURE_DEF[main.measure].clearPct}% · ${L(MEASURE_DEF[main.measure].clearBasis)}.` : undefined;

  const facts = [
    progress
      ? { value: progress.adherence.due ? `${progress.adherence.done}/${progress.adherence.due}` : "-", label: T("Sessions ticked done", "Æfingar merktar búnar"), sub: L(progress.adherence.line) }
      : null,
    main && main.baseline && main.retest
      ? {
          value: `${main.improvementPct! >= 0 ? "+" : ""}${main.improvementPct!.toFixed(1)}%`,
          label: L(MEASURE_DEF[main.measure].label),
          sub: `${main.baseline.value} → ${main.retest.value} ${MEASURE_DEF[main.measure].unit}`,
          tone: (main.read === "clearer" ? "cobalt" : main.read === "worse" ? "amber" : undefined) as Tone | undefined,
        }
      : null,
    { value: `${plan.sessionsPerWeek}×`, label: T("Sessions a week", "Æfingar á viku"), sub: T("Add-on to team training", "Viðbót við æfingar liðsins") },
  ].filter((f): f is NonNullable<typeof f> => !!f);

  return (
    <Document title={`${name} - ${L(q)}`}>
      <BrandPage
        doc={T("Goal plan", "Markmiðsáætlun")}
        context={name}
        title={`${name}: ${L(q).toLowerCase()}`}
        kicker={T("GOAL PLAN · 8 WEEKS", "MARKMIÐSÁÆTLUN · 8 VIKUR")}
        subtitle={`${dateOf(d.startDate, lang)} – ${dateOf(d.endDate, lang)} · ${L(STATUS_LABEL[d.status])}`}
        note={T("Rules decide, no AI · an add-on: never changed the readiness colour or the team's session", "Reglur ráða, engin gervigreind · viðbót: breytti aldrei readiness-litnum né æfingu liðsins")}
      >
        <Verdict tone={tone} label={label} headline={headline} body={body} confidence={T(`Plan confidence: ${plan.confidence.level}`, `Vissa áætlunar: ${plan.confidence.level === "high" ? "mikil" : plan.confidence.level === "moderate" ? "miðlungs" : "lítil"}`)} />
        <FactRow facts={facts} />

        {progress ? (
          <Section title={T("Test results", "Prófniðurstöður")} hint={L(plan.tests.change)}>
            {progress.results.length ? (
              <Table
                cols={[
                  { label: T("Test", "Próf"), flex: 1.5 },
                  { label: T("When", "Hvenær"), flex: 1 },
                  { label: T("Date", "Dags."), flex: 0.9 },
                  { label: T("Value", "Gildi"), flex: 0.8, align: "right" },
                  { label: T("Source", "Uppruni"), flex: 1.4 },
                ]}
                rows={progress.results.map((r) => [
                  L(MEASURE_DEF[r.measure].label),
                  L(PHASE_LABEL[r.phase]),
                  dateOf(r.test_date, lang),
                  `${r.value.toFixed(MEASURE_DEF[r.measure].decimals)} ${MEASURE_DEF[r.measure].unit}`,
                  r.source === "vald" ? clean(r.note ?? "VALD") : `${T("Coach", "Þjálfari")}${r.note ? ` · ${clean(r.note)}` : ""}`,
                ])}
              />
            ) : (
              <Text style={[fb(400), { fontSize: 9, color: C.mute }]}>{T("No test results yet.", "Engar prófniðurstöður enn.")}</Text>
            )}
            {o ? <View style={{ marginTop: 6 }}><Bullets items={o.measures.map((m) => L(m.line))} /></View> : null}
            {progress.gps ? <Provenance>{L(progress.gps.line)}</Provenance> : null}
          </Section>
        ) : null}

        <Section title={T("Why this plan", "Af hverju þessi áætlun")}>
          <Bullets items={[...new Set([L(plan.verdict), ...plan.facts.map(L), ...(plan.branch ? [L(plan.branch.why)] : []), ...(plan.counterfactual ? [L(plan.counterfactual)] : [])])]} />
          {d.coachNote ? <Provenance>{`${T("Coach's note to the player:", "Skilaboð þjálfara til leikmanns:")} ${clean(d.coachNote)}`}</Provenance> : null}
        </Section>

        <Section title={T("The 8 weeks as approved", "Vikurnar 8 eins og þær voru samþykktar")} hint={L(plan.supervision)} break>
          {plan.weeks.map((w) => (
            <View key={w.week} wrap={false} style={{ marginBottom: 7 }}>
              <Text style={[fh(700), { fontSize: 9.5, marginBottom: 3 }]}>{L(w.label)}</Text>
              <Table
                dense
                cols={[
                  { label: T("Session", "Æfing"), width: 92 },
                  { label: T("What", "Hvað"), flex: 1.1 },
                  { label: T("Dose", "Skammtur"), flex: 1.7 },
                ]}
                rows={w.sessions.flatMap((s) => s.blocks.map((b, i) => [
                  i === 0 ? `${s.slot} · ${L(s.focus)}` : "",
                  L(b.what),
                  L(b.dose),
                ]))}
                rowTone={(i) => (w.sessions.flatMap((s) => s.blocks)[i]?.test ? "cobalt" : null)}
              />
            </View>
          ))}
        </Section>

        <Section title={T("Rules that always apply", "Reglur sem gilda alltaf")}>
          <Bullets items={plan.safety.map(L)} tone="amber" />
        </Section>

        <Section title={T("What the research does not show", "Það sem rannsóknirnar sýna ekki")}>
          <Bullets items={[L(plan.basis), ...plan.limits.map(L)]} />
        </Section>

        {d.events.length ? (
          <Section title={T("History", "Saga")}>
            <Table
              dense
              cols={[{ label: T("Date", "Dags."), width: 80 }, { label: T("What", "Hvað"), flex: 1 }, { label: T("Reason", "Ástæða"), flex: 2 }]}
              rows={d.events.map((e) => [dateOf(e.created_at, lang), L(EVENT_LABEL[e.kind]), e.reason ? clean(e.reason) : ""])}
            />
          </Section>
        ) : null}

        <Section title={T("Sources", "Heimildir")}>
          {plan.refs.map((r) => (
            <Provenance key={r.key}>{clean(`${r.cite} [${r.verifiedFrom === "full_text" ? T("read in full", "lesin í heild") : T("abstract only", "aðeins ágrip")}]`)}</Provenance>
          ))}
        </Section>
      </BrandPage>
    </Document>
  );
}

export async function downloadGoalPlanPdf(d: GoalPlanPdfData, lang: Lang) {
  const blob = await renderPdfBlob(() => <GoalPlanDoc d={d} lang={lang} />);
  const q = QUALITY_LABEL[d.plan.quality];
  saveBlob(blob, `${fileSafe(`${d.playerName ?? "player"} ${lang === "IS" ? q.is : q.en} goal plan`).toLowerCase()}.pdf`);
}
