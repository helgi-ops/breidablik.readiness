"use client";

/**
 * MatchAnalysisPdf — the article-quality single-match analysis (PDF), the per-match
 * analog of TeamSeasonArticlePdf.
 *
 * Layered read: score masthead → THE READ (AI, labelled) → 2-3 plain rule-computed
 * facts (goals / xG / shots / possession) → the sectioned prose (possession, chance
 * quality, OBV, set pieces, keeping/finishing/pressing, what it tells us) → the "game in
 * numbers" table → confidence + method + sources. Numbers are rule-computed from
 * StatsBomb team + per-player match stats; the prose is AI-written from those numbers and
 * labelled AI. Descriptive context — it never touches the readiness colour, load, or the
 * daily decision. Styled with the shared MicroPulse PDF kit (src/components/pdf/brand.tsx).
 */

import { Document } from "@react-pdf/renderer";
import type { NumbersRow, SeasonContext } from "@/lib/micropulse/matchReview";
import { AiBox, BrandPage, Body, Card, FactRow, KeyValues, Label, Provenance, Section, Table, renderPdfBlob, saveBlob, C } from "@/components/pdf/brand";

type Lang = "EN" | "IS";

export type MatchAnalysisProse = {
  theRead?: string; theReadBody?: string; possession?: string; chanceQuality?: string;
  obv?: string; setPieces?: string; keepingFinishingPressing?: string; whatItTells?: string;
};

export type MatchAnalysisPdfPayload = {
  teamName: string;
  opponent: string | null;
  homeAway: string | null;      // "home" | "away" for the coach's team
  competition: string | null;
  date: string;
  venue: string | null;
  score: string | null;         // own–against (e.g. "0-1")
  ownGoals: number | null;
  oppGoals: number | null;
  gameInNumbers: NumbersRow[];
  seasonContext: SeasonContext | null;
  confidence: { level: string; note: string };
  prose: MatchAnalysisProse | null;
  aiGenerated: boolean;
};

const L = {
  EN: { kicker: "Match analysis", doc: "Match analysis", prepared: "Prepared for the coaching staff · MicroPulse",
    ai: "THE READ - AI-WRITTEN FROM THE NUMBERS, DECIDES NOTHING",
    aiCites: "Cites: StatsBomb team + per-player match stats for this game (the game-in-numbers table).",
    keyFacts: "Key facts", analysis: "The analysis", analysisHint: "AI-written from the numbers in this report - read it as context, not a decision.",
    numbers: "The game in numbers", metric: "Per match", confidence: "Confidence", confShort: "Confidence",
    sourceHead: "Source and method", level: "Level",
    sections: { possession: "Possession & passing", chanceQuality: "xG & chance quality", obv: "OBV — the value of actions",
      setPieces: "Set pieces", keepingFinishingPressing: "Keeping, finishing & pressing", whatItTells: "What it tells us" },
    method: "Descriptive context only — it never changes the readiness colour, load, or the daily decision. Figures are StatsBomb per-match team + player stats for this single game; xG and OBV are models with uncertainty and describe what happened, they do not predict. One match is a snapshot, not a pattern.",
    signals: "Signals: StatsBomb IQ Match Stats (team) + per-player match stats for this game. Rules compute the figures; the read is AI-phrased and coach-overridable.",
    note: "Descriptive context only. Rules compute the figures; the read is AI-phrased and coach-overridable." },
  IS: { kicker: "Leikgreining", doc: "Leikgreining", prepared: "Unnið fyrir þjálfarateymið · MicroPulse",
    ai: "LESTURINN - AI SKRIFAÐI ÚR TÖLUNUM, ÁKVEÐUR EKKERT",
    aiCites: "Vitnar í: StatsBomb liðs- + leikmannatölur fyrir þennan leik (taflan „Leikurinn í tölum“).",
    keyFacts: "Lykilatriði", analysis: "Greiningin", analysisHint: "AI skrifaði úr tölunum í skýrslunni - lesið sem samhengi, ekki ákvörðun.",
    numbers: "Leikurinn í tölum", metric: "Á leik", confidence: "Áreiðanleiki", confShort: "Áreiðanleiki",
    sourceHead: "Uppruni og aðferð", level: "Stig",
    sections: { possession: "Boltahald & sendingar", chanceQuality: "xG & gæði færa", obv: "OBV — virði aðgerða",
      setPieces: "Fastir leikir", keepingFinishingPressing: "Markvarsla, klárun & pressa", whatItTells: "Hvað segir þetta okkur" },
    method: "Aðeins lýsandi samhengi — breytir aldrei readiness-litnum, álagi né daglegu ákvörðuninni. Tölur eru StatsBomb per-leik liðs- + leikmannatölur fyrir þennan eina leik; xG og OBV eru líkön með óvissu og lýsa því sem gerðist, þau spá ekki. Einn leikur er svipmynd, ekki mynstur.",
    signals: "Uppspretta: StatsBomb IQ Match Stats (lið) + per-leikmanns leikjatölur fyrir þennan leik. Reglur reikna tölurnar; lesturinn er AI-orðaður og þjálfari getur hnekkt.",
    note: "Aðeins lýsandi samhengi. Reglur reikna tölurnar; lesturinn er AI-orðaður og þjálfari getur hnekkt." },
} as const;

