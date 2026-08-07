"use client";

/**
 * OpponentPlayersPdf — a one-document scouting read of the OPPONENT's WHOLE squad,
 * one block per player: role, minutes, category percentiles, top threats (high
 * percentiles) and how-to-stop openings (low percentiles), ranked WITHIN their own
 * squad. Built deterministically from buildPlayerAnalysis (rules decide; this only
 * lays them out — no AI, no new data). Descriptive scouting context only — it never
 * touches the readiness colour or the daily decision.
 */

import { Document, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import type { PlayerAnalysis, Category, MetricRow } from "@/lib/micropulse/playerAnalysis";

type Lang = "EN" | "IS";
const INK = "#14181c", MUTE = "#5c6570", LINE = "#e5e7eb", COBALT = "#2740e6";
const GREEN = "#1c7a4a", RED = "#a83e28", BARBG = "#e7e9ee";

const barColor = (p: number | null): string => (p == null ? BARBG : p >= 75 ? GREEN : p <= 25 ? RED : COBALT);

const s = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 42, paddingHorizontal: 46, fontSize: 9.5, color: INK, fontFamily: "Helvetica", lineHeight: 1.4 },
  h1: { fontSize: 17, fontFamily: "Helvetica-Bold" },
  sub: { fontSize: 11, fontFamily: "Helvetica-Bold", color: COBALT, marginTop: 3 },
  byline: { fontSize: 8.5, color: MUTE, fontFamily: "Helvetica-Oblique", marginTop: 3, marginBottom: 8 },
  card: { borderWidth: 1, borderColor: LINE, borderRadius: 5, padding: 9, marginBottom: 8 },
  phead: { flexDirection: "row", alignItems: "baseline", marginBottom: 5 },
  pname: { fontSize: 11.5, fontFamily: "Helvetica-Bold", flex: 1 },
  role: { fontSize: 8, fontFamily: "Helvetica-Bold", color: COBALT },
  mins: { fontSize: 8, color: MUTE, marginLeft: 6 },
  catRow: { flexDirection: "row", marginBottom: 4 },
  catCell: { flex: 1, marginRight: 8 },
  catLbl: { fontSize: 7, color: MUTE, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 1.5 },
  track: { height: 4, backgroundColor: BARBG, borderRadius: 2 },
  fill: { height: 4, borderRadius: 2 },
  catNum: { fontSize: 8, fontFamily: "Helvetica-Bold", marginTop: 1 },
  col2: { flexDirection: "row", marginTop: 3 },
  half: { flex: 1, paddingRight: 8 },
  tag: { fontSize: 7, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 },
  line: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 1 },
  metric: { fontSize: 8.5, flex: 1 },
  pct: { fontSize: 8.5, fontFamily: "Helvetica-Bold", width: 22, textAlign: "right" },
  none: { fontSize: 8, color: MUTE, fontFamily: "Helvetica-Oblique" },
  foot: { marginTop: 12, paddingTop: 8, borderTopWidth: 1, borderColor: LINE, fontSize: 7.5, color: MUTE, lineHeight: 1.5 },
});

const CAT_LABEL: Record<Category, { EN: string; IS: string }> = {
  attacking: { EN: "Attacking", IS: "Sókn" },
  possession: { EN: "Possession", IS: "Boltahald" },
  defending: { EN: "Defending", IS: "Vörn" },
};

