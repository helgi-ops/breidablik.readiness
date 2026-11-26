"use client";

/**
 * PeriodizationPreseasonPdf — the Meso: Pre-season tab on its own. Layered read: the proposal's verdict + its
 * confidence → four plain facts (sessions, load ramp, light week, friendlies) → the gaps → load per variable
 * (week 1 → peak → light week vs research) → the ramp week by week → the meso cycles → games & tests by week →
 * every week Mon–Sun → tests, day ideas, and what the coach set vs what the rules proposed.
 *
 * Every number comes from the same proposal the tab shows (preseasonProposal) and the same row function as the
 * variable table (preseasonVariableRows). Descriptive planning — never sets the readiness colour.
 * Styling + download: shared MicroPulse PDF kit (src/components/pdf/brand.tsx).
 */

import type { ReactNode } from "react";
import { Document, Text, View } from "@react-pdf/renderer";
import { DayDrillsSection } from "@/components/coach/DayDrillsPdfSection";
import type { DayDrillRow } from "@/lib/micropulse/dayDrillSheet";
import type { Bi, BlockGoalKey, CalendarBlock } from "@/lib/micropulse/periodization/index";
import type { PreseasonProposal } from "@/lib/micropulse/periodization/preseasonProposal";
import type { PreseasonVariableRows } from "@/lib/micropulse/periodization/preseasonVariableRows";
import { KPI_GROUPS, kpiGroup, plainKpiName } from "@/lib/micropulse/periodization/kpiPlainNames";
import { tmRefBand } from "@/lib/micropulse/periodization/matchReference";
import { PRESEASON_TAPER_RESEARCH } from "@/lib/micropulse/periodization/preseasonWindow";
import { CalWeeks, PreseasonRampSection, shortDate, tx, type HubPreseasonStart, type HubWeeklyLoad } from "@/components/coach/PeriodizationHubPdf";
import { BrandPage, Bullets, C, Card, FactRow, Provenance, Section, TONE, Table, Verdict, fb, fh, fileSafe, renderPdfBlob, saveBlob, type Tone } from "@/components/pdf/brand";

type Lang = "EN" | "IS";

export type PeriodizationPreseasonPayload = {
  teamName: string; generatedAt?: string;
  /** The first league game (the opener) and whether it is estimated. */
  opener: string | null; openerEstimated: boolean;
  /** The pre-season proposal the tab renders (verdict, facts, weeks, blocks, tests, gaps, choices, engine.cal). */
  prop: Pick<PreseasonProposal, "window" | "verdict" | "facts" | "confidence" | "choices" | "weeks" | "blocks" | "tests" | "gaps" | "settings" | "weekendGames"> & { engine: { cal: CalendarBlock; fixtures: string[] } };
  /** How many of the earliest meso cycles are the flexible base. */
  baseBlocks: number;
  /** Load per variable (week 1 → peak → light) — null when there is no match unit yet. */
  variables: PreseasonVariableRows | null;
  preseasonStart: HubPreseasonStart | null;
  weeklyLoad: HubWeeklyLoad | null;
  dayDrills?: DayDrillRow[] | null;
};

const GOAL: Record<BlockGoalKey, Bi> = {
  accum: { en: "Accumulation", is: "Uppsöfnun" },
  transmute: { en: "Transmutation", is: "Umbreyting" },
  realize: { en: "Realization", is: "Framkvæmd" },
  deload: { en: "Deload", is: "Niðurtröppun" },
};
const isoAdd = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

