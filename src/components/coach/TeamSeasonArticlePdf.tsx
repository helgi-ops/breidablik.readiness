"use client";

/**
 * TeamSeasonArticlePdf — the article-quality OWN-team season report (PDF).
 *
 * Layered read: verdict → the three facts behind it → strengths / weaknesses →
 * priority improvements → the full metric table vs the league average. Numbers are
 * rule-computed; the prose is AI-written from those numbers and labelled AI.
 * Descriptive context — it never touches the readiness colour. WinAnsi/Helvetica
 * (Icelandic-safe): no arrows / ticks / U+2212.
 */

import { Document, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";

type Lang = "EN" | "IS";
type Row = { key: string; value: number | null; league: number | null; dir: string; read: string; rel: number | null };
type TB = { t: string; b: string };
export type TeamSeasonArticlePayload = {
  team: string; season: string; matches: number | null;
  rows: Row[];
  signals: { npxgDiff: number | null; finishing: number | null };
  prose: {
    verdict?: string; verdictBody?: string; facts?: string[];
    strengths?: TB[]; weaknesses?: TB[]; improve?: TB[]; form?: string;
  } | null;
  aiGenerated: boolean;
};

const INK = "#14181c", MUTE = "#6b7280", LINE = "#e5e7eb", COBALT = "#2740e6";
const GREEN = "#1c7a4a", AMBER = "#de9328", RED = "#a83e28";

const s = StyleSheet.create({
  page: { paddingTop: 26, paddingBottom: 34, paddingHorizontal: 34, fontSize: 9.5, fontFamily: "Helvetica", color: INK, lineHeight: 1.4 },
  h1: { fontSize: 20, fontFamily: "Helvetica-Bold" },
  sub: { fontSize: 10, color: MUTE, marginTop: 2 },
  byline: { fontSize: 8, color: MUTE, fontFamily: "Helvetica-Oblique", marginTop: 3, marginBottom: 8 },
  vbox: { borderWidth: 1, borderColor: "#c9d0f7", backgroundColor: "#eef0fb", borderRadius: 4, padding: 9, marginBottom: 9 },
  vlabel: { fontSize: 8, color: COBALT, fontFamily: "Helvetica-Bold", letterSpacing: 0.6, marginBottom: 2 },
  vtxt: { fontSize: 12, fontFamily: "Helvetica-Bold", color: INK },
  vbody: { fontSize: 9.5, color: "#333", marginTop: 3 },
  h2: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 10, marginBottom: 4 },
  fact: { flexDirection: "row", marginBottom: 3 },
  factN: { width: 14, fontFamily: "Helvetica-Bold", color: COBALT },
  colWrap: { flexDirection: "row", gap: 10, marginTop: 2 },
  col: { flex: 1 },
  colH: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "white", paddingVertical: 2, paddingHorizontal: 5, borderRadius: 3, marginBottom: 3 },
  bullet: { flexDirection: "row", marginBottom: 3 },
  bDot: { width: 8, fontFamily: "Helvetica-Bold" },
  bT: { fontFamily: "Helvetica-Bold" },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: LINE, paddingVertical: 2 },
  cM: { flex: 1, color: "#333" },
  cV: { width: 62, textAlign: "right", fontFamily: "Helvetica-Bold" },
  cL: { width: 62, textAlign: "right", color: MUTE },
  cR: { width: 66, textAlign: "right" },
  foot: { marginTop: 12, paddingTop: 7, borderTopWidth: 1, borderTopColor: LINE, fontSize: 7.5, color: MUTE, lineHeight: 1.5 },
});

const L = {
  EN: { report: "season report", prepared: "Prepared for the coaching staff · MicroPulse", ai: "AI-written from the numbers below — cites the data, decides nothing",
    verdict: "VERDICT", why: "Why — the facts behind it", strengths: "STRENGTHS", weaknesses: "WEAKNESSES", improve: "Things to improve (priority order)",
    form: "Form", full: "Full numbers — vs league average (per match)", metric: "Metric", team: "Team", league: "League", read: "Read", inProgress: "in progress",
    method: "Descriptive context only — it never changes the readiness colour or the daily decision. Figures are StatsBomb season aggregates for the team vs the built-in League Average; xG / OBV are models with uncertainty. The read is rule-based and the coach can override it. Association, not causation or prediction.",
    signals: "Signals: StatsBomb IQ Team Stats (team vs built-in League Average). Rules compute the figures; the read is AI-phrased and coach-overridable." },
  IS: { report: "tímabilsskýrsla", prepared: "Unnið fyrir þjálfarateymið · MicroPulse", ai: "AI skrifaði úr tölunum að neðan — vitnar í gögnin, ákveður ekkert",
    verdict: "DÓMUR", why: "Af hverju — staðreyndirnar á bak við", strengths: "STYRKLEIKAR", weaknesses: "VEIKLEIKAR", improve: "Til að bæta (í forgangsröð)",
    form: "Form", full: "Fullar tölur — vs deildar-meðaltal (á leik)", metric: "Mæling", team: "Lið", league: "Deild", read: "Lestur", inProgress: "í gangi",
    method: "Aðeins lýsandi samhengi — breytir aldrei readiness-litnum né daglegu ákvörðuninni. Tölur eru StatsBomb season-samtölur liðsins vs innbyggða League Average; xG / OBV eru líkön með óvissu. Lesturinn er reglu-byggður og þjálfari getur hnekkt honum. Fylgni, ekki orsök eða spá.",
    signals: "Uppspretta: StatsBomb IQ Team Stats (lið vs innbyggt League Average). Reglur reikna tölurnar; lesturinn er AI-orðaður og þjálfari getur hnekkt." },
} as const;

