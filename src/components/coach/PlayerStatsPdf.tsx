"use client";

/**
 * PlayerStatsPdf — PDF exports for the two Player Season Analysis views.
 *
 *  - downloadPlayerRoleReportPdf: the StatsBomb single-player read (role, summary,
 *    strengths, development, per-90 percentile table). AI prose labelled if present.
 *  - downloadPlayerSeasonTablePdf: the Wyscout squad table (one row per player, the
 *    same season football + physical columns shown on screen).
 *
 * Presentation-only: numbers are rule-computed upstream, prose is AI-phrased + labelled;
 * the caller passes already-localised strings. Descriptive — never the readiness colour
 * or the daily decision. WinAnsi/Helvetica (Icelandic-safe): no arrows / ticks / U+2212.
 */

import { Document, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";

type Lang = "EN" | "IS";

const INK = "#14181c", MUTE = "#6b7280", LINE = "#e5e7eb", COBALT = "#2740e6", GREEN = "#1c7a4a", AMBER = "#a86a12";

// ── Single-player role report (StatsBomb) ────────────────────────────────────
export type RoleReportPayload = {
  playerName: string;
  role: string | null;              // already-localised role label
  minutes: number | null;
  poolSize: number;
  goalkeeper: boolean;
  aiGenerated: boolean;
  prose: { summary?: string; strengths?: string; development?: string } | null;
  strengths: Array<{ label: string; percentile: number | null }>;
  weaknesses: Array<{ label: string; percentile: number | null }>;
  metrics: Array<{ label: string; category: string; value: number | null; percentile: number | null }>;
  gkNote?: string | null;
};

const rr = StyleSheet.create({
  page: { paddingTop: 26, paddingBottom: 34, paddingHorizontal: 34, fontSize: 9.5, fontFamily: "Helvetica", color: INK, lineHeight: 1.4 },
  kicker: { fontSize: 8, color: COBALT, fontFamily: "Helvetica-Bold", letterSpacing: 0.8, marginBottom: 3 },
  h1: { fontSize: 19, fontFamily: "Helvetica-Bold" },
  sub: { fontSize: 10, color: MUTE, marginTop: 2 },
  byline: { fontSize: 8, color: MUTE, fontFamily: "Helvetica-Oblique", marginTop: 3, marginBottom: 8 },
  vbox: { borderWidth: 1, borderColor: "#c9d0f7", backgroundColor: "#eef0fb", borderRadius: 4, padding: 9, marginBottom: 9 },
  vlabel: { fontSize: 8, color: COBALT, fontFamily: "Helvetica-Bold", letterSpacing: 0.6, marginBottom: 2 },
  vtxt: { fontSize: 10.5, color: "#222" },
  h2: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 9, marginBottom: 3 },
  para: { fontSize: 9.5, color: "#222", marginBottom: 3 },
  bullet: { fontSize: 9, color: "#333", marginBottom: 1.5 },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: LINE, paddingVertical: 2 },
  cM: { flex: 1, color: "#333" },
  cCat: { width: 120, color: MUTE },
  cV: { width: 54, textAlign: "right", color: "#333" },
  cP: { width: 40, textAlign: "right", fontFamily: "Helvetica-Bold" },
  foot: { marginTop: 12, paddingTop: 7, borderTopWidth: 1, borderTopColor: LINE, fontSize: 7.5, color: MUTE, lineHeight: 1.5 },
});

const RL = {
  EN: { kicker: "PLAYER SEASON ANALYSIS", prepared: "Prepared for the coaching staff · MicroPulse",
    ai: "AI-written from the numbers — cites the data, decides nothing",
    role: "Role", min: "min", of: "vs squad", players: "players",
    summary: "Summary", strengths: "Strengths", development: "Development areas",
    numbers: "Per 90 · percentile vs squad", metric: "Metric", value: "Per 90", pctl: "%ile",
    method: "Descriptive context only — it never changes the readiness colour, load, or the daily decision. Percentiles rank this player within his own squad (per-90); they describe what happened, they do not predict. Low minutes = a small sample.",
    signals: "Signals: StatsBomb per-90 season stats. Rules compute the percentiles; any prose is AI-phrased and coach-overridable." },
  IS: { kicker: "LEIKMANNA-TÍMABILSGREINING", prepared: "Unnið fyrir þjálfarateymið · MicroPulse",
    ai: "AI skrifaði úr tölunum — vitnar í gögnin, ákveður ekkert",
    role: "Hlutverk", min: "mín", of: "vs lið", players: "leikmenn",
    summary: "Samantekt", strengths: "Styrkleikar", development: "Þróunar-svæði",
    numbers: "Á 90 · percentíl vs lið", metric: "Mæling", value: "Á 90", pctl: "pctl",
    method: "Aðeins lýsandi samhengi — breytir aldrei readiness-litnum, álagi né daglegu ákvörðuninni. Percentíl raða leikmanni innan síns liðs (á 90); þau lýsa því sem gerðist, þau spá ekki. Fáar mínútur = lítið úrtak.",
    signals: "Uppspretta: StatsBomb á-90 tímabils-tölur. Reglur reikna percentílin; texti er AI-orðaður og þjálfari getur hnekkt." },
} as const;

