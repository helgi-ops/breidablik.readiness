"use client";

/**
 * OpponentPlayersPdf — a one-document scouting read of the OPPONENT's WHOLE squad,
 * one section per player, laid out like the on-screen Players tab: an opponent-framed
 * AI read (profile / threat / how to stop, labelled AI) over the per-90 percentile
 * bars, grouped attacking / possession / defending and ranked WITHIN their own squad.
 *
 * The bars/percentiles are computed by rules (buildPlayerAnalysis); the AI only phrases
 * them and is labelled AI. Descriptive scouting context only — it never touches the
 * readiness colour or the daily decision.
 */

import { Document, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import type { PlayerAnalysis, Category, MetricRow } from "@/lib/micropulse/playerAnalysis";

type Lang = "EN" | "IS";
export type PlayerProse = { summary?: string; threat?: string; howToStop?: string } | null;
export type PdfPlayer = { analysis: PlayerAnalysis; prose: PlayerProse };

const INK = "#14181c", MUTE = "#5c6570", LINE = "#e5e7eb", COBALT = "#2740e6";
const GREEN = "#1c7a4a", RED = "#a83e28", BARBG = "#eef0f3";
const AI_BG = "#f9efec", AI_BORDER = "#e6cfc7", CLAY = "#a83e28";

const barColor = (p: number | null): string => (p == null ? "#c7cdd6" : p >= 75 ? GREEN : p <= 25 ? RED : COBALT);
const fmtV = (v: number | null): string => (v == null ? "—" : Math.abs(v) < 1 ? v.toFixed(2) : v.toFixed(1));

const s = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 42, paddingHorizontal: 46, fontSize: 9.5, color: INK, fontFamily: "Helvetica", lineHeight: 1.4 },
  h1: { fontSize: 17, fontFamily: "Helvetica-Bold" },
  sub: { fontSize: 11, fontFamily: "Helvetica-Bold", color: COBALT, marginTop: 3 },
  byline: { fontSize: 8.5, color: MUTE, fontFamily: "Helvetica-Oblique", marginTop: 3, marginBottom: 6 },
  player: { marginTop: 10 },
  phead: { flexDirection: "row", alignItems: "baseline", marginBottom: 4 },
  pname: { fontSize: 13, fontFamily: "Helvetica-Bold" },
  role: { fontSize: 8, fontFamily: "Helvetica-Bold", color: COBALT, marginLeft: 8 },
  mins: { fontSize: 8, color: MUTE, marginLeft: 8 },
  ai: { borderWidth: 1, borderColor: AI_BORDER, backgroundColor: AI_BG, borderRadius: 5, padding: 8, marginBottom: 6 },
  aiTag: { fontSize: 7, fontFamily: "Helvetica-Bold", color: CLAY, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 2 },
  aiSummary: { fontSize: 10, fontFamily: "Helvetica-Bold" },
  aiPara: { fontSize: 9, marginTop: 3 },
  aiLbl: { fontFamily: "Helvetica-Bold" },
  catTitle: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginTop: 5, marginBottom: 2 },
  catName: { fontSize: 9.5, fontFamily: "Helvetica-Bold" },
  catPct: { fontSize: 7.5, color: MUTE },
  barRow: { flexDirection: "row", alignItems: "center", paddingVertical: 1 },
  barLbl: { width: 92, fontSize: 8 },
  track: { flex: 1, height: 5, backgroundColor: BARBG, borderRadius: 2.5, marginHorizontal: 5 },
  fill: { height: 5, borderRadius: 2.5 },
  barPct: { width: 20, fontSize: 8, fontFamily: "Helvetica-Bold", textAlign: "right" },
  barVal: { width: 26, fontSize: 7.5, color: MUTE, textAlign: "right" },
  none: { fontSize: 8, color: MUTE, fontFamily: "Helvetica-Oblique", marginTop: 3 },
  gkTag: { fontSize: 8, fontFamily: "Helvetica-Bold", color: MUTE, marginLeft: 8 },
  gkNote: { fontSize: 8.5, color: MUTE, fontFamily: "Helvetica-Oblique", marginTop: 2 },
  foot: { marginTop: 14, paddingTop: 8, borderTopWidth: 1, borderColor: LINE, fontSize: 7.5, color: MUTE, lineHeight: 1.5 },
});

const CAT_LABEL: Record<Category, { EN: string; IS: string }> = {
  attacking: { EN: "Attacking", IS: "Sókn" },
  possession: { EN: "Possession & progression", IS: "Boltahald & framrás" },
  defending: { EN: "Defending", IS: "Vörn" },
};

function BarRow({ m }: { m: MetricRow }) {
  return (
    <View style={s.barRow}>
      <Text style={s.barLbl}>{m.label}</Text>
      <View style={s.track}><View style={[s.fill, { width: `${m.percentile ?? 0}%`, backgroundColor: barColor(m.percentile) }]} /></View>
      <Text style={[s.barPct, { color: barColor(m.percentile) }]}>{m.percentile ?? "—"}</Text>
      <Text style={s.barVal}>{fmtV(m.value)}</Text>
    </View>
  );
}