const READ: Record<string, { en: string; is: string; color: string }> = {
  strength: { en: "strength", is: "styrkur", color: GREEN }, good: { en: "good", is: "gott", color: GREEN },
  above: { en: "above", is: "yfir", color: COBALT }, even: { en: "~", is: "~", color: MUTE }, neutral: { en: "~", is: "~", color: MUTE },
  below: { en: "below", is: "undir", color: AMBER }, weak: { en: "weak", is: "veikt", color: RED },
};

const fmt = (v: number | null): string => (v == null ? "—" : Math.abs(v) >= 20 ? `${Math.round(v)}` : `${Math.round(v * 100) / 100}`);

function Bullet({ item }: { item: TB }) {
  return (<View style={s.bullet}><Text style={s.bDot}>·</Text><Text style={{ flex: 1 }}><Text style={s.bT}>{item.t} </Text>{item.b}</Text></View>);
}

export function Doc({ payload, lang, label }: { payload: TeamSeasonArticlePayload; lang: Lang; label: (k: string) => string }) {
  const t = L[lang];
  const p = payload.prose;
  const verdict = p?.verdict ?? (lang === "IS" ? "Tímabilsmynd liðsins vs deildin." : "The team's season vs the league.");
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.h1}>{payload.team} {payload.season} — {t.report}</Text>
        <Text style={s.sub}>{payload.matches != null ? `${payload.matches} ${lang === "IS" ? "leikir" : "matches"}, ${t.inProgress}` : ""}</Text>
        <Text style={s.byline}>{t.prepared}{payload.aiGenerated ? ` · AI · ${t.ai}` : ""}</Text>

        <View style={s.vbox}>
          <Text style={s.vlabel}>{t.verdict}</Text>
          <Text style={s.vtxt}>{verdict}</Text>
          {p?.verdictBody ? <Text style={s.vbody}>{p.verdictBody}</Text> : null}
        </View>

        {p?.facts && p.facts.length ? (
          <View>
            <Text style={s.h2}>{t.why}</Text>
            {p.facts.slice(0, 3).map((f, i) => (
              <View style={s.fact} key={i}><Text style={s.factN}>{i + 1}</Text><Text style={{ flex: 1 }}>{f}</Text></View>
            ))}
          </View>
        ) : null}

        {(p?.strengths?.length || p?.weaknesses?.length) ? (
          <View style={s.colWrap}>
            <View style={s.col}>
              <Text style={[s.colH, { backgroundColor: GREEN }]}>{t.strengths}</Text>
              {(p?.strengths ?? []).map((x, i) => <Bullet key={i} item={x} />)}
            </View>
            <View style={s.col}>
              <Text style={[s.colH, { backgroundColor: RED }]}>{t.weaknesses}</Text>
              {(p?.weaknesses ?? []).map((x, i) => <Bullet key={i} item={x} />)}
            </View>
          </View>
        ) : null}

        {p?.improve?.length ? (
          <View>
            <Text style={s.h2}>{t.improve}</Text>
            {p.improve.map((x, i) => (
              <View style={s.fact} key={i}><Text style={s.factN}>{i + 1}</Text><Text style={{ flex: 1 }}><Text style={s.bT}>{x.t} </Text>{x.b}</Text></View>
            ))}
          </View>
        ) : null}

        {p?.form ? (<View><Text style={s.h2}>{t.form}</Text><Text>{p.form}</Text></View>) : null}

        <Text style={s.h2}>{t.full}</Text>
        <View style={s.row}>
          <Text style={[s.cM, { fontFamily: "Helvetica-Bold", color: INK }]}>{t.metric}</Text>
          <Text style={[s.cV, { color: INK }]}>{t.team}</Text>
          <Text style={[s.cL, { fontFamily: "Helvetica-Bold" }]}>{t.league}</Text>
          <Text style={[s.cR, { fontFamily: "Helvetica-Bold", color: INK }]}>{t.read}</Text>
        </View>
        {payload.rows.map((r) => {
          const rd = READ[r.read] ?? READ.neutral;
          return (
            <View style={s.row} key={r.key}>
              <Text style={s.cM}>{label(r.key)}</Text>
              <Text style={s.cV}>{fmt(r.value)}</Text>
              <Text style={s.cL}>{fmt(r.league)}</Text>
              <Text style={[s.cR, { color: rd.color, fontFamily: "Helvetica-Bold" }]}>{lang === "IS" ? rd.is : rd.en}</Text>
            </View>
          );
        })}

        <Text style={s.foot}>{t.method}{"\n"}{t.signals}</Text>
      </Page>
    </Document>
  );
}

export async function downloadTeamSeasonArticlePdf(payload: TeamSeasonArticlePayload, lang: Lang, label: (k: string) => string) {
  const blob = await pdf(<Doc payload={payload} lang={lang} label={label} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${payload.team.replace(/\s+/g, "-")}-${payload.season}-season-report-statsbomb.pdf`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