const fnum = (v: number | null): string => (v == null ? "—" : Math.abs(v) < 1 ? v.toFixed(2) : v.toFixed(1));

function RoleReportDoc({ payload, lang }: { payload: RoleReportPayload; lang: Lang }) {
  const t = RL[lang];
  const sub = [payload.role ? `${t.role}: ${payload.role}` : null, payload.minutes != null ? `${Math.round(payload.minutes)} ${t.min}` : null, `${payload.poolSize} ${t.players} ${t.of}`].filter(Boolean).join(" · ");
  const pr = payload.prose;
  return (
    <Document>
      <Page size="A4" style={rr.page}>
        <Text style={rr.kicker}>{t.kicker}</Text>
        <Text style={rr.h1}>{payload.playerName}</Text>
        <Text style={rr.sub}>{sub}</Text>
        <Text style={rr.byline}>{t.prepared}{payload.aiGenerated ? ` · AI · ${t.ai}` : ""}</Text>

        {pr?.summary ? (
          <View style={rr.vbox}><Text style={rr.vlabel}>{t.summary}</Text><Text style={rr.vtxt}>{pr.summary}</Text></View>
        ) : payload.gkNote ? (
          <View style={rr.vbox}><Text style={rr.vtxt}>{payload.gkNote}</Text></View>
        ) : null}

        {(pr?.strengths || payload.strengths.length) ? (
          <View wrap={false}>
            <Text style={[rr.h2, { color: GREEN }]}>{t.strengths}</Text>
            {pr?.strengths ? <Text style={rr.para}>{pr.strengths}</Text> : null}
            {payload.strengths.map((m, i) => <Text key={i} style={rr.bullet}>{m.label}{m.percentile != null ? ` (${m.percentile}${lang === "IS" ? "." : "th"})` : ""}</Text>)}
          </View>
        ) : null}

        {(pr?.development || payload.weaknesses.length) ? (
          <View wrap={false}>
            <Text style={[rr.h2, { color: AMBER }]}>{t.development}</Text>
            {pr?.development ? <Text style={rr.para}>{pr.development}</Text> : null}
            {payload.weaknesses.map((m, i) => <Text key={i} style={rr.bullet}>{m.label}{m.percentile != null ? ` (${m.percentile}${lang === "IS" ? "." : "th"})` : ""}</Text>)}
          </View>
        ) : null}

        {payload.metrics.length ? (
          <View>
            <Text style={rr.h2}>{t.numbers}</Text>
            <View style={rr.row}>
              <Text style={[rr.cM, { fontFamily: "Helvetica-Bold", color: INK }]}>{t.metric}</Text>
              <Text style={[rr.cCat, { fontFamily: "Helvetica-Bold", color: INK }]}></Text>
              <Text style={[rr.cV, { fontFamily: "Helvetica-Bold", color: INK }]}>{t.value}</Text>
              <Text style={[rr.cP, { color: INK }]}>{t.pctl}</Text>
            </View>
            {payload.metrics.map((m, i) => (
              <View style={rr.row} key={i} wrap={false}>
                <Text style={rr.cM}>{m.label}</Text>
                <Text style={rr.cCat}>{m.category}</Text>
                <Text style={rr.cV}>{fnum(m.value)}</Text>
                <Text style={rr.cP}>{m.percentile ?? "—"}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <Text style={rr.foot}>{t.method}{"\n"}{t.signals}</Text>
      </Page>
    </Document>
  );
}

export async function downloadPlayerRoleReportPdf(payload: RoleReportPayload, lang: Lang) {
  const blob = await pdf(<RoleReportDoc payload={payload} lang={lang} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `player-analysis-${payload.playerName.replace(/\s+/g, "-")}.pdf`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── Squad table (Wyscout) ────────────────────────────────────────────────────
export type SeasonTablePayload = {
  title: string;         // already-localised page title
  season: string;
  note: string;          // already-localised provenance line
  headers: string[];     // "Player" is prepended by the renderer
  rows: Array<{ name: string; position: string | null; cells: string[] }>;
};

const st = StyleSheet.create({
  page: { paddingTop: 24, paddingBottom: 30, paddingHorizontal: 26, fontSize: 8.5, fontFamily: "Helvetica", color: INK, lineHeight: 1.35 },
  kicker: { fontSize: 8, color: COBALT, fontFamily: "Helvetica-Bold", letterSpacing: 0.8, marginBottom: 3 },
  h1: { fontSize: 16, fontFamily: "Helvetica-Bold" },
  sub: { fontSize: 9, color: MUTE, marginTop: 2, marginBottom: 8 },
  hrow: { flexDirection: "row", borderBottomWidth: 1.2, borderBottomColor: "#c9cfd8", paddingBottom: 3, marginBottom: 1 },
  row: { flexDirection: "row", borderBottomWidth: 0.6, borderBottomColor: LINE, paddingVertical: 2.5 },
  name: { width: 150, fontFamily: "Helvetica-Bold", color: INK },
  pos: { width: 30, color: MUTE },
  cell: { flex: 1, textAlign: "right", color: "#333" },
  hName: { width: 150, fontFamily: "Helvetica-Bold", color: INK },
  hPos: { width: 30, fontFamily: "Helvetica-Bold", color: INK },
  hCell: { flex: 1, textAlign: "right", fontFamily: "Helvetica-Bold", color: INK },
  foot: { marginTop: 12, paddingTop: 7, borderTopWidth: 1, borderTopColor: LINE, fontSize: 7.5, color: MUTE, lineHeight: 1.5 },
});

const STL = {
  EN: { kicker: "PLAYER SEASON ANALYSIS", player: "Player", season: "Season",
    method: "Descriptive season output — it never changes the readiness colour, load, or the daily training decision. Football stats are the imported Wyscout/StatsBomb season totals; the physical columns are the MicroPulse GPS/IMA season output for the same players." },
  IS: { kicker: "LEIKMANNA-TÍMABILSGREINING", player: "Leikmaður", season: "Tímabil",
    method: "Lýsandi tímabils-afköst — breytir aldrei readiness-litnum, álagi né daglegu ákvörðuninni. Fótbolta-tölur eru innfluttar Wyscout/StatsBomb tímabils-heildir; líkamlegu dálkarnir eru MicroPulse GPS/IMA tímabils-afköst sömu leikmanna." },
} as const;

function SeasonTableDoc({ payload, lang }: { payload: SeasonTablePayload; lang: Lang }) {
  const t = STL[lang];
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={st.page}>
        <Text style={st.kicker}>{t.kicker}</Text>
        <Text style={st.h1}>{payload.title}</Text>
        <Text style={st.sub}>{t.season} {payload.season} · {payload.rows.length} {lang === "IS" ? "leikmenn" : "players"}</Text>

        <View style={st.hrow}>
          <Text style={st.hName}>{t.player}</Text>
          <Text style={st.hPos}></Text>
          {payload.headers.map((h, i) => <Text key={i} style={st.hCell}>{h}</Text>)}
        </View>
        {payload.rows.map((r, i) => (
          <View style={st.row} key={i} wrap={false}>
            <Text style={st.name}>{r.name}</Text>
            <Text style={st.pos}>{r.position ?? ""}</Text>
            {r.cells.map((c, j) => <Text key={j} style={st.cell}>{c}</Text>)}
          </View>
        ))}

        <Text style={st.foot}>{payload.note}{"\n"}{t.method}</Text>
      </Page>
    </Document>
  );
}

export async function downloadPlayerSeasonTablePdf(payload: SeasonTablePayload, lang: Lang) {
  const blob = await pdf(<SeasonTableDoc payload={payload} lang={lang} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `player-season-table-${payload.season}.pdf`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
