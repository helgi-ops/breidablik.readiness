"use client";

/**
 * BasketballOpponentPdf — the opponent scouting report as a downloadable PDF:
 * team profile, Four Factors (how they played you), shot map (Paint/Mid/3PT), how
 * they score (playtypes + efficiency), how to defend, and key players with a plain
 * "how he plays" line. Built from your head-to-head InStat games (or a KKÍ season).
 * Descriptive scouting — never touches readiness. WinAnsi/Helvetica (Icelandic-safe):
 * ASCII hyphen only, no arrows / ticks / U+2212.
 */

import { Document, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import { shotLabel, type Lang } from "@/lib/micropulse/basketballStats/shotLabels";

type ShotType = { key: string; made: number; att: number; pct: number | null };
type CourtRegion = { key: "paint" | "mid" | "three"; made: number; att: number; pct: number | null };
type FourFactors = { efgPct: number | null; toPct: number | null; orebPct: number | null; ftf: number | null; ppp: number | null; games: number } | null;
type Team = { ppg: number | null; fgPct: number | null; tpPct: number | null; tpaPg: number | null; reb: number | null; ast: number | null; tov: number | null; homePpg: number | null; awayPpg: number | null } | null;
type Player = { name: string; ppg: number | null; rpg: number | null; apg: number | null; fgPct: number | null; tpPct: number | null; tpaPg: number | null; descriptor?: { en: string; is: string } };
type Defend = { en: string; is: string; evidence?: string };

export type BasketballOpponentPdfData = {
  opponentName: string;
  source: "instat" | "kki" | null;
  games: number | null;
  team: Team;
  fourFactors: FourFactors;
  courtRegions: CourtRegion[] | null;
  playtypes: ShotType[] | null;
  efficiency: ShotType[] | null;
  howToDefend: Defend[];
  keyPlayers: Player[];
  ai: { headline?: string; summary?: string; strengths?: string[]; weaknesses?: string[]; keyPlayers?: { name: string; note: string }[]; howToDefend?: string[]; howToAttack?: string[] } | null;
};

const INK = "#14181c", MUTE = "#6b7280", LINE = "#e5e7eb", COBALT = "#2740e6", AMBER = "#a86a12";
const clean = (s: unknown) => String(s ?? "").replace(/[‘’]/g, "'").replace(/[“”„]/g, '"').replace(/[–—−]/g, "-").replace(/[▲▼✓→⛨]/g, "");
const pct = (v: number | null | undefined) => (v == null ? "-" : `${v.toFixed(1)}%`);
const d1 = (v: number | null | undefined) => (v == null ? "-" : v.toFixed(1));

const st = StyleSheet.create({
  page: { paddingTop: 26, paddingBottom: 34, paddingHorizontal: 34, fontSize: 9.5, fontFamily: "Helvetica", color: INK, lineHeight: 1.4 },
  kicker: { fontSize: 8, color: COBALT, fontFamily: "Helvetica-Bold", letterSpacing: 0.8, marginBottom: 3 },
  h1: { fontSize: 16, fontFamily: "Helvetica-Bold" },
  sub: { fontSize: 10, color: MUTE, marginTop: 2, marginBottom: 8 },
  h2: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 10, marginBottom: 3 },
  h3: { fontSize: 8, color: COBALT, fontFamily: "Helvetica-Bold", letterSpacing: 0.6, marginTop: 6, marginBottom: 2 },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: LINE, paddingVertical: 1.6 },
  cL: { flex: 1, color: "#333" }, cR: { width: 120, textAlign: "right", fontFamily: "Helvetica-Bold" },
  ffRow: { flexDirection: "row", marginTop: 3 },
  ffCell: { flex: 1 }, ffLbl: { fontSize: 7.5, color: MUTE, fontFamily: "Helvetica-Bold" }, ffVal: { fontSize: 12, fontFamily: "Helvetica-Bold" },
  li: { flexDirection: "row", marginBottom: 2 }, bullet: { width: 10, fontFamily: "Helvetica-Bold" }, liTxt: { flex: 1, color: "#222" },
  ev: { fontSize: 8, color: MUTE, marginLeft: 10, marginBottom: 2 },
  foot: { position: "absolute", bottom: 18, left: 34, right: 34, fontSize: 7.5, color: MUTE, borderTopWidth: 1, borderTopColor: LINE, paddingTop: 4 },
});