function PreseasonDoc({ p, lang }: { p: PeriodizationPreseasonPayload; lang: Lang }) {
  const is = lang === "IS";
  const bi = (b: Bi) => tx(is ? b.is : b.en);
  const d = (iso: string) => shortDate(iso, lang);
  const fx = (x: number | null) => (x == null ? "-" : `${is ? String(x).replace(".", ",") : x}×`);
  const { prop } = p;
  const weeks = prop.weeks;
  const n = weeks.length;
  const friendlies = prop.engine.fixtures.filter((f) => f !== p.opener);
  const taper = prop.settings.taperPct;
  const lightIdx = weeks.findIndex((w) => w.target.taper);
  const mult = weeks.map((w) => w.target.multipleOfMatch);
  const hasMult = n > 0 && mult.every((m) => m != null);
  const peakIdx = weeks.reduce((best, w, i) => (i !== lightIdx && (w.target.multipleOfMatch ?? 0) > (weeks[best].target.multipleOfMatch ?? 0) ? i : best), 0);
  const startY = prop.window.start.slice(0, 4), endY = prop.window.end.slice(0, 4);
  const seasonLabel = startY === endY ? startY : `${startY}–${endY.slice(2)}`;
  const conf = prop.confidence;
  const confWord = conf.level === "high" ? (is ? "há" : "high") : conf.level === "moderate" ? (is ? "miðlungs" : "moderate") : (is ? "lítil" : "low");
  const confTone: Tone = conf.level === "high" ? "green" : conf.level === "moderate" ? "amber" : "red";
  const testName = (key: string) => { const tt = prop.tests.find((x) => x.key === key); return tt ? bi(tt.name) : key; };

  const openerText = !p.opener
    ? (is ? "fyrsti deildarleikur ekki skráður" : "first league game not entered")
    : p.openerEstimated
      ? (is ? `fyrsti deildarleikur áætlaður ${d(p.opener)}` : `first league game estimated ${d(p.opener)}`)
      : (is ? `fyrsti deildarleikur ${d(p.opener)}` : `first league game ${d(p.opener)}`);

  // Load per variable — grouped in plain names, the overall load first.
  const used = new Set<string>();
  const v = p.variables;
  const master = v?.rows.find((r) => r.k === "totalPlayerLoad") ?? null;
  const kpiRows = (v?.rows ?? []).filter((r) => r.k !== "totalPlayerLoad").map((r) => ({ ...r, name: plainKpiName(r.k, r.lab, is, used) }));
  const bandWord = (x: number | null, ref: [number, number] | null) => {
    const k = tmRefBand(x, ref);
    if (k == null) return { text: ref == null ? (is ? "engin viðmið" : "no reference") : "-", tone: null as Tone | null };
    return k === "in" ? { text: is ? "innan" : "within", tone: "green" as Tone } : k === "above" ? { text: is ? "yfir" : "above", tone: "amber" as Tone } : { text: is ? "undir" : "below", tone: null };
  };
  const varRow = (r: NonNullable<typeof master> & { name?: string }, name: string) => {
    const b = bandWord(r.pk, r.ref);
    return [
      <Text key="n" style={[fb(600), { fontSize: 8 }]}>{tx(name)}{r.mine ? <Text style={[fb(600), { color: C.cobalt }]}>{is ? "  · þitt" : "  · yours"}</Text> : null}</Text>,
      <Text key="w" style={[fh(700), { fontSize: 8, textAlign: "right" }]}>{fx(r.w1)}{r.w1Raw != null ? <Text style={[fb(400), { color: C.mute }]}>{`  ${Math.round(r.w1Raw).toLocaleString("en-US")}${r.unit}`}</Text> : null}</Text>,
      fx(r.pk),
      v?.lightNo != null ? fx(r.lt) : "-",
      r.ref ? `${fx(r.ref[0])}–${fx(r.ref[1])}` : "-",
      <Text key="b" style={[fb(600), { fontSize: 8, textAlign: "right", color: b.tone ? TONE[b.tone].text : C.mute }]}>{b.text}</Text>,
    ];
  };
  const varTableRows: ReactNode[][] = [];
  const varTone: Array<Tone | null> = [];
  if (master) { varTableRows.push(varRow(master, is ? "Heildarálag (PlayerLoad)" : "Overall load (PlayerLoad)")); varTone.push("neutral"); }
  for (const g of KPI_GROUPS) {
    const gr = kpiRows.filter((r) => kpiGroup(r.k) === g.key);
    for (const r of gr) { varTableRows.push(varRow(r, `${bi(g.title)} · ${r.name}`)); varTone.push(null); }
  }

  return (
    <Document>
      <BrandPage
        doc={is ? "Mesó: Undirbúningur" : "Meso: Pre-season"}
        context={p.teamName}
        kicker={is ? "Tímabilsskipulag · Mesó" : "Periodization · Meso"}
        title={`${p.teamName} - ${is ? "undirbúningur" : "pre-season"} ${seasonLabel}`}
        subtitle={`${d(prop.window.start)} -> ${d(prop.window.end)} · ${openerText}${p.generatedAt ? ` · ${p.generatedAt.slice(0, 10)}` : ""}`}
        chips={[{ text: `${n} ${is ? "vikur" : "weeks"}` }, { text: `${is ? "Vissa" : "Confidence"}: ${confWord}`, tone: confTone }]}
        note={is ? "Lýsandi áætlun - setur aldrei readiness-litinn. Reglurnar leggja til; þjálfarinn ákveður og breytir." : "Descriptive planning - never sets the readiness colour. The rules propose; the coach decides and changes."}
      >
        <Verdict tone="neutral" label={is ? "Tillaga reglnanna" : "The rules' proposal"} headline={bi(prop.verdict)}
          body={prop.facts.map(bi).join(" ")} confidence={`${is ? "Vissa" : "Confidence"} ${confWord} · ${is ? `${conf.coachChoices} af ${conf.totalChoices} val þitt` : `${conf.coachChoices} of ${conf.totalChoices} set by you`}`} />
        <FactRow
          facts={[
            { value: String(prop.settings.sessionsPerWeek), label: is ? "Æfingar / viku" : "Sessions / week", sub: prop.weekendGames.from ? (is ? `+ áætlaður lau.-leikur frá ${d(prop.weekendGames.from)}` : `+ assumed Sat. game from ${d(prop.weekendGames.from)}`) : prop.weekendGames.by === "off" ? (is ? "engir áætlaðir helgarleikir" : "no assumed weekend games") : (is ? "leikir frá fyrsta æfingaleik" : "games from the first friendly") },
            { value: hasMult ? `${fx(mult[0])} -> ${fx(mult[peakIdx])}` : "-", label: is ? "Álagsrampur (× leikur)" : "Load ramp (× a match)", sub: is ? `vika 1 -> toppur í viku ${peakIdx + 1}` : `week 1 -> peak in week ${peakIdx + 1}` },
            { value: lightIdx >= 0 && taper > 0 ? `-${taper}%` : (is ? "engin" : "none"), label: is ? "Létt lokavika" : "Light last week", sub: is ? `rannsóknir ${PRESEASON_TAPER_RESEARCH[0]}-${PRESEASON_TAPER_RESEARCH[1]}% (Bosquet 2007)` : `research ${PRESEASON_TAPER_RESEARCH[0]}-${PRESEASON_TAPER_RESEARCH[1]}% (Bosquet 2007)` },
            { value: String(friendlies.length), label: is ? "Æfingaleikir" : "Friendlies", sub: friendlies.length ? friendlies.map(d).join(" · ") : (is ? "engir skráðir" : "none entered"), tone: friendlies.length ? undefined : "amber" },
          ]}
        />
        <Text style={[fb(400), { fontSize: 8, color: C.mute, marginTop: -4, marginBottom: 8 }]}>{tx(bi(conf.note))}</Text>

        {prop.gaps.length > 0 && (
          <Card tone="amber" pad={9} style={{ marginBottom: 8 }}>
            <Text style={[fb(700), { fontSize: 8.5, color: C.amberText, marginBottom: 3 }]}>{is ? "Það sem vantar" : "What's missing"}</Text>
            <Bullets items={prop.gaps.map(bi)} tone="amber" size={8.25} />
          </Card>
        )}

        {varTableRows.length > 0 && (
          <Section title={is ? "Álag á hverja breytu - vika 1 -> toppur -> létt vika" : "Load per variable - week 1 -> peak -> light week"}
            hint={is
              ? `Hver tala er × leikur: vikan samanlagt ÷ einn leikur liðsins í þeirri breytu. Toppur = vika ${v?.peakNo ?? "-"}${v?.lightNo != null ? `, létt = vika ${v.lightNo}` : ""}. „Þitt“ = þú stilltir viku 1. Rannsóknir = æfing:leikur í venjulegri viku á keppnistímabili; toppurinn má vera yfir bilinu viljandi.`
              : `Every number is × a match: the week's total ÷ one team match in that variable. Peak = week ${v?.peakNo ?? "-"}${v?.lightNo != null ? `, light = week ${v.lightNo}` : ""}. "Yours" = you set week 1. Research = training:match in a normal in-season week; the peak may sit above the range on purpose.`}>
            <Table
              size={8}
              cols={[{ label: is ? "Breyta" : "Variable", flex: 1 }, { label: is ? "Vika 1" : "Week 1", width: 96, align: "right" }, { label: is ? "Toppur" : "Peak", width: 44, align: "right", strong: true }, { label: is ? "Létt" : "Light", width: 40, align: "right" }, { label: is ? "Rannsóknir" : "Research", width: 70, align: "right" }, { label: is ? "Toppur vs rannsóknir" : "Peak vs research", width: 70, align: "right" }]}
              rowTone={(i) => varTone[i] ?? null}
              rows={varTableRows}
            />
          </Section>
        )}

        {p.preseasonStart && p.preseasonStart.weeks.length > 0 && (
          <PreseasonRampSection preseasonStart={p.preseasonStart} weeklyLoad={p.weeklyLoad} lang={lang} title={is ? "Vika fyrir viku" : "Week by week"} />
        )}

        {prop.blocks.length > 0 && (
          <Section title={is ? "Mesó-lotur" : "Meso cycles"} hint={is ? "Sömu lotur og styrktaræfingarnar eru sendar eftir. Fyrsta lotan (grunnur) tekur vikurnar sem eftir eru; markmið fylgir röðinni nema þú veljir annað (Issurin 2010)." : "The same blocks the strength sessions are sent from. The first block (base) takes the remaining weeks; the goal follows the order unless you pick one (Issurin 2010)."}>
            <Table
              size={8}
              cols={[{ label: is ? "Lota" : "Block", width: 70 }, { label: is ? "Dagsetningar" : "Dates", width: 96 }, { label: is ? "Vikur" : "Weeks", width: 36, align: "right" }, { label: is ? "Markmið" : "Goal", flex: 1 }, { label: is ? "Valið af" : "Set by", width: 80 }]}
              rowTone={(i) => (prop.blocks[i]?.goalByCoach ? "cobalt" : null)}
              rows={prop.blocks.map((b, i) => [
                `${is ? "Lota" : "Block"} ${b.index + 1}${i < p.baseBlocks ? (is ? " · grunnur" : " · base") : ""}`,
                `${d(b.start)}–${d(isoAdd(b.end, -1))}`,
                String(b.weeks),
                bi(GOAL[b.goalKey]),
                b.goalByCoach ? (is ? "þér" : "you") : (is ? "röðinni" : "the order"),
              ])}
            />
          </Section>
        )}

        {weeks.length > 0 && (
          <Section title={is ? "Leikir og próf eftir vikum" : "Games & tests by week"}>
            <Table
              size={8}
              dense
              cols={[{ label: is ? "Vika" : "Week", width: 40 }, { label: is ? "Mánudagur" : "Monday", width: 58 }, { label: "× " + (is ? "leikur" : "match"), width: 48, align: "right" }, { label: is ? "Leikir" : "Games", flex: 1.2 }, { label: is ? "Próf" : "Tests", flex: 1 }]}
              rowTone={(i) => (weeks[i]?.target.taper ? "amber" : null)}
              rows={weeks.map((w, i) => {
                const games: string[] = [];
                for (const f of w.friendlies) games.push(`${is ? "Æfingaleikur" : "Friendly"} ${d(f)}`);
                if (p.opener && w.weekStart <= p.opener && p.opener < isoAdd(w.weekStart, 7)) games.push(`${is ? "Fyrsti deildarleikur" : "Opener"} ${d(p.opener)}`);
                if (w.assumedGame) games.push(`${is ? "Áætlaður leikur" : "Assumed game"} ${d(w.assumedGame.date)}`);
                if (w.noGameByCoach) games.push(is ? "Enginn leikur (þitt val)" : "No game (your choice)");
                return [
                  `${i + 1}${w.target.taper ? (is ? " létt" : " light") : ""}`,
                  d(w.weekStart),
                  w.target.multipleOfMatch != null ? fx(w.target.multipleOfMatch) : "-",
                  games.length ? tx(games.join(" · ")) : "-",
                  w.tests.length ? tx(w.tests.map(testName).join(", ")) : "-",
                ];
              })}
            />
          </Section>
        )}

        {prop.engine.cal.weeks.length > 0 && (
          <Section break title={is ? "Vikurnar dag fyrir dag" : "The weeks, day by day"} hint={is ? "Mán-Sun hverrar viku: dagsgerð, MD-dagur og áætlað álag. Dagar sem þú vistaðir í Vikuuppsetningu eru teknir með." : "Mon-Sun of every week: day type, MD day and the planned load. Days you saved in Week Setup are included."} mt={0}>
            <CalWeeks block={prop.engine.cal} lang={lang} />
          </Section>
        )}

        {prop.tests.length > 0 && (
          <Section title={is ? "Próf" : "Tests"}>
            <Table size={8} dense cols={[{ label: is ? "Próf" : "Test", flex: 1 }, { label: is ? "Vikur" : "Weeks", width: 90 }, { label: is ? "Heimild" : "Source", flex: 1 }]}
              rows={prop.tests.map((tt) => [bi(tt.name), tt.weeks.map((w) => `${is ? "V" : "W"}${w}`).join(", "), tx(tt.cite)])} />
          </Section>
        )}

        <DayDrillsSection rows={p.dayDrills} lang={lang} />

        {prop.choices.length > 0 && (
          <Section title={is ? "Þitt val og reglurnar" : "What you set and what the rules set"} hint={is ? "Hvert val í áætluninni: gildið, hver ákvað það og af hverju." : "Every choice in the plan: the value, who set it, and why."}>
            <Table
              size={7.75}
              cols={[{ label: is ? "Val" : "Choice", width: 96 }, { label: is ? "Gildi" : "Value", width: 92 }, { label: is ? "Hver" : "Who", width: 44 }, { label: is ? "Af hverju" : "Why", flex: 1 }]}
              rowTone={(i) => (prop.choices[i]?.source === "coach" ? "cobalt" : null)}
              rows={prop.choices.map((c) => [
                bi(c.label),
                bi(c.value),
                c.source === "coach" ? (is ? "Þú" : "You") : (is ? "Regla" : "Rule"),
                <Text key="r" style={[fb(400), { fontSize: 7.5, lineHeight: 1.35 }]}>{bi(c.reason)}{c.cite ? <Text style={{ color: C.mute }}>{` (${tx(c.cite)})`}</Text> : null}</Text>,
              ])}
            />
          </Section>
        )}

        <View>
          <Provenance>{tx(is
            ? "Allar tölur koma úr sömu tillögu og flipinn sýnir (Makró-dagsetningar, leikjaskrá, þínar stillingar og vistaðir dagar). Leikurinn er einingin: × leikur = vikuálag ÷ einn leikur liðsins. Vika 1 er stýrð endurkoma; hvar hver breyta byrjar er lína MicroPulse, ekki rannsóknartala. Heimildir: Clemente 2019c; Gualtieri 2023; Bosquet 2007; Mujika & Padilla 2003; Jeong 2011; Teixeira 2021; Harper 2022; Issurin 2010."
            : "Every number comes from the same proposal the tab shows (Macro dates, fixtures, your settings and saved days). The match is the unit: × a match = the week's load ÷ one team match. Week 1 is a controlled return; where each variable starts is a MicroPulse line, not a research number. Sources: Clemente 2019c; Gualtieri 2023; Bosquet 2007; Mujika & Padilla 2003; Jeong 2011; Teixeira 2021; Harper 2022; Issurin 2010.")}</Provenance>
        </View>
      </BrandPage>
    </Document>
  );
}

export async function downloadPeriodizationPreseasonPdf(payload: PeriodizationPreseasonPayload, lang: Lang) {
  const blob = await renderPdfBlob(() => <PreseasonDoc p={payload} lang={lang} />);
  saveBlob(blob, `${fileSafe(payload.teamName)}-pre-season-${payload.prop.window.start.slice(0, 4)}.pdf`);
}

/** Test / script hook: the document element (no download). */
export const preseasonPdfDocument = (payload: PeriodizationPreseasonPayload, lang: Lang) => <PreseasonDoc p={payload} lang={lang} />;
