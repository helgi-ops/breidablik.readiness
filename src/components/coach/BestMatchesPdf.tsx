"use client";

/**
 * BestMatchesPdf — the Best Match Analysis report as a PDF: the ranked best games with, per game,
 * what we did well, the DETAILED team statistics (Attack · Build-up & passing · Pressing & defence ·
 * On-ball value · Against), and who was in the team. Optionally the AI summary (labelled AI) when the
 * coach generated it. Numbers are the rule-computed sb_team_match_stats figures — descriptive, never
 * touches the readiness colour. Bilingual EN/IS. Same @react-pdf pattern as the other coach PDFs.
 */

import { Document, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";

type Lang = "EN" | "IS";
type Bi = { en: string; is: string };

type PdfLineup = { name: string; line: string | null; starter: boolean | null; minutes: number | null };
export type PdfMatch = {
  matchDate: string; opponent: string | null; isHome: boolean | null;
  goals: number; goalsAgainst: number; outcome: "win" | "draw" | "loss";
  strengths: Array<{ label: Bi }>;
  lineup: PdfLineup[]; startersKnown: boolean; lineupCount: number;
  detail: Record<string, number | null> | null;
};
export type BestMatchesPdfPayload = {
  matches: PdfMatch[];
  lens: "overall" | "attack" | "defense";
  teamName?: string | null;
  ai?: { overall: string; notes: Record<string, string> } | null;
};

const INK = "#14181c", MUTE = "#6b7280", LINE = "#e5e7eb", COBALT = "#2740e6";
const OC: Record<PdfMatch["outcome"], string> = { win: "#1c7a4a", draw: "#de9328", loss: "#a83e28" };

const s = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 44, paddingHorizontal: 40, fontSize: 9, color: INK, fontFamily: "Helvetica", lineHeight: 1.4 },
  h1: { fontSize: 18, fontFamily: "Helvetica-Bold" },
  sub: { fontSize: 9, color: MUTE, marginTop: 2 },
  aiBox: { marginTop: 12, borderWidth: 1, borderColor: COBALT, borderRadius: 4, padding: 8 },
  aiTag: { fontSize: 7, color: COBALT, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.5 },
  aiText: { fontSize: 9.5, marginTop: 3, lineHeight: 1.5 },
  card: { marginTop: 12, borderWidth: 1, borderColor: LINE, borderRadius: 6, padding: 9 },
  scoreRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  score: { fontSize: 12, fontFamily: "Helvetica-Bold" },
  badge: { fontSize: 7, color: "#fff", fontFamily: "Helvetica-Bold", textTransform: "uppercase", paddingVertical: 2, paddingHorizontal: 5, borderRadius: 3 },
  meta: { fontSize: 8, color: MUTE },
  strengths: { marginTop: 4, fontSize: 8.5, color: COBALT },
  aiNote: { marginTop: 2, fontSize: 8.5, color: "#374151" },
  groupTitle: { marginTop: 7, fontSize: 8, fontFamily: "Helvetica-Bold", color: MUTE, textTransform: "uppercase", letterSpacing: 0.4 },
  grid: { flexDirection: "row", flexWrap: "wrap", marginTop: 2 },
  cell: { width: "33.33%", flexDirection: "row", justifyContent: "space-between", paddingRight: 10, paddingVertical: 1.5 },
  cellL: { color: MUTE, fontSize: 8.5 },
  cellR: { fontFamily: "Helvetica-Bold", fontSize: 8.5 },
  lineTitle: { marginTop: 7, fontSize: 8, fontFamily: "Helvetica-Bold", color: MUTE, textTransform: "uppercase", letterSpacing: 0.4 },
  lineRow: { flexDirection: "row", marginTop: 1.5 },
  linePos: { width: 54, color: MUTE, fontSize: 8.5 },
  lineNames: { flex: 1, fontSize: 8.5 },
  foot: { marginTop: 16, paddingTop: 8, borderTopWidth: 1, borderTopColor: LINE, fontSize: 7.5, color: MUTE, lineHeight: 1.5 },
});

type Kind = "int" | "dec2" | "pct";
type Metric = { key: string; label: Bi; kind: Kind };
type Group = { title: Bi; metrics: Metric[] };
const M = (key: string, en: string, is: string, kind: Kind = "int"): Metric => ({ key, label: { en, is }, kind });