function PlayerCard({ a, lang }: { a: PlayerAnalysis; lang: Lang }) {
  const isIS = lang === "IS";
  const cats: Category[] = ["attacking", "possession", "defending"];
  const threats = a.strengths.slice(0, 4);
  const stops = a.weaknesses.slice(0, 3);
  const line = (m: MetricRow) => (
    <View style={s.line} key={m.key}>
      <Text style={s.metric}>{m.label}</Text>
      <Text style={[s.pct, { color: barColor(m.percentile) }]}>{m.percentile ?? "—"}</Text>
    </View>
  );
  return (
    <View style={s.card} wrap={false}>
      <View style={s.phead}>
        <Text style={s.pname}>{a.player}</Text>
        {a.role ? <Text style={s.role}>{(isIS ? CAT_LABEL[a.role].IS : CAT_LABEL[a.role].EN).toUpperCase()}</Text> : null}
        <Text style={s.mins}>{a.minutes != null ? `${Math.round(a.minutes)} ${isIS ? "mín" : "min"}` : ""}</Text>
      </View>

      <View style={s.catRow}>
        {cats.map((c) => {
          const p = a.byCategory[c];
          return (
            <View style={s.catCell} key={c}>
              <Text style={s.catLbl}>{isIS ? CAT_LABEL[c].IS : CAT_LABEL[c].EN}</Text>
              <View style={s.track}><View style={[s.fill, { width: `${p ?? 0}%`, backgroundColor: barColor(p) }]} /></View>
              <Text style={s.catNum}>{p ?? "—"}</Text>
            </View>
          );
        })}
      </View>

      <View style={s.col2}>
        <View style={s.half}>
          <Text style={[s.tag, { color: GREEN }]}>{isIS ? "Ógn — háir percentílar" : "Threats — high percentiles"}</Text>
          {threats.length ? threats.map(line) : <Text style={s.none}>{isIS ? "Enginn topp-fjórðungs styrkur" : "No top-quartile strength"}</Text>}
        </View>
        <View style={s.half}>
          <Text style={[s.tag, { color: RED }]}>{isIS ? "Hvernig á að stöðva — lágir" : "How to stop — low percentiles"}</Text>
          {stops.length ? stops.map(line) : <Text style={s.none}>{isIS ? "Engin skýr veikleiki" : "No clear weakness"}</Text>}
        </View>
      </View>
    </View>
  );
}

export function Doc({ opponent, season, analyses, lang }: { opponent: string; season: string; analyses: PlayerAnalysis[]; lang: Lang }) {
  const isIS = lang === "IS";
  const pool = analyses[0]?.poolSize ?? analyses.length;
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.h1}>{opponent} — {isIS ? "leikmanna-greining" : "player scouting"} {season}</Text>
        <Text style={s.sub}>{isIS ? "Hver leikmaður raðaður innan síns eigin liðs" : "Every player ranked within their own squad"}</Text>
        <Text style={s.byline}>
          {isIS ? "Unnið fyrir þjálfarateymið" : "Prepared for the coaching staff"} · MicroPulse · {analyses.length} {isIS ? "leikmenn" : "players"} · {isIS ? `laug ${pool}` : `pool ${pool}`} · {isIS ? "StatsBomb per-90" : "StatsBomb per-90"}
        </Text>

        {analyses.map((a) => <PlayerCard key={a.player} a={a} lang={lang} />)}

        <Text style={s.foot}>
          {isIS
            ? "Percentílar eru vs leikmenn andstæðingsins sjálfs (grænt = topp 25%, rautt = neðstu 25%), úr StatsBomb per-90 tímabils-tölum. Reglur reikna tölurnar; skjalið raðar þeim aðeins upp — engin AI. Hlutverk = flokkurinn sem leikmaður raðast hæst í. Fáar mínútur = lítið úrtak. Lýsandi samhengi — snertir aldrei readiness-litinn né daglegu ákvörðunina."
            : "Percentiles are vs the opponent's own players (green = top 25%, red = bottom 25%), from StatsBomb per-90 season stats. Rules compute the numbers; this only lays them out — no AI. Role = the category a player rates highest in. Low minutes = a small sample. Descriptive context — it never touches the readiness colour or the daily decision."}
        </Text>
      </Page>
    </Document>
  );
}

export async function downloadOpponentPlayersPdf(opponent: string, season: string, analyses: PlayerAnalysis[], lang: Lang) {
  const blob = await pdf(<Doc opponent={opponent} season={season} analyses={analyses} lang={lang} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${opponent.replace(/\s+/g, "-")}-players-${season}.pdf`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
