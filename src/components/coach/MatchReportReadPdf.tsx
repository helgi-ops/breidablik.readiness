"use client";

/**
 * MatchReportReadPdf — the AI match-report briefing as a downloadable PDF. Same layered
 * read as the on-screen card: headline verdict box → summary → how it flowed → key
 * moments → stat highlights → went well / to improve → key players → tactical + opponent.
 * Labelled AS AI, cites the source report, descriptive — never touches readiness.
 * WinAnsi/Helvetica (Icelandic-safe): no arrows / ticks / U+2212 (ASCII hyphen only).
 */

import { Document, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";

type Lang = "EN" | "IS";

export type MatchReportRead = {
  headline?: string; score?: string; competition?: string; summary?: string; phases?: string;
  keyMoments?: string[]; statHighlights?: Array<{ label: string; value: string }>;
  wentWell?: string[]; toImprove?: string[]; keyPlayers?: Array<{ name: string; note: string }>;
  tactical?: string; opponent?: string;
};

const INK = "#14181c", MUTE = "#6b7280", LINE = "#e5e7eb", COBALT = "#2740e6", GREEN = "#1c7a4a", RED = "#a83e28";
const clean = (s: string) => String(s ?? "").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—−]/g, "-").replace(/[▲▼✓→]/g, "");

const st = StyleSheet.create({
  page: { paddingTop: 26, paddingBottom: 34, paddingHorizontal: 34, fontSize: 9.5, fontFamily: "Helvetica", color: INK, lineHeight: 1.4 },
  kicker: { fontSize: 8, color: COBALT, fontFamily: "Helvetica-Bold", letterSpacing: 0.8, marginBottom: 3 },
  h1: { fontSize: 17, fontFamily: "Helvetica-Bold" },
  sub: { fontSize: 10, color: MUTE, marginTop: 2, marginBottom: 8 },
  vbox: { borderWidth: 1, borderColor: "#c9d0f7", backgroundColor: "#eef0fb", borderRadius: 4, padding: 9, marginBottom: 9 },
  vlabel: { fontSize: 8, color: COBALT, fontFamily: "Helvetica-Bold", letterSpacing: 0.6, marginBottom: 2 },
  vtxt: { fontSize: 12, fontFamily: "Helvetica-Bold", color: INK },
  h2: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 10, marginBottom: 3 },
  para: { fontSize: 9.5, color: "#222", marginBottom: 2 },
  li: { flexDirection: "row", marginBottom: 1.5 },
  bullet: { width: 10, fontFamily: "Helvetica-Bold" },
  liTxt: { flex: 1, color: "#222" },
  twoCol: { flexDirection: "row", gap: 14 },
  col: { flex: 1 },
  statRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: LINE, paddingVertical: 2 },
  statL: { flex: 1, color: "#333" },
  statV: { width: 120, textAlign: "right", fontFamily: "Helvetica-Bold" },
  foot: { position: "absolute", bottom: 18, left: 34, right: 34, fontSize: 7.5, color: MUTE, borderTopWidth: 1, borderTopColor: LINE, paddingTop: 4 },
});

const T = {
  EN: { kicker: "AI - READ FROM YOUR UPLOADED MATCH REPORT", flow: "How it flowed", moments: "Key moments", stats: "Stat highlights", well: "What went well", improve: "To improve", players: "Key players", tactical: "Tactical & subs", opp: "The opponent", foot: "AI-generated from the uploaded match report. Descriptive context - it does not decide anything and never changes a readiness verdict." },
  IS: { kicker: "AI - LESID UR UPPSETTU SKYRSLUNNI THINNI", flow: "Hvernig leikurinn flaedi", moments: "Lykilaugnablik", stats: "Tolfraedi-hapunktar", well: "Thad sem gekk vel", improve: "Til ad baeta", players: "Lykilleikmenn", tactical: "Taktik & skiptingar", opp: "Andstaedingurinn", foot: "AI-samantekt ur uppsettu leikskyrslunni. Lysandi samhengi - akvedur ekkert og breytir aldrei readiness-domi." },
} as const;

