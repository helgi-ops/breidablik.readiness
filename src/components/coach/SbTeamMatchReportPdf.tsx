"use client";

/**
 * SbTeamMatchReportPdf — a standalone, readable PDF of the StatsBomb "Team match stats" report for
 * one game, downloaded straight from the Team match stats box. Same layered read as on screen:
 * score masthead → the rule-based glance verdict + plain facts → the AI read (labelled AI) → the
 * grouped stat sections (Attack / Build-up / Pressing / On-ball), each metric you-vs-opponent with
 * the season average as context, estimates marked. Styled with the shared MicroPulse PDF kit
 * (src/components/pdf/brand.tsx). Descriptive context — never touches the readiness colour, load,
 * or the daily decision.
 */

import { Document } from "@react-pdf/renderer";
import { fmtVal, type SbTeamMatchReport } from "@/lib/micropulse/matchReport/sbTeamMatchReport";
import { AiBox, BrandPage, Bullets, Card, Provenance, Section, Table, Verdict, renderPdfBlob, saveBlob } from "@/components/pdf/brand";

type Lang = "EN" | "IS";

const L = {
  EN: { kicker: "Team match stats", doc: "Team match stats", prepared: "Prepared for the coaching staff · MicroPulse · StatsBomb",
    glance: "At a glance", facts: "Why", theRead: "THE READ - WRITTEN FROM THE NUMBERS BELOW, DECIDES NOTHING",
    you: "You", vsOpp: "Opp / avg", metric: "Metric", est: " (est.)", coverage: (p: number, t: number) => `${p} of ${t} metrics reported`,
    detail: "The numbers", detailHint: "Each metric for you vs the opponent. Where there is no opponent figure, ~ shows your season average for context.",
    method: "How to read it",
    foot: "Descriptive context only — it never changes the readiness colour, load, or the daily decision. Figures are StatsBomb team match stats for this single game; the opponent column is the opposing side, and where no opponent figure exists the tilde value is your season average for context. Estimates (Possession %, PPDA) are derived, not StatsBomb-reported. OBV = On-Ball Value. Rules compute — not AI.",
    note: "Descriptive context only. Rules compute the figures; AI only explains." },
  IS: { kicker: "Liðs-tölfræði", doc: "Liðs-tölfræði", prepared: "Unnið fyrir þjálfarateymið · MicroPulse · StatsBomb",
    glance: "Í hnotskurn", facts: "Af hverju", theRead: "LESTURINN - SKRIFAÐUR ÚR TÖLUNUM AÐ NEÐAN, ÁKVEÐUR EKKERT",
    you: "Þú", vsOpp: "Andst. / með.", metric: "Mælikvarði", est: " (áætl.)", coverage: (p: number, t: number) => `${p} af ${t} mælikvörðum til staðar`,
    detail: "Tölurnar", detailHint: "Hver mælikvarði fyrir ykkur vs andstæðinginn. Þar sem engin andstæðings-tala er til sýnir ~ tímabils-meðaltal ykkar til viðmiðunar.",
    method: "Hvernig á að lesa",
    foot: "Aðeins lýsandi samhengi — breytir aldrei readiness-litnum, álagi né daglegu ákvörðuninni. Tölur eru StatsBomb liðs-leikjatölur fyrir þennan eina leik; andstæðings-dálkurinn er hitt liðið, og þar sem engin andstæðings-tala er til er tilde-gildið tímabils-meðaltal þitt til viðmiðunar. Áætlanir (Boltahlutfall %, PPDA) eru reiknaðar, ekki beinar StatsBomb-tölur. OBV = On-Ball Value. Reglur reikna — ekki AI.",
    note: "Aðeins lýsandi samhengi. Reglur reikna tölurnar; AI útskýrir eingöngu." },
} as const;

function titleLine(r: SbTeamMatchReport, teamName: string): string {
  const opp = r.opponent ?? "Opponent";
  if (r.goals == null || r.goalsAgainst == null) return r.isHome === false ? `${opp} v ${teamName}` : `${teamName} v ${opp}`;
  return r.isHome === false ? `${opp} ${r.goalsAgainst}-${r.goals} ${teamName}` : `${teamName} ${r.goals}-${r.goalsAgainst} ${opp}`;
}

export function Doc({ report, teamName, lang, narrative }: { report: SbTeamMatchReport; teamName: string; lang: Lang; narrative?: string | null }) {
  const t = L[lang];
  const isIS = lang === "IS";
  const sub = [report.matchDate, report.isHome != null ? (report.isHome ? (isIS ? "heima" : "home") : (isIS ? "úti" : "away")) : null].filter(Boolean).join(" · ");
  const cov = report.coverage;
  return (
    <Document>
      <BrandPage
        doc={t.doc}
        context={teamName}
        kicker={t.kicker}
        title={titleLine(report, teamName)}
        subtitle={[sub, t.prepared].filter(Boolean).join("  ·  ")}
        chips={[{ text: "StatsBomb" }]}
        note={t.note}
      >
        <Verdict
          label={t.glance}
          headline={isIS ? report.headline.is : report.headline.en}
          confidence={cov && cov.total ? t.coverage(cov.present, cov.total) : undefined}
        />
        {report.facts.length ? (
          <Card style={{ marginBottom: 10 }}>
            <Bullets items={report.facts.map((f) => (isIS ? f.is : f.en))} size={9.25} />
          </Card>
        ) : null}

        {narrative && narrative.trim() ? <AiBox label={t.theRead} body={narrative.trim()} /> : null}

        <Section title={t.detail} hint={t.detailHint} mt={6}>
          {report.sections.map((sec) => {
            const rows = sec.metrics.filter((m) => m.own != null);
            if (!rows.length) return null;
            return (
              <Section key={sec.group} title={isIS ? sec.title.is : sec.title.en} mt={2} wrap={rows.length > 10}>
                <Table
                  cols={[{ label: t.metric, flex: 1 }, { label: t.you, width: 70, align: "right", strong: true }, { label: t.vsOpp, width: 80, align: "right" }]}
                  rows={rows.map((m) => [
                    (isIS ? m.label.is : m.label.en) + (m.estimated ? t.est : ""),
                    fmtVal(m.own, m.format),
                    m.opp != null ? fmtVal(m.opp, m.format) : (m.seasonAvg != null ? `~${fmtVal(m.seasonAvg, m.format)}` : ""),
                  ])}
                  dense
                />
              </Section>
            );
          })}
        </Section>

        <Section title={t.method} mt={2} wrap={false}>
          <Provenance>{t.foot}</Provenance>
        </Section>
      </BrandPage>
    </Document>
  );
}

export async function downloadSbTeamMatchReportPdf(report: SbTeamMatchReport, teamName: string, lang: Lang, narrative?: string | null) {
  const blob = await renderPdfBlob(() => <Doc report={report} teamName={teamName} lang={lang} narrative={narrative} />);
  const oppSlug = (report.opponent ?? "opponent").replace(/\s+/g, "-");
  saveBlob(blob, `team-match-stats-${oppSlug}-${report.matchDate}.pdf`);
}