const ROW_LABELS: Record<string, { en: string; is: string }> = {
  goals: { en: "Goals", is: "Mörk" },
  xg: { en: "xG", is: "xG" },
  openPlayXg: { en: "Open-play xG", is: "xG úr opnum leik" },
  shots: { en: "Shots", is: "Skot" },
  possession: { en: "Possession %", is: "Boltahald %" },
  passing: { en: "Passing %", is: "Sendingar %" },
  obv: { en: "OBV (value of actions)", is: "OBV (virði aðgerða)" },
  boxTouches: { en: "Touches in box", is: "Snertingar í teig" },
  setPieceXg: { en: "Set-piece xG", is: "xG úr föstum leik" },
  biggestChance: { en: "Biggest chance (xG)", is: "Stærsta færi (xG)" },
};

const CONF_LABEL: Record<string, { en: string; is: string }> = {
  "medium-high": { en: "medium-high", is: "miðlungs-hátt" }, high: { en: "high", is: "hátt" },
  medium: { en: "medium", is: "miðlungs" }, low: { en: "low", is: "lágt" },
};

const fmt = (v: number | null, decimals: number): string => (v == null ? "—" : v.toFixed(decimals));

/** Home team on the left of the scoreline. Coach's team may be home or away. */
function titleLine(p: MatchAnalysisPdfPayload): string {
  const opp = p.opponent ?? "Opponent";
  if (p.score == null || p.ownGoals == null || p.oppGoals == null) {
    return p.homeAway === "away" ? `${opp} v ${p.teamName}` : `${p.teamName} v ${opp}`;
  }
  return p.homeAway === "away"
    ? `${opp} ${p.oppGoals}-${p.ownGoals} ${p.teamName}`
    : `${p.teamName} ${p.ownGoals}-${p.oppGoals} ${opp}`;
}