const T = {
  EN: { kicker: "OPPONENT SCOUTING - INSTAT", profile: "Team profile", ff: "How they played you (Four Factors)", zones: "Shot map (paint / mid-range / 3PT)", scored: "How they score", playtypes: "FG playtypes", eff: "Offensive-efficiency types", defend: "How to defend", players: "Key players", them: "Opp", foot: "Descriptive opponent scouting from imported InStat Game Reports. It does not decide anything and never changes a readiness verdict." },
  IS: { kicker: "ANDSTAEDINGA-SKANNUN - INSTAT", profile: "Lidsprofill", ff: "Hvernig their spiludu ykkur (Four Factors)", zones: "Skotkort (teigur / midsvaedi / thristar)", scored: "Hvernig their skora", playtypes: "Soknartegundir", eff: "Soknargerd (efficiency)", defend: "Hvernig a ad verjast", players: "Lykilmenn", them: "Andst.", foot: "Lysandi andstaedinga-skannun ur InStat leikskyrslum. Akvedur ekkert og breytir aldrei readiness-domi." },
} as const;

const regionLabel = (key: CourtRegion["key"], lang: Lang) =>
  key === "paint" ? (lang === "IS" ? "Teigur" : "Paint") : key === "mid" ? (lang === "IS" ? "Midsvaedi" : "Mid-range") : "3PT";