const GROUPS: Group[] = [
  { title: { en: "Attack", is: "Sókn" }, metrics: [
    M("goals", "Goals", "Mörk"), M("xg", "xG", "xG", "dec2"), M("open_play_xg", "Open-play xG", "xG (opinn leikur)", "dec2"),
    M("set_piece_xg", "Set-piece xG", "Fastra-bolta xG", "dec2"), M("shots", "Shots", "Skot"), M("shots_on_target", "Shots on target", "Skot á mark"),
    M("xg_per_shot", "xG / shot", "xG á skot", "dec2"),
  ] },
  { title: { en: "Build-up & passing", is: "Uppbygging & sendingar" }, metrics: [
    M("passing_pct", "Pass completion", "Sendinganákvæmni", "pct"), M("possession_proxy_pct", "Possession", "Boltahald", "pct"),
    M("passes", "Passes", "Sendingar"), M("passes_into_box", "Passes into box", "Sendingar í teig"), M("passes_final_third", "Into final third", "Á lokaþriðjung"),
    M("deep_progressions", "Deep progressions", "Djúpar framfærslur"), M("long_balls", "Long balls", "Langar sendingar"),
    M("crosses", "Crosses", "Fyrirgjafir"), M("through_balls", "Through balls", "Gegnumbrot"), M("key_passes", "Key passes", "Lykilsendingar"),
  ] },
  { title: { en: "Pressing & defence", is: "Pressa & vörn" }, metrics: [
    M("pressures", "Pressures", "Pressur"), M("counterpressures", "Counterpressures", "Gagnpressur"), M("pressures_opp_half_pct", "Pressures opp. half", "Pressur á vallarhelmingi andst.", "pct"),
    M("tackles", "Tackles", "Tæklingar"), M("interceptions", "Interceptions", "Stungur rofnar"), M("def_action_regains", "Ball recoveries", "Endurheimtur"),
    M("aggressive_actions", "Aggressive actions", "Ágengar aðgerðir"), M("clearances", "Clearances", "Frákast"),
  ] },
  { title: { en: "On-ball value (OBV)", is: "On-ball value (OBV)" }, metrics: [
    M("obv", "Total OBV", "Heildar-OBV", "dec2"), M("pass_obv", "Pass OBV", "Sendinga-OBV", "dec2"), M("shot_obv", "Shot OBV", "Skot-OBV", "dec2"),
    M("carry_obv", "Dribble & carry OBV", "Rekstur-OBV", "dec2"), M("def_action_obv", "Defensive OBV", "Varnar-OBV", "dec2"),
  ] },
  { title: { en: "Against", is: "Á móti" }, metrics: [
    M("goals_against", "Goals conceded", "Mörk á móti"), M("xg_against", "xG against", "xG á móti", "dec2"),
    M("shots_against", "Shots faced", "Skot á markið"), M("opposition_obv", "Opposition OBV", "OBV andstæðings", "dec2"),
  ] },
];

const LINE_LABEL: Record<string, Bi> = { GK: { en: "GK", is: "Markv." }, DEF: { en: "Defence", is: "Vörn" }, MID: { en: "Midfield", is: "Miðja" }, FWD: { en: "Attack", is: "Sókn" }, other: { en: "Other", is: "Aðrir" } };
const LINE_SEQ = ["GK", "DEF", "MID", "FWD", "other"];

const T = {
  EN: { title: "Best Match Analysis", prepared: "Prepared for the coaching staff · MicroPulse",
    lens: { overall: "Ranked overall (result → goal margin → xG)", attack: "Best attacking games", defense: "Best defensive games" },
    aiTag: "AI summary · phrases the numbers, decides nothing", starters: "Starting XI", team: "The team", subs: "Subs",
    method: "Descriptive football context only — it never changes the readiness colour or the daily decision. Ranking and “what we did well” are rule-computed from ingested StatsBomb team stats; the starting XI is read from Match minutes (55+ min). Any AI text is labelled and written from these numbers." },
  IS: { title: "Bestu leikir", prepared: "Unnið fyrir þjálfarateymið · MicroPulse",
    lens: { overall: "Raðað eftir heildarúrslitum (úrslit → markamunur → xG)", attack: "Bestu sóknarleikir", defense: "Bestu varnarleikir" },
    aiTag: "AI samantekt · orðar tölurnar, ákveður ekkert", starters: "Byrjunarlið", team: "Liðið", subs: "Inn á",
    method: "Lýsandi samhengi — breytir aldrei readiness-litnum né daglegri ákvörðun. Röðun og „hvað við gerðum vel“ eru reiknuð úr StatsBomb liðs-tölum; byrjunarlið er lesið úr Leikmínútum (55+ mín). AI-texti er merktur og skrifaður úr þessum tölum." },
} as const;

