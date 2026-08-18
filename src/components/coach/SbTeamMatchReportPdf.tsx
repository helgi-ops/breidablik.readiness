"use client";

/**
 * SbTeamMatchReportPdf — a standalone, readable PDF of the StatsBomb "Team match stats" report for
 * one game, downloaded straight from the Team match stats box. Same layered read as on screen:
 * score header → the glance verdict + plain facts → the grouped stat sections (Attack / Build-up /
 * Pressing / On-ball), each metric you-vs-opponent with the season average as context, estimates
 * marked. WinAnsi/Helvetica (Icelandic-safe): ASCII hyphen for the score, no arrows/ticks.
 * Descriptive context — never touches the readiness colour, load, or the daily decision.
 */

import { Document, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import { fmtVal, type SbTeamMatchReport } from "@/lib/micropulse/matchReport/sbTeamMatchReport";

type Lang = "EN" | "IS";

const INK = "#14181c", MUTE = "#6b7280", LINE = "#e5e7eb", COBALT = "#2740e6";

const s = StyleSheet.create({
  page: { paddingTop: 26, paddingBottom: 34, paddingHorizontal: 34, fontSize: 9.5, fontFamily: "Helvetica", color: INK, lineHeight: 1.4 },
  kicker: { fontSize: 8, color: COBALT, fontFamily: "Helvetica-Bold", letterSpacing: 0.8, marginBottom: 3 },
  h1: { fontSize: 19, fontFamily: "Helvetica-Bold" },
  sub: { fontSize: 10, color: MUTE, marginTop: 2 },
  byline: { fontSize: 8, color: MUTE, fontFamily: "Helvetica-Oblique", marginTop: 3, marginBottom: 8 },
  vbox: { borderWidth: 1, borderColor: "#c9d0f7", backgroundColor: "#eef0fb", borderRadius: 4, padding: 9, marginBottom: 9 },
  vtxt: { fontSize: 12, fontFamily: "Helvetica-Bold", color: INK },
  fact: { fontSize: 9.5, color: "#333", marginTop: 2 },
  vlabel: { fontSize: 8, color: COBALT, fontFamily: "Helvetica-Bold", letterSpacing: 0.6, marginBottom: 3 },
  readTxt: { fontSize: 9.5, color: "#222", lineHeight: 1.5 },
  h2: { fontSize: 10, fontFamily: "Helvetica-Bold", color: COBALT, marginTop: 8, marginBottom: 2, letterSpacing: 0.4 },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: LINE, paddingVertical: 2 },
  cM: { flex: 1, color: "#333" },
  cV: { width: 66, textAlign: "right", fontFamily: "Helvetica-Bold" },
  cO: { width: 66, textAlign: "right", color: "#333" },
  hCell: { fontSize: 7.5, color: MUTE, letterSpacing: 0.4 },
  foot: { marginTop: 12, paddingTop: 7, borderTopWidth: 1, borderTopColor: LINE, fontSize: 7.5, color: MUTE, lineHeight: 1.5 },
});

const L = {
  EN: { kicker: "TEAM MATCH STATS", prepared: "Prepared for the coaching staff · MicroPulse · StatsBomb",
    theRead: "THE READ", ai: "AI-written from the numbers below — cites the data, decides nothing",
    you: "You", vsOpp: "Opp / avg", est: " (est.)",
    foot: "Descriptive context only — it never changes the readiness colour, load, or the daily decision. Figures are StatsBomb team match stats for this single game; the opponent column is the opposing side, and where no opponent figure exists the tilde value is your season average for context. Estimates (Possession %, PPDA) are derived, not StatsBomb-reported. OBV = On-Ball Value. Rules compute — not AI." },
  IS: { kicker: "LIÐS-TÖLFRÆÐI", prepared: "Unnið fyrir þjálfarateymið · MicroPulse · StatsBomb",
    theRead: "LESTURINN", ai: "AI skrifaði úr tölunum að neðan — vitnar í gögnin, ákveður ekkert",
    you: "Þú", vsOpp: "Andst. / með.", est: " (áætl.)",
    foot: "Aðeins lýsandi samhengi — breytir aldrei readiness-litnum, álagi né daglegu ákvörðuninni. Tölur eru StatsBomb liðs-leikjatölur fyrir þennan eina leik; andstæðings-dálkurinn er hitt liðið, og þar sem engin andstæðings-tala er til er tilde-gildið tímabils-meðaltal þitt til viðmiðunar. Áætlanir (Boltahlutfall %, PPDA) eru reiknaðar, ekki beinar StatsBomb-tölur. OBV = On-Ball Value. Reglur reikna — ekki AI." },
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
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.kicker}>{t.kicker}</Text>
        <Text style={s.h1}>{titleLine(report, teamName)}</Text>
        {sub ? <Text style={s.sub}>{sub}</Text> : null}
        <Text style={s.byline}>{t.prepared}</Text>

        <View style={s.vbox}>
          <Text style={s.vtxt}>{isIS ? report.headline.is : report.headline.en}</Text>
          {report.facts.map((f, i) => <Text key={i} style={s.fact}>{"• "}{isIS ? f.is : f.en}</Text>)}
        </View>

        {narrative && narrative.trim() ? (
          <View style={{ marginBottom: 9 }}>
            <Text style={s.vlabel}>{t.theRead}{"  ·  AI · "}{t.ai}</Text>
            <Text style={s.readTxt}>{narrative.trim()}</Text>
          </View>
        ) : null}

        {report.sections.map((sec) => {
          const rows = sec.metrics.filter((m) => m.own != null);
          if (!rows.length) return null;
          return (
            <View key={sec.group} wrap={false}>
              <Text style={s.h2}>{isIS ? sec.title.is : sec.title.en}</Text>
              <View style={s.row}>
                <Text style={[s.cM, s.hCell]} />
                <Text style={[s.cV, s.hCell, { fontFamily: "Helvetica" }]}>{t.you}</Text>
                <Text style={[s.cO, s.hCell]}>{t.vsOpp}</Text>
              </View>
              {rows.map((m) => {
                const right = m.opp != null ? fmtVal(m.opp, m.format) : (m.seasonAvg != null ? `~${fmtVal(m.seasonAvg, m.format)}` : "");
                return (
                  <View style={s.row} key={m.key}>
                    <Text style={s.cM}>{(isIS ? m.label.is : m.label.en) + (m.estimated ? t.est : "")}</Text>
                    <Text style={s.cV}>{fmtVal(m.own, m.format)}</Text>
                    <Text style={s.cO}>{right}</Text>
                  </View>
                );
              })}
            </View>
          );
        })}

        <Text style={s.foot}>{t.foot}</Text>
      </Page>
    </Document>
  );
}

export async function downloadSbTeamMatchReportPdf(report: SbTeamMatchReport, teamName: string, lang: Lang, narrative?: string | null) {
  const blob = await pdf(<Doc report={report} teamName={teamName} lang={lang} narrative={narrative} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const oppSlug = (report.opponent ?? "opponent").replace(/\s+/g, "-");
  a.download = `team-match-stats-${oppSlug}-${report.matchDate}.pdf`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