export function Doc({ payload, lang }: { payload: MatchAnalysisPdfPayload; lang: Lang }) {
  const t = L[lang];
  const isIS = lang === "IS";
  const pr = payload.prose;
  // Prefer a row's inline localized label (source-specific rows, e.g. Wyscout metrics),
  // else the static map, else the key.
  const rowLabel = (r: NumbersRow) =>
    (isIS && r.labelIs) ? r.labelIs : (ROW_LABELS[r.key] ? ROW_LABELS[r.key][isIS ? "is" : "en"] : r.label);
  const sub = [payload.competition, payload.date, payload.venue].filter(Boolean).join(" · ");
  const conf = CONF_LABEL[payload.confidence.level] ?? CONF_LABEL.low;
  const confWord = isIS ? conf.is : conf.en;
  // Confidence is a data-quality read, not a status - neutral outline chip, word always printed.
  const sections: Array<[keyof typeof t.sections, string | undefined]> = [
    ["possession", pr?.possession], ["chanceQuality", pr?.chanceQuality], ["obv", pr?.obv],
    ["setPieces", pr?.setPieces], ["keepingFinishingPressing", pr?.keepingFinishingPressing], ["whatItTells", pr?.whatItTells],
  ];
  // Layer 1 — up to three plain, rule-computed facts straight from the numbers table.
  const pick = (k: string) => payload.gameInNumbers.find((r) => r.key === k);
  const facts = ["goals", "xg", "shots", "possession"]
    .map(pick)
    .filter((r): r is NumbersRow => !!r && r.own != null)
    .slice(0, 3)
    .map((r) => ({ value: r.opp != null ? `${fmt(r.own, r.decimals)} - ${fmt(r.opp, r.decimals)}` : fmt(r.own, r.decimals), label: rowLabel(r), sub: `${payload.teamName} - ${payload.opponent ?? "Opp"}` }));

  return (
    <Document>
      <BrandPage
        doc={t.doc}
        context={payload.teamName}
        kicker={t.kicker}
        title={titleLine(payload)}
        subtitle={sub || undefined}
        chips={[...(payload.aiGenerated ? [{ text: "AI", tone: "cobalt" as const }] : []), { text: `${t.confShort}: ${confWord}` }]}
        note={t.note}
      >
        {pr?.theRead ? <AiBox label={t.ai} headline={pr.theRead} body={pr.theReadBody} cites={t.aiCites} /> : null}

        {facts.length ? (
          <Section title={t.keyFacts} mt={0}>
            <FactRow facts={facts} />
          </Section>
        ) : null}

        {sections.some(([, b]) => b) ? (
          <Section title={t.analysis} hint={payload.aiGenerated ? t.analysisHint : undefined}>
            {sections.map(([key, body]) => (body ? (
              <ProseCard key={key} title={t.sections[key]} body={body} />
            ) : null))}
          </Section>
        ) : null}

        {payload.gameInNumbers.length ? (
          <Section title={t.numbers} wrap={false}>
            <Table
              cols={[{ label: t.metric, flex: 1 }, { label: payload.teamName, width: 90, align: "right", strong: true }, { label: payload.opponent ?? "Opp", width: 90, align: "right" }]}
              rows={payload.gameInNumbers.map((r) => [rowLabel(r), fmt(r.own, r.decimals), fmt(r.opp, r.decimals)])}
              dense
            />
          </Section>
        ) : null}

        <Section title={t.sourceHead} wrap={false}>
          <Card>
            <KeyValues rows={[[t.confidence, confWord]]} />
            <Body size={8.5} mt={4}>{payload.confidence.note}</Body>
            <Provenance>{t.method}</Provenance>
            <Provenance>{t.signals}</Provenance>
            <Provenance>{t.prepared}</Provenance>
          </Card>
        </Section>
      </BrandPage>
    </Document>
  );
}

/** One prose section: a small heading and the paragraph, kept together. */
function ProseCard({ title, body }: { title: string; body: string }) {
  return (
    <Card style={{ marginBottom: 6 }} pad={10}>
      <Label color={C.cobalt}>{title}</Label>
      <Body mt={2}>{body}</Body>
    </Card>
  );
}

export async function downloadMatchAnalysisPdf(payload: MatchAnalysisPdfPayload, lang: Lang) {
  const blob = await renderPdfBlob(() => <Doc payload={payload} lang={lang} />);
  const oppSlug = (payload.opponent ?? "opponent").replace(/\s+/g, "-");
  saveBlob(blob, `match-${oppSlug}-${payload.date}-analysis.pdf`);
}
