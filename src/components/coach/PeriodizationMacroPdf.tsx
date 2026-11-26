"use client";

/**
 * PeriodizationMacroPdf — the Macro Cycle tab on its own: the season in one line, the plain facts, then the
 * phases, the blocks with their goal and deload / light week, the games, and the breaks, training camps and tests
 * the coach entered. Prints what the tab shows from the same data (no new rule).
 *
 * Descriptive planning — it never sets the readiness colour. Rules lay out the season; the coach decides.
 * Styling + download: shared MicroPulse PDF kit (src/components/pdf/brand.tsx).
 */

import { Document, Text, View } from "@react-pdf/renderer";
import type { BlockGoalKey, Bi } from "@/lib/micropulse/periodization/index";
import { MacroSection, shortDate, tx, type HubPhaseRow, type PeriodizationHubPayload } from "@/components/coach/PeriodizationHubPdf";
import { BrandPage, C, FactRow, Provenance, Section, Table, Verdict, fb, fileSafe, renderPdfBlob, saveBlob } from "@/components/pdf/brand";

type Lang = "EN" | "IS";

export type MacroPdfBlock = {
  index: number; phase: Bi; goalKey: BlockGoalKey; goalByCoach: boolean;
  /** start inclusive, end exclusive (the hub's block convention). */
  start: string; end: string; weeks: number;
  inSeason: boolean;
  /** Monday of the deload (pre-season) / light (in-season) week; null = none set. */
  deloadWeekStart: string | null;
  provisional?: boolean;
};

export type PeriodizationMacroPayload = {
  teamName: string; seasonYear: number; generatedAt?: string;
  tier: PeriodizationHubPayload["tier"];
  phases: HubPhaseRow[];
  congested: PeriodizationHubPayload["congested"];
  /** The first league game (ends pre-season) — null when none is known. */
  firstLeagueGame: string | null;
  /** The opener is estimated from last season (no fixtures entered yet). */
  fixturesEstimated: boolean;
  blocks: MacroPdfBlock[];
  fixtures: Array<{ date: string; opponent: string | null; competition: string | null; isFriendly: boolean }>;
  breaks: Array<{ start: string; end: string; label: string | null }>;
  camps: Array<{ start: string; end: string; label: string | null; loadPct: number; twoADay: boolean }>;
  tests: Array<{ date: string; name: Bi }>;
};

const GOAL: Record<BlockGoalKey, Bi> = {
  accum: { en: "Accumulation", is: "Uppsöfnun" },
  transmute: { en: "Transmutation", is: "Umbreyting" },
  realize: { en: "Realization", is: "Framkvæmd" },
  deload: { en: "Deload", is: "Niðurtröppun" },
};
const GOAL_ROLE: Record<BlockGoalKey, Bi> = {
  accum: { en: "build the base", is: "byggja grunninn" },
  transmute: { en: "sharpen to football", is: "sérhæfa í fótbolta" },
  realize: { en: "peak for matches", is: "toppa fyrir leiki" },
  deload: { en: "recover", is: "endurheimt" },
};
const isoAdd = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

