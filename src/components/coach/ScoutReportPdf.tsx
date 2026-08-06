"use client";

/**
 * ScoutReportPdf — a one-page pre-match opponent report the coach can print for the
 * staff/players. Rules compute the facts; the verdicts are deterministic. Descriptive
 * context only — it never touches the readiness colour or the daily decision.
 */

import { Document, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import type { OpponentReport, Bi } from "@/lib/micropulse/scouting/opponentReport";

type Lang = "EN" | "IS";
const INK = "#14181c", MUTE = "#6b7280", LINE = "#e5e7eb", COBALT = "#2740e6";

const s = StyleSheet.create({
  page: { paddingTop: 38, paddingBottom: 40, paddingHorizontal: 42, fontSize: 9.5, color: INK, fontFamily: "Helvetica", lineHeight: 1.4 },
  h1: { fontSize: 18, fontFamily: "Helvetica-Bold" },
  sub: { fontSize: 9, color: MUTE, marginTop: 2, marginBottom: 4 },
  sec: { marginTop: 11, fontSize: 8, fontFamily: "Helvetica-Bold", color: COBALT, textTransform: "uppercase", letterSpacing: 0.6 },
  verdict: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 2 },
  facts: { marginTop: 2, color: MUTE },
  rec: { marginTop: 2, flexDirection: "row" },
  recDot: { width: 10, color: "#b45309", fontFamily: "Helvetica-Bold" },
  row: { flexDirection: "row", borderTopWidth: 1, borderColor: LINE, paddingVertical: 2 },
  c1: { flex: 1 }, cR: { width: 60, textAlign: "right", fontFamily: "Helvetica-Bold" },
  foot: { marginTop: 14, paddingTop: 7, borderTopWidth: 1, borderColor: LINE, fontSize: 7.5, color: MUTE, lineHeight: 1.5 },
});

const pick = (b: Bi, lang: Lang) => b[lang.toLowerCase() as "en" | "is"];
const f = (v: number | null | undefined, d = 1) => (v == null ? "—" : v.toFixed(d));

function Doc({ report, lang, label }: { report: OpponentReport; lang: Lang; label: (k: string) => string }) {
  const isIS = lang === "IS";
  const factLine = (facts: { metric: string; value: number | null; league?: number | null }[]) =>
    facts.map((c) => `${label(c.metric)} ${f(c.value)}${c.league != null ? ` (${isIS ? "deild" : "lg"} ${f(c.league)})` : ""}`).join("  ·  ");
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.h1}>{report.opponent} — {isIS ? "andstæðinga-njósn" : "opponent scouting"} {report.season}</Text>
        <Text style={s.sub}>{isIS ? "Fyrir þjálfarateymið" : "Prepared for the coaching staff"} · MicroPulse · {report.matches} {isIS ? "leikir" : "matches"}{report.record ? ` (${report.record.w}W ${report.record.d}D ${report.record.l}L)` : ""}</Text>

        <Text style={s.sec}>{isIS ? "Stíll" : "Style"}</Text>
        <Text style={s.verdict}>{pick(report.identity.verdict, lang)}</Text>
        <Text style={s.facts}>{factLine(report.identity.facts)}</Text>

        <Text style={s.sec}>{isIS ? "Hvernig þeir sækja" : "How they attack"}</Text>
        <Text style={s.verdict}>{pick(report.attack.verdict, lang)}</Text>
        <Text style={s.facts}>{factLine(report.attack.facts)}</Text>

        <Text style={s.sec}>{isIS ? "Hvernig þeir verjast — hvar á að meiða þá" : "How they defend — where to hurt them"}</Text>
        <Text style={s.verdict}>{pick(report.defend.verdict, lang)}</Text>
        <Text style={s.facts}>{factLine(report.defend.facts)}</Text>
        {report.defend.recommendations.map((r) => (
          <View style={s.rec} key={r.id}><Text style={s.recDot}>{">"}</Text><Text style={{ flex: 1 }}>{pick(r.text, lang)} <Text style={{ color: MUTE }}>({isIS ? "merki" : "signal"}: {label(r.signal.metric)} {f(r.signal.value)})</Text></Text></View>
        ))}

        <Text style={s.sec}>{isIS ? "Fastaleikir" : "Set pieces"}</Text>
        <Text style={{ marginTop: 2 }}>{pick(report.setPieces.verdict, lang)}</Text>

        {report.keyPlayers.available ? (
          <>
            <Text style={s.sec}>{isIS ? "Lykilmenn" : "Key players"}</Text>
            <Text style={s.verdict}>{pick(report.keyPlayers.verdict, lang)}</Text>
            {report.keyPlayers.topScorers.map((p) => (
              <View style={s.row} key={p.name}><Text style={s.c1}>{p.name}{p.position ? `  ${p.position}` : ""}</Text><Text style={s.cR}>{f(p.goals, 0)}G · {f(p.assists, 0)}A · {f(p.xg)}xG</Text></View>
            ))}
          </>
        ) : null}

        <Text style={s.sec}>{isIS ? "Þeir vs þú" : "Them vs you"}</Text>
        <Text style={s.verdict}>{pick(report.matchup.verdict, lang)}</Text>
        <View style={[s.row, { borderTopWidth: 0 }]}><Text style={s.c1}> </Text><Text style={s.cR}>{isIS ? "Þeir" : "Them"}</Text><Text style={s.cR}>{isIS ? "Þú" : "You"}</Text></View>
        {report.matchup.rows.map((r) => (
          <View style={s.row} key={r.metric}><Text style={s.c1}>{label(r.metric)}</Text><Text style={s.cR}>{f(r.them)}</Text><Text style={s.cR}>{f(r.you)}</Text></View>
        ))}

        <Text style={s.sec}>{isIS ? "Form" : "Form"}</Text>
        <Text style={{ marginTop: 2 }}>{pick(report.form.verdict, lang)}</Text>

        <Text style={s.foot}>
          {isIS
            ? "Lýsandi samhengi úr Wyscout Team → Stats (árstölfræði andstæðingsins), borið saman við deildar-meðaltal og þitt lið. Ráðleggingar sýna merkið sem þær koma frá og eru til viðmiðunar — þjálfarinn ræður. Snertir aldrei readiness-litinn né daglegu ákvörðunina. Dýpri gögn (myndbönd, event-gögn) eru v2 (Wyscout Data API)."
            : "Descriptive context from Wyscout Team → Stats (the opponent's season), benchmarked against the league average and your team. Recommendations show the signal they came from and are guidance — the coach decides. Never touches the readiness colour or the daily decision. Deeper data (video, event data) is v2 (Wyscout Data API)."}
          {"  ·  MicroPulse"}
        </Text>
      </Page>
    </Document>
  );
}

export async function downloadScoutReportPdf(report: OpponentReport, lang: Lang, label: (k: string) => string) {
  const blob = await pdf(<Doc report={report} lang={lang} label={label} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${report.opponent.replace(/\s+/g, "-")}-scouting-${report.season}.pdf`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