function PlayerSection({ p, lang }: { p: PdfPlayer; lang: Lang }) {
  const { analysis: a, prose } = p;
  const isIS = lang === "IS";
  const cats: Category[] = ["attacking", "possession", "defending"];

  // Goalkeeper: outfield per-90 metrics don't describe a keeper → a labelled note, no bars.
  if (a.goalkeeper) {
    return (
      <View style={s.player} wrap={false}>
        <View style={s.phead}>
          <Text style={s.pname}>{a.player}</Text>
          <Text style={s.gkTag}>{isIS ? "MARKMAÐUR" : "GOALKEEPER"}</Text>
          <Text style={s.mins}>{a.minutes != null ? `${Math.round(a.minutes)} ${isIS ? "mín" : "min"}` : ""}</Text>
        </View>
        <Text style={s.gkNote}>
          {isIS ? "Útspila-mælarnir (sókn / boltahald / vörn) lýsa ekki markmanni, svo hann er ekki raðaður hér." : "The outfield per-90 metrics (attacking / possession / defending) don't describe a keeper, so he isn't ranked here."}
        </Text>
      </View>
    );
  }

  return (
    <View style={s.player}>
      {/* Keep the header + AI read together; the bar groups may flow to the next page. */}
      <View wrap={false}>
        <View style={s.phead}>
          <Text style={s.pname}>{a.player}</Text>
          {a.role ? <Text style={s.role}>{(isIS ? CAT_LABEL[a.role].IS : CAT_LABEL[a.role].EN).toUpperCase()}</Text> : null}
          <Text style={s.mins}>{a.minutes != null ? `${Math.round(a.minutes)} ${isIS ? "mín" : "min"}` : ""} · {a.poolSize} {isIS ? "leikmenn vs þeirra lið" : "players vs their squad"}</Text>
        </View>
        {prose ? (
          <View style={s.ai}>
            <Text style={s.aiTag}>{isIS ? "AI · skrifað úr tölunum, ákveður ekkert" : "AI · written from the numbers, decides nothing"}</Text>
            {prose.summary ? <Text style={s.aiSummary}>{prose.summary}</Text> : null}
            {prose.threat ? <Text style={s.aiPara}><Text style={s.aiLbl}>{isIS ? "Ógn. " : "Threat. "}</Text>{prose.threat}</Text> : null}
            {prose.howToStop ? <Text style={s.aiPara}><Text style={s.aiLbl}>{isIS ? "Hvernig á að stöðva hann. " : "How to stop him. "}</Text>{prose.howToStop}</Text> : null}
          </View>
        ) : null}
      </View>

      {cats.map((c) => {
        const rows = a.metrics.filter((m) => m.category === c);
        if (!rows.length) return null;
        return (
          <View key={c}>
            <View style={s.catTitle}>
              <Text style={s.catName}>{isIS ? CAT_LABEL[c].IS : CAT_LABEL[c].EN}</Text>
              <Text style={s.catPct}>{a.byCategory[c] != null ? `${a.byCategory[c]} ${isIS ? "percentíl vs lið" : "percentile vs squad"}` : ""}</Text>
            </View>
            {rows.map((m) => <BarRow key={m.key} m={m} />)}
          </View>
        );
      })}
    </View>
  );
}

export function Doc({ opponent, season, players, lang }: { opponent: string; season: string; players: PdfPlayer[]; lang: Lang }) {
  const isIS = lang === "IS";
  const pool = players[0]?.analysis.poolSize ?? players.length;
  const anyProse = players.some((p) => p.prose);
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.h1}>{opponent} — {isIS ? "leikmanna-greining" : "player scouting"} {season}</Text>
        <Text style={s.sub}>{isIS ? "Hver leikmaður raðaður innan síns eigin liðs" : "Every player ranked within their own squad"}</Text>
        <Text style={s.byline}>
          {isIS ? "Unnið fyrir þjálfarateymið" : "Prepared for the coaching staff"} · MicroPulse · {players.length} {isIS ? "leikmenn" : "players"} · {isIS ? `laug ${pool}` : `pool ${pool}`} · StatsBomb per-90
          {anyProse ? ` · AI · ${isIS ? "AI skrifaði úr tölunum — ákveður ekkert" : "AI-written from the numbers — decides nothing"}` : ""}
        </Text>

        {players.map((p) => <PlayerSection key={p.analysis.player} p={p} lang={lang} />)}

        <Text style={s.foot}>
          {isIS
            ? "Percentílar eru vs leikmenn andstæðingsins sjálfs (grænt = topp 25%, rautt = neðstu 25%), úr StatsBomb per-90 tímabils-tölum. Reglur reikna tölurnar; AI orðar þær aðeins og er merkt AI. Hlutverk = flokkurinn sem leikmaður raðast hæst í. Fáar mínútur = lítið úrtak. Lýsandi samhengi — snertir aldrei readiness-litinn né daglegu ákvörðunina."
            : "Percentiles are vs the opponent's own players (green = top 25%, red = bottom 25%), from StatsBomb per-90 season stats. Rules compute the numbers; the AI only phrases them and is labelled AI. Role = the category a player rates highest in. Low minutes = a small sample. Descriptive context — it never touches the readiness colour or the daily decision."}
        </Text>
      </Page>
    </Document>
  );
}

export async function downloadOpponentPlayersPdf(opponent: string, season: string, players: PdfPlayer[], lang: Lang) {
  const blob = await pdf(<Doc opponent={opponent} season={season} players={players} lang={lang} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${opponent.replace(/\s+/g, "-")}-players-${season}.pdf`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
