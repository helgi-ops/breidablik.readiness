"use client";

/**
 * MatchReportReadPdf — the AI match-report briefing as a downloadable PDF. Same layered
 * read as the on-screen card, explainability-first: the AI headline + overview (labelled
 * AI) → the key stat highlights as plain facts → went well / to improve → key moments →
 * how it flowed → key players → tactical + opponent → remaining stats.
 * Everything here is AI-read from the uploaded report: it is labelled AS AI, cites the
 * source report, and is descriptive — never touches readiness.
 * Styled with the shared MicroPulse PDF kit (src/components/pdf/brand.tsx).
 */

import { Document, Text, View } from "@react-pdf/renderer";
import { AiBox, BrandPage, Body, Bullets, C, Card, Cols, FactRow, KeyValues, Label, Provenance, Section, TONE, clean, fb, renderPdfBlob, saveBlob } from "@/components/pdf/brand";

type Lang = "EN" | "IS";

export type MatchReportRead = {
  headline?: string; score?: string; competition?: string; summary?: string; phases?: string;
  keyMoments?: string[]; statHighlights?: Array<{ label: string; value: string }>;
  wentWell?: string[]; toImprove?: string[]; keyPlayers?: Array<{ name: string; note: string }>;
  tactical?: string; opponent?: string;
};

const T = {
  EN: { kicker: "AI - read from your uploaded match report", doc: "Match report briefing", title: "Match report", aiLabel: "OVERVIEW - READ FROM YOUR UPLOADED REPORT, DECIDES NOTHING",
    cites: "Source", flow: "How it flowed", moments: "Key moments", stats: "Stat highlights", moreStats: "More stats", well: "What went well", improve: "To improve", players: "Key players", tactical: "Tactical & subs", opp: "The opponent",
    foot: "AI-generated from the uploaded match report. Descriptive context - it does not decide anything and never changes a readiness verdict." },
  IS: { kicker: "AI - lesið úr uppsettu skýrslunni þinni", doc: "Leikskýrsla", title: "Leikskýrsla", aiLabel: "YFIRLIT - LESIÐ ÚR UPPSETTU SKÝRSLUNNI, ÁKVEÐUR EKKERT",
    cites: "Heimild", flow: "Hvernig leikurinn flæddi", moments: "Lykilaugnablik", stats: "Tölfræði-hápunktar", moreStats: "Fleiri tölur", well: "Það sem gekk vel", improve: "Til að bæta", players: "Lykilleikmenn", tactical: "Taktík & skiptingar", opp: "Andstæðingurinn",
    foot: "AI-samantekt úr uppsettu leikskýrslunni. Lýsandi samhengi - ákveður ekkert og breytir aldrei readiness-dómi." },
} as const;

function Doc({ read, source, lang }: { read: MatchReportRead; source: string | null; lang: Lang }) {
  const t = T[lang];
  const stats = read.statHighlights ?? [];
  const top = stats.slice(0, 3);
  const rest = stats.slice(3);
  const sub = clean(read.competition ?? "");
  return (
    <Document>
      <BrandPage doc={t.doc} context={read.competition} kicker={t.kicker} title={read.score || t.title} subtitle={sub} chips={[{ text: "AI", tone: "cobalt" }]} note={t.foot}>
        {read.headline || read.summary ? (
          <AiBox label={t.aiLabel} headline={read.headline} body={read.summary} cites={source ? `${t.cites}: ${source}` : undefined} />
        ) : null}

        {top.length ? (
          <Section title={t.stats} mt={0}>
            <FactRow facts={top.map((s2) => ({ value: s2.value, label: s2.label }))} />
          </Section>
        ) : null}

        {(read.wentWell?.length || read.toImprove?.length) ? (
          <Cols>
            <Card style={{ borderTopWidth: 3, borderTopColor: TONE.green.fill }}>
              <Label color={TONE.green.text}>{t.well}</Label>
              <View style={{ marginTop: 3 }}><Bullets items={read.wentWell ?? []} tone="green" /></View>
            </Card>
            <Card style={{ borderTopWidth: 3, borderTopColor: TONE.red.fill }}>
              <Label color={TONE.red.text}>{t.improve}</Label>
              <View style={{ marginTop: 3 }}><Bullets items={read.toImprove ?? []} tone="red" /></View>
            </Card>
          </Cols>
        ) : null}

        {read.keyMoments && read.keyMoments.length ? (
          <Section title={t.moments} mt={10}><Card wrap><Bullets items={read.keyMoments} split /></Card></Section>
        ) : null}

        {read.phases ? <Section title={t.flow}><Body>{read.phases}</Body></Section> : null}

        {read.keyPlayers && read.keyPlayers.length ? (
          <Section title={t.players} wrap={read.keyPlayers.length > 6}>
            <Card wrap={read.keyPlayers.length > 6}>
              {read.keyPlayers.map((p, i) => (
                <View key={i} wrap={false} style={{ paddingVertical: 4, borderBottomWidth: i < read.keyPlayers!.length - 1 ? 1 : 0, borderBottomColor: C.hair }}>
                  <Text style={[fb(600), { fontSize: 9.25 }]}>{clean(p.name)}</Text>
                  {p.note ? <Text style={[fb(400), { fontSize: 8.5, color: C.mute, marginTop: 1, lineHeight: 1.4 }]}>{clean(p.note)}</Text> : null}
                </View>
              ))}
            </Card>
          </Section>
        ) : null}

        {read.tactical || read.opponent ? (
          <Cols>
            {read.tactical ? <Section title={t.tactical}><Body>{read.tactical}</Body></Section> : null}
            {read.opponent ? <Section title={t.opp}><Body>{read.opponent}</Body></Section> : null}
          </Cols>
        ) : null}

        {rest.length ? (
          <Section title={t.moreStats} wrap={false}>
            <Card><KeyValues rows={rest.map((s2) => [s2.label, s2.value] as [string, string])} /></Card>
          </Section>
        ) : null}
        {source && !(read.headline || read.summary) ? <Provenance>{`${t.cites}: ${source}`}</Provenance> : null}
      </BrandPage>
    </Document>
  );
}

export async function downloadMatchReportReadPdf(read: MatchReportRead, source: string | null, lang: Lang) {
  const blob = await renderPdfBlob(() => <Doc read={read} source={source} lang={lang} />);
  const base = clean(read.score || "match-report").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "") || "match-report";
  saveBlob(blob, `${base}-briefing.pdf`);
}