function Doc({ data, lang }: { data: BasketballOpponentPdfData; lang: Lang }) {
  const t = T[lang];
  const team = data.team;
  return (
    <Document>
      <Page size="A4" style={st.page}>
        <Text style={st.kicker}>{t.kicker}{data.source === "kki" ? " / KKI" : ""}</Text>
        <Text style={st.h1}>{clean(data.opponentName)}</Text>
        <Text style={st.sub}>{data.games != null ? `${data.games} ${lang === "IS" ? "leikir" : "games"}` : ""}{data.source === "instat" ? `  -  ${lang === "IS" ? "ur ykkar innbyrdis InStat-leikjum" : "from your head-to-head InStat games"}` : ""}</Text>

        {data.ai ? (
          <View style={{ borderWidth: 1, borderColor: "#c9d0f7", backgroundColor: "#eef0fb", borderRadius: 4, padding: 9, marginBottom: 9 }}>
            <Text style={{ fontSize: 8, color: COBALT, fontFamily: "Helvetica-Bold", letterSpacing: 0.6, marginBottom: 3 }}>{lang === "IS" ? "AI - LES TOLUR, AKVEDUR EKKERT" : "AI - READS THE NUMBERS, DECIDES NOTHING"}</Text>
            {data.ai.headline ? <Text style={{ fontSize: 11, fontFamily: "Helvetica-Bold" }}>{clean(data.ai.headline)}</Text> : null}
            {data.ai.summary ? <Text style={{ fontSize: 9.5, color: "#333", marginTop: 4 }}>{clean(data.ai.summary)}</Text> : null}
            {data.ai.howToDefend?.length ? (<><Text style={st.h3}>{lang === "IS" ? "Hvernig a ad verjast" : "How to defend"}</Text>{data.ai.howToDefend.map((x, i) => <View key={i} style={st.li}><Text style={st.bullet}>{"•"}</Text><Text style={st.liTxt}>{clean(x)}</Text></View>)}</>) : null}
            {data.ai.howToAttack?.length ? (<><Text style={st.h3}>{lang === "IS" ? "Hvar a ad saekja" : "Where to attack"}</Text>{data.ai.howToAttack.map((x, i) => <View key={i} style={st.li}><Text style={st.bullet}>{"•"}</Text><Text style={st.liTxt}>{clean(x)}</Text></View>)}</>) : null}
          </View>
        ) : null}

        {team ? (
          <><Text style={st.h2}>{t.profile}</Text>
            {([
              [lang === "IS" ? "Stig/leik" : "PPG", d1(team.ppg)],
              [lang === "IS" ? "Skotnyting" : "FG%", pct(team.fgPct)],
              ["3P%", pct(team.tpPct)],
              [lang === "IS" ? "3ja tilr./leik" : "3PA/g", d1(team.tpaPg)],
              [lang === "IS" ? "Frakost" : "REB", d1(team.reb)],
              [lang === "IS" ? "Stodsend." : "AST", d1(team.ast)],
              [lang === "IS" ? "Tapadir" : "TOV", d1(team.tov)],
              [lang === "IS" ? "Heima/Uti stig" : "Home/Away pts", `${d1(team.homePpg)} / ${d1(team.awayPpg)}`],
            ] as const).map(([l, v]) => (
              <View key={l} style={st.row}><Text style={st.cL}>{l}</Text><Text style={st.cR}>{v}</Text></View>
            ))}
          </>
        ) : null}

        {data.fourFactors ? (
          <><Text style={st.h2}>{t.ff}</Text>
            <View style={st.ffRow}>
              {([["eFG%", pct(data.fourFactors.efgPct)], ["TO%", pct(data.fourFactors.toPct)], ["OREB%", pct(data.fourFactors.orebPct)], ["FTF", pct(data.fourFactors.ftf)], ["PPP", d1(data.fourFactors.ppp)]] as const).map(([l, v]) => (
                <View key={l} style={st.ffCell}><Text style={st.ffLbl}>{l}</Text><Text style={st.ffVal}>{v}</Text></View>
              ))}
            </View>
          </>
        ) : null}

        {data.courtRegions && data.courtRegions.length ? (
          <><Text style={st.h2}>{t.zones}</Text>{data.courtRegions.map((r) => (
            <View key={r.key} style={st.row}><Text style={st.cL}>{regionLabel(r.key, lang)}</Text><Text style={st.cR}>{r.made}-{r.att}{r.pct != null ? `  ${r.pct}%` : ""}</Text></View>
          ))}</>
        ) : null}

        {(data.playtypes && data.playtypes.length) || (data.efficiency && data.efficiency.length) ? (
          <><Text style={st.h2}>{t.scored}</Text>
            {data.playtypes && data.playtypes.length ? (<><Text style={st.h3}>{t.playtypes}</Text>{data.playtypes.slice(0, 8).map((r) => (
              <View key={r.key} style={st.row}><Text style={st.cL}>{clean(shotLabel(r.key, lang))}</Text><Text style={st.cR}>{r.made}-{r.att}{r.pct != null ? `  ${r.pct}%` : ""}</Text></View>
            ))}</>) : null}
            {data.efficiency && data.efficiency.length ? (<><Text style={st.h3}>{t.eff}</Text>{data.efficiency.map((r) => (
              <View key={r.key} style={st.row}><Text style={st.cL}>{clean(shotLabel(r.key, lang))}</Text><Text style={st.cR}>{r.made}-{r.att}{r.pct != null ? `  ${r.pct}%` : ""}</Text></View>
            ))}</>) : null}
          </>
        ) : null}

        {data.howToDefend && data.howToDefend.length ? (
          <><Text style={[st.h2, { color: AMBER }]}>{t.defend}</Text>{data.howToDefend.map((f, i) => (
            <View key={i}>
              <View style={st.li}><Text style={st.bullet}>{"•"}</Text><Text style={st.liTxt}>{clean(lang === "IS" ? f.is : f.en)}</Text></View>
              {f.evidence ? <Text style={st.ev}>{clean(f.evidence)}</Text> : null}
            </View>
          ))}</>
        ) : null}

        {data.keyPlayers && data.keyPlayers.length ? (
          <><Text style={st.h2}>{t.players}</Text>{data.keyPlayers.slice(0, 6).map((p, i) => (
            <View key={i} style={{ marginBottom: 3 }}>
              <Text><Text style={{ fontFamily: "Helvetica-Bold" }}>{clean(p.name)}</Text> <Text style={{ color: MUTE }}>{d1(p.ppg)} PPG · {d1(p.rpg)} REB · {d1(p.apg)} AST · {pct(p.tpPct)} 3P ({d1(p.tpaPg)}/g)</Text></Text>
              {p.descriptor ? <Text style={{ fontSize: 8.5, color: "#333" }}>{clean(lang === "IS" ? p.descriptor.is : p.descriptor.en)}</Text> : null}
            </View>
          ))}</>
        ) : null}

        <Text style={st.foot} fixed>{t.foot}</Text>
      </Page>
    </Document>
  );
}

export async function downloadBasketballOpponentPdf(data: BasketballOpponentPdfData, lang: Lang) {
  const blob = await pdf(<Doc data={data} lang={lang} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const base = clean(data.opponentName).replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "") || "opponent";
  a.href = url; a.download = `${base}-scouting.pdf`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