function MacroDoc({ p, lang }: { p: PeriodizationMacroPayload; lang: Lang }) {
  const is = lang === "IS";
  const bi = (b: Bi) => tx(is ? b.is : b.en);
  const d = (iso: string) => shortDate(iso, lang);
  const seasonWeeks = p.phases.reduce((a, ph) => a + ph.weeks, 0);
  const league = p.fixtures.filter((f) => !f.isFriendly);
  const friendlies = p.fixtures.filter((f) => f.isFriendly);
  const coachGoals = p.blocks.filter((b) => b.goalByCoach).length;

  // Layer 0 — a rule-built line from the same rows printed below.
  const opener = p.firstLeagueGame
    ? (p.fixturesEstimated
      ? (is ? ` Fyrsti deildarleikur áætlaður ${d(p.firstLeagueGame).replace(/\.$/, "")}.` : ` First league game estimated ${d(p.firstLeagueGame)}.`)
      : (is ? ` Fyrsti deildarleikur ${d(p.firstLeagueGame).replace(/\.$/, "")}.` : ` First league game ${d(p.firstLeagueGame)}.`))
    : (is ? " Fyrsti deildarleikur ekki skráður." : " First league game not entered.");
  const headline = p.phases.length
    ? (is ? `Tímabilið ${p.seasonYear}: ${p.phases.length} fasar á ${seasonWeeks} vikum.${opener}` : `Season ${p.seasonYear}: ${p.phases.length} phases over ${seasonWeeks} weeks.${opener}`)
    : (is ? `Ekkert tímabil skráð fyrir ${p.seasonYear} enn.` : `No season set up for ${p.seasonYear} yet.`);
  const order = p.blocks.map((b) => bi(GOAL[b.goalKey])).filter((g, i, a) => i === 0 || a[i - 1] !== g).join(" -> ");
  const body = [
    p.phases.length ? `${p.phases.map((ph) => `${bi(ph.label)} (${ph.weeks}${is ? "v" : "w"})`).join(" · ")}.` : "",
    p.blocks.length ? (is ? `${p.blocks.length} lotur: ${order}.` : `${p.blocks.length} blocks: ${order}.`) : "",
    is ? "Undirbúningslotur enda á niðurtröppunarviku; á keppnistímabili er létt vika val þjálfarans." : "Pre-season blocks end in a deload week; in-season a light week is the coach's call.",
  ].filter(Boolean).join(" ");

  const deloadCell = (b: MacroPdfBlock) => {
    if (b.deloadWeekStart) return `${b.inSeason ? (is ? "Létt vika" : "Light week") : (is ? "Niðurtröppun" : "Deload")} ${d(b.deloadWeekStart)}`;
    return b.inSeason ? (is ? "Engin föst" : "None set") : "-";
  };

  return (
    <Document>
      <BrandPage
        doc={is ? "Makró-lota" : "Macro cycle"}
        context={p.teamName}
        kicker={is ? "Tímabilsskipulag · Makró" : "Periodization · Macro"}
        title={`${p.teamName} - ${is ? "tímabilið" : "the season"} ${p.seasonYear}`}
        subtitle={`${is ? "Unnið fyrir þjálfarateymið · MicroPulse" : "Prepared for the coaching staff · MicroPulse"}${p.generatedAt ? ` · ${p.generatedAt.slice(0, 10)}` : ""}`}
        chips={[{ text: String(p.seasonYear) }, ...(p.fixturesEstimated ? [{ text: is ? "Leikjaskrá áætluð" : "Fixtures estimated", tone: "amber" as const }] : [])]}
        note={is ? "Lýsandi áætlun - setur aldrei readiness-litinn. Reglurnar leggja upp tímabilið; þjálfarinn ákveður." : "Descriptive planning - never sets the readiness colour. The rules lay out the season; the coach decides."}
      >
        <Verdict tone="neutral" label={is ? "Úr tímabilsrammanum og leikjaskránni" : "From the season frame and the fixtures"} headline={tx(headline)} body={tx(body)} />
        <FactRow
          facts={[
            { value: String(p.phases.length), label: is ? "Fasar" : "Phases", sub: `${seasonWeeks} ${is ? "vikur" : "weeks"}` },
            { value: String(league.length), label: is ? "Deildarleikir" : "League games", sub: `${friendlies.length} ${is ? "æfingaleikir" : friendlies.length === 1 ? "friendly" : "friendlies"}${p.fixturesEstimated ? (is ? " · áætlað" : " · estimated") : ""}` },
            { value: String(p.congested.length), label: is ? "Þéttar vikur" : "Congested weeks", sub: is ? "2+ leikir í viku" : "2+ games in a week", tone: p.congested.length ? "amber" : undefined },
            { value: String(p.blocks.length), label: is ? "Lotur" : "Blocks", sub: coachGoals ? (is ? `${coachGoals} markmið valin af þér` : `${coachGoals} goal${coachGoals === 1 ? "" : "s"} set by you`) : (is ? "markmið eftir röðinni" : "goals follow the order") },
          ]}
        />

        <MacroSection tier={p.tier} phases={p.phases} congested={p.congested} lang={lang} title={is ? "Fasar tímabilsins" : "Season phases"} />

        {p.blocks.length > 0 && (
          <Section title={is ? "Lotur" : "Blocks"} hint={is ? "Hver lota með markmiði og dagsetningum. „Þitt val“ = markmið sem þú valdir; annars fylgir lotan röðinni Uppsöfnun -> Umbreyting -> Framkvæmd (Issurin 2010)." : "Each block with its goal and dates. \"Your choice\" = a goal you picked; otherwise the block follows the order Accumulation -> Transmutation -> Realization (Issurin 2010)."}>
            <Table
              size={8}
              cols={[{ label: "#", width: 20 }, { label: is ? "Markmið" : "Goal", flex: 1.4 }, { label: is ? "Fasi" : "Phase", flex: 1 }, { label: is ? "Dagsetningar" : "Dates", width: 92 }, { label: is ? "Vikur" : "Weeks", width: 34, align: "right" }, { label: is ? "Niðurtröppun / létt" : "Deload / light", width: 98 }]}
              rowTone={(i) => (p.blocks[i]?.goalByCoach ? "cobalt" : null)}
              rows={p.blocks.map((b) => [
                String(b.index + 1),
                <View key="g">
                  <Text style={[fb(600), { fontSize: 8 }]}>{bi(GOAL[b.goalKey])}{b.goalByCoach ? <Text style={[fb(600), { color: C.cobalt }]}>{is ? "  · þitt val" : "  · your choice"}</Text> : null}</Text>
                  <Text style={[fb(400), { fontSize: 7, color: C.mute }]}>{bi(GOAL_ROLE[b.goalKey])}{b.provisional ? (is ? " · leikir ekki skráðir" : " · games not entered") : ""}</Text>
                </View>,
                bi(b.phase),
                `${d(b.start)}–${d(isoAdd(b.end, -1))}`,
                String(b.weeks),
                deloadCell(b),
              ])}
            />
          </Section>
        )}

        <Section title={is ? "Leikir" : "Games"} hint={p.fixtures.length ? undefined : (is ? "Engir leikir skráðir enn - bættu þeim við í Makró-flipanum." : "No games entered yet - add them in the Macro tab.")}>
          {p.fixtures.length > 0 && (
            <Table
              size={8}
              dense
              cols={[{ label: is ? "Dags." : "Date", width: 62 }, { label: is ? "Mótherji" : "Opponent", flex: 1.3 }, { label: is ? "Tegund" : "Type", width: 70 }, { label: is ? "Keppni" : "Competition", flex: 1 }]}
              rowTone={(i) => (p.fixtures[i]?.date === p.firstLeagueGame ? "green" : null)}
              rows={p.fixtures.map((f) => [
                d(f.date),
                f.opponent ? tx(f.opponent) : "-",
                f.isFriendly ? (is ? "Æfingaleikur" : "Friendly") : (is ? "Deildarleikur" : "League"),
                tx(`${f.competition ?? ""}${f.date === p.firstLeagueGame ? (is ? " (fyrsti deildarleikur)" : " (first league game)") : ""}`) || "-",
              ])}
            />
          )}
        </Section>

        {p.breaks.length > 0 && (
          <Section title={is ? "Hlé" : "Breaks"}>
            <Table size={8} dense cols={[{ label: is ? "Frá" : "From", width: 70 }, { label: is ? "Til" : "To", width: 70 }, { label: is ? "Heiti" : "Name", flex: 1 }]}
              rows={p.breaks.map((b) => [d(b.start), d(b.end), b.label ? tx(b.label) : "-"])} />
          </Section>
        )}

        {p.camps.length > 0 && (
          <Section title={is ? "Æfingabúðir" : "Training camps"}>
            <Table size={8} dense cols={[{ label: is ? "Frá" : "From", width: 70 }, { label: is ? "Til" : "To", width: 70 }, { label: is ? "Heiti" : "Name", flex: 1 }, { label: is ? "Álag" : "Load", width: 50, align: "right" }, { label: is ? "Tvær á dag" : "Two a day", width: 60 }]}
              rows={p.camps.map((c) => [d(c.start), d(c.end), c.label ? tx(c.label) : "-", `${c.loadPct}%`, c.twoADay ? (is ? "Já" : "Yes") : (is ? "Nei" : "No")])} />
          </Section>
        )}

        {p.tests.length > 0 && (
          <Section title={is ? "Skráð próf" : "Scheduled tests"}>
            <Table size={8} dense cols={[{ label: is ? "Dags." : "Date", width: 70 }, { label: is ? "Próf" : "Test", flex: 1 }]}
              rows={p.tests.map((s) => [d(s.date), bi(s.name)])} />
          </Section>
        )}

        <Provenance>{tx(is
          ? "Fasarnir koma úr tímabilsrammanum (undirbúningur hefst, fyrsti deildarleikur, tímabilslok, off-season) og leikjaskránni; lotulengdin og markmið hverrar lotu eru þín. Undirbúningslota endar á niðurtröppunarviku; á keppnistímabili er engin föst - lítill munur milli lota á keppnistímabili (Malone 2015), létt vika ~20% lækkun (Fessi 2016). Loturöð: Issurin 2010."
          : "Phases come from the season frame (pre-season start, first league game, season end, off-season) and the fixture list; the block length and each block's goal are yours. A pre-season block ends in a deload week; in-season none is fixed - little between-block change in-season (Malone 2015), a light week ~20% cut (Fessi 2016). Block order: Issurin 2010.")}</Provenance>
      </BrandPage>
    </Document>
  );
}

export async function downloadPeriodizationMacroPdf(payload: PeriodizationMacroPayload, lang: Lang) {
  const blob = await renderPdfBlob(() => <MacroDoc p={payload} lang={lang} />);
  saveBlob(blob, `${fileSafe(payload.teamName)}-macro-${payload.seasonYear}.pdf`);
}

/** Test / script hook: the document element (no download). */
export const macroPdfDocument = (payload: PeriodizationMacroPayload, lang: Lang) => <MacroDoc p={payload} lang={lang} />;