const Bul = ({ items, tone }: { items?: string[]; tone: "good" | "bad" | "plain" }) => (
  <View>{(items ?? []).map((x, i) => (
    <View key={i} style={st.li}>
      <Text style={[st.bullet, { color: tone === "good" ? GREEN : tone === "bad" ? RED : INK }]}>{tone === "good" ? "+" : tone === "bad" ? "-" : "•"}</Text>
      <Text style={st.liTxt}>{clean(x)}</Text>
    </View>
  ))}</View>
);

function Doc({ read, source, lang }: { read: MatchReportRead; source: string | null; lang: Lang }) {
  const t = T[lang];
  return (
    <Document>
      <Page size="A4" style={st.page}>
        <Text style={st.kicker}>{t.kicker}</Text>
        {read.headline ? <Text style={st.h1}>{clean(read.headline)}</Text> : null}
        <Text style={st.sub}>{[read.score, read.competition].map((x) => clean(x ?? "")).filter(Boolean).join("  -  ")}</Text>

        {read.summary ? <View style={st.vbox}><Text style={st.vlabel}>{lang === "IS" ? "YFIRLIT" : "OVERVIEW"}</Text><Text style={{ fontSize: 9.5, color: "#333" }}>{clean(read.summary)}</Text></View> : null}

        {read.phases ? (<><Text style={st.h2}>{t.flow}</Text><Text style={st.para}>{clean(read.phases)}</Text></>) : null}

        {read.keyMoments && read.keyMoments.length ? (<><Text style={st.h2}>{t.moments}</Text><Bul items={read.keyMoments} tone="plain" /></>) : null}

        {read.statHighlights && read.statHighlights.length ? (
          <><Text style={st.h2}>{t.stats}</Text>
            {read.statHighlights.map((s2, i) => (
              <View key={i} style={st.statRow}><Text style={st.statL}>{clean(s2.label)}</Text><Text style={st.statV}>{clean(s2.value)}</Text></View>
            ))}
          </>
        ) : null}

        {(read.wentWell?.length || read.toImprove?.length) ? (
          <View style={st.twoCol}>
            <View style={st.col}><Text style={[st.h2, { color: GREEN }]}>{t.well}</Text><Bul items={read.wentWell} tone="good" /></View>
            <View style={st.col}><Text style={[st.h2, { color: RED }]}>{t.improve}</Text><Bul items={read.toImprove} tone="bad" /></View>
          </View>
        ) : null}

        {read.keyPlayers && read.keyPlayers.length ? (
          <><Text style={st.h2}>{t.players}</Text>
            {read.keyPlayers.map((p, i) => (
              <View key={i} style={st.li}><Text style={st.bullet}>{"•"}</Text><Text style={st.liTxt}><Text style={{ fontFamily: "Helvetica-Bold" }}>{clean(p.name)}</Text>{p.note ? ` - ${clean(p.note)}` : ""}</Text></View>
            ))}
          </>
        ) : null}

        {read.tactical ? (<><Text style={st.h2}>{t.tactical}</Text><Text style={st.para}>{clean(read.tactical)}</Text></>) : null}
        {read.opponent ? (<><Text style={st.h2}>{t.opp}</Text><Text style={st.para}>{clean(read.opponent)}</Text></>) : null}

        <Text style={st.foot} fixed>{t.foot}{source ? `  |  ${lang === "IS" ? "Heimild" : "Source"}: ${clean(source)}` : ""}</Text>
      </Page>
    </Document>
  );
}

export async function downloadMatchReportReadPdf(read: MatchReportRead, source: string | null, lang: Lang) {
  const blob = await pdf(<Doc read={read} source={source} lang={lang} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const base = clean(read.score || "match-report").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "") || "match-report";
  a.href = url; a.download = `${base}-briefing.pdf`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