function fmt(v: number | null | undefined, kind: Kind): string {
  if (v == null) return "–";
  if (kind === "pct") return `${Math.round(v)}%`;
  if (kind === "dec2") return Number.isInteger(v) ? String(v) : v.toFixed(2);
  return String(Math.round(v));
}

export function BestMatchesDoc({ payload, lang }: { payload: BestMatchesPdfPayload; lang: Lang }) {
  const t = T[lang];
  const L = (b: Bi) => (lang === "IS" ? b.is : b.en);
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.h1}>{t.title}{payload.teamName ? ` · ${payload.teamName}` : ""}</Text>
        <Text style={s.sub}>{t.lens[payload.lens]} · {payload.matches.length} {lang === "IS" ? "leikir" : "matches"} · {t.prepared}</Text>

        {payload.ai?.overall ? (
          <View style={s.aiBox}>
            <Text style={s.aiTag}>✦ {t.aiTag}</Text>
            <Text style={s.aiText}>{payload.ai.overall}</Text>
          </View>
        ) : null}

        {payload.matches.map((m, i) => {
          const d = m.detail ?? {};
          const starters = m.lineup.filter((p) => p.starter === true);
          const useStarters = m.startersKnown;
          const lineupSet = useStarters ? starters : m.lineup;
          const bench = m.lineup.filter((p) => p.starter !== true);
          const groupsPresent = GROUPS.map((g) => ({ ...g, metrics: g.metrics.filter((mm) => d[mm.key] != null) })).filter((g) => g.metrics.length > 0);
          const aiNote = payload.ai?.notes?.[m.matchDate];
          return (
            <View key={m.matchDate} style={s.card} wrap={false}>
              <View style={s.scoreRow}>
                <Text style={s.score}>{i + 1}.  {m.goals}–{m.goalsAgainst} {lang === "IS" ? "gegn" : "vs"} {m.opponent ?? "?"}</Text>
                <Text style={[s.badge, { backgroundColor: OC[m.outcome] }]}>{m.outcome === "win" ? (lang === "IS" ? "Sigur" : "Win") : m.outcome === "draw" ? (lang === "IS" ? "Jafntefli" : "Draw") : (lang === "IS" ? "Tap" : "Loss")}</Text>
                <Text style={s.meta}>{m.matchDate}{m.isHome == null ? "" : m.isHome ? (lang === "IS" ? " · heima" : " · home") : (lang === "IS" ? " · úti" : " · away")}</Text>
              </View>

              {m.strengths.length > 0 ? <Text style={s.strengths}>{m.strengths.map((x) => L(x.label)).join("  ·  ")}</Text> : null}
              {aiNote ? <Text style={s.aiNote}>✦ {aiNote}</Text> : null}

              {groupsPresent.map((g) => (
                <View key={g.title.en}>
                  <Text style={s.groupTitle}>{L(g.title)}</Text>
                  <View style={s.grid}>
                    {g.metrics.map((mm) => (
                      <View key={mm.key} style={s.cell}><Text style={s.cellL}>{L(mm.label)}</Text><Text style={s.cellR}>{fmt(d[mm.key], mm.kind)}</Text></View>
                    ))}
                  </View>
                </View>
              ))}

              {m.lineupCount > 0 ? (
                <View>
                  <Text style={s.lineTitle}>{useStarters ? `${t.starters} (${starters.length})` : `${t.team} (${m.lineupCount})`}</Text>
                  {LINE_SEQ.map((ln) => {
                    const ps = lineupSet.filter((p) => (p.line ?? "other") === ln);
                    if (ps.length === 0) return null;
                    return <View key={ln} style={s.lineRow}><Text style={s.linePos}>{L(LINE_LABEL[ln])}</Text><Text style={s.lineNames}>{ps.map((p) => p.name).join(", ")}</Text></View>;
                  })}
                  {useStarters && bench.length > 0 ? <View style={s.lineRow}><Text style={s.linePos}>{t.subs}</Text><Text style={s.lineNames}>{bench.map((p) => `${p.name}${p.minutes != null ? ` (${Math.round(p.minutes)}')` : ""}`).join(", ")}</Text></View> : null}
                </View>
              ) : null}
            </View>
          );
        })}

        <Text style={s.foot}>{t.method}</Text>
      </Page>
    </Document>
  );
}

export async function downloadBestMatchesPdf(payload: BestMatchesPdfPayload, lang: Lang) {
  const blob = await pdf(<BestMatchesDoc payload={payload} lang={lang} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `best-match-analysis-${payload.lens}-${payload.matches.length}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
