"use client";

/**
 * BasketballMatchPdf — the single-game InStat read as a downloadable PDF: the AI
 * game summary (how it went + what decided it) followed by the numbers it reasons
 * from — Four Factors, per-quarter, how we scored (playtypes + efficiency), shot
 * zones, opponent players and lineups. AI is labelled AS AI and cites the data;
 * descriptive — never touches readiness. WinAnsi/Helvetica (Icelandic-safe): ASCII
 * hyphen only, no arrows / ticks / U+2212.
 */

import { Document, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import { shotLabel, zoneLabel, type Lang } from "@/lib/micropulse/basketballStats/shotLabels";

type MA = { m: number | null; a: number | null };
type ShotTypeAgg = { key: string; made: number; att: number; pct: number | null };
type ZoneAgg = { key: string; made: number; att: number; pct: number | null };
type FactorAvg = { efgPct: number | null; toPct: number | null; orebPct: number | null; ftf: number | null; ppp: number | null };
type OppPlayer = { name: string; minutes: number | null; points: number | null; fg: MA; threePt: MA };
type Lineup = { players: string[]; minutes: number | null; plusMinus: number | null; pointsFor: number | null; pointsAgainst: number | null };

export type BasketballMatchPdfData = {
  match: { ownName?: string | null; opponent: string | null; ownPoints: number | null; oppPoints: number | null; date: string | null };
  fourFactors: { own: FactorAvg; opp: FactorAvg } | null;
  quarters: { own: (number | null)[]; opp: (number | null)[] } | null;
  tacticalShots: { playtypes: ShotTypeAgg[]; efficiency: ShotTypeAgg[] } | null;
  shotZones: { team: ZoneAgg[] } | null;
  courtRegions: { key: "paint" | "mid" | "three"; made: number; att: number; pct: number | null }[] | null;
  oppPlayers: { team: string | null; players: OppPlayer[] } | null;
  lineups: Lineup[] | null;
};
export type BasketballAiSummary = {
  headline?: string; result?: string; summary?: string;
  decisiveFactors?: { factor: string; detail: string }[];
  quarterFlow?: string;
  keyPlayers?: { name: string; note: string }[];
  opponentThreats?: { name: string; note: string }[];
  takeaways?: string[];
};

const INK = "#14181c", MUTE = "#6b7280", LINE = "#e5e7eb", COBALT = "#2740e6";
const clean = (s: unknown) => String(s ?? "").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—−]/g, "-").replace(/[▲▼✓→]/g, "");
const maS = (c: MA) => (c.m == null && c.a == null ? "-" : `${c.m ?? 0}-${c.a ?? 0}`);
const pct = (v: number | null | undefined) => (v == null ? "-" : `${v.toFixed(1)}%`);
const d1 = (v: number | null | undefined) => (v == null ? "-" : v.toFixed(1));

const st = StyleSheet.create({
  page: { paddingTop: 26, paddingBottom: 34, paddingHorizontal: 34, fontSize: 9.5, fontFamily: "Helvetica", color: INK, lineHeight: 1.4 },
  kicker: { fontSize: 8, color: COBALT, fontFamily: "Helvetica-Bold", letterSpacing: 0.8, marginBottom: 3 },
  h1: { fontSize: 16, fontFamily: "Helvetica-Bold" },
  sub: { fontSize: 10, color: MUTE, marginTop: 2, marginBottom: 8 },
  vbox: { borderWidth: 1, borderColor: "#c9d0f7", backgroundColor: "#eef0fb", borderRadius: 4, padding: 9, marginBottom: 9 },
  vlabel: { fontSize: 8, color: COBALT, fontFamily: "Helvetica-Bold", letterSpacing: 0.6, marginBottom: 2 },
  h2: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 10, marginBottom: 3 },
  h3: { fontSize: 8, color: COBALT, fontFamily: "Helvetica-Bold", letterSpacing: 0.6, marginTop: 6, marginBottom: 2 },
  para: { fontSize: 9.5, color: "#222", marginBottom: 2 },
  li: { flexDirection: "row", marginBottom: 1.5 },
  bullet: { width: 10, fontFamily: "Helvetica-Bold" },
  liTxt: { flex: 1, color: "#222" },
  twoCol: { flexDirection: "row", gap: 14 },
  col: { flex: 1 },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: LINE, paddingVertical: 1.6 },
  cL: { flex: 1, color: "#333" },
  cR: { width: 130, textAlign: "right", fontFamily: "Helvetica-Bold" },
  ffRow: { flexDirection: "row", marginTop: 3 },
  ffCell: { flex: 1 },
  ffLbl: { fontSize: 7.5, color: MUTE, fontFamily: "Helvetica-Bold" },
  ffVal: { fontSize: 12, fontFamily: "Helvetica-Bold" },
  ffOpp: { fontSize: 8, color: MUTE },
  pRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: LINE, paddingVertical: 1.6 },
  pName: { flex: 1 }, pNum: { width: 40, textAlign: "right", fontFamily: "Helvetica-Bold" }, pShot: { width: 60, textAlign: "right", color: "#333" },
  foot: { position: "absolute", bottom: 18, left: 34, right: 34, fontSize: 7.5, color: MUTE, borderTopWidth: 1, borderTopColor: LINE, paddingTop: 4 },
});

const T = {
  EN: { kicker: "SINGLE MATCH ANALYSIS - INSTAT", ai: "AI - READS THE NUMBERS, DECIDES NOTHING", overview: "OVERVIEW", decided: "What decided it", flow: "How it flowed", ourPl: "Our key players", oppThreat: "Opponent threats", takeaways: "Takeaways", ff: "Four Factors (us vs opponent)", byQ: "By quarter", scored: "How we scored", playtypes: "FG playtypes", eff: "Offensive-efficiency types", zones: "Shot zones", opp: "Opponent players", lineups: "Lineups (net +/-)", min: "Min", pts: "Pts", us: "Us", them: "Opp", foot: "InStat single-game read. The AI summary is AI-generated from these numbers, is labelled as such, and decides nothing - it never changes a readiness verdict." },
  IS: { kicker: "STAKUR LEIKUR - INSTAT", ai: "AI - LES TOLUR, AKVEDUR EKKERT", overview: "YFIRLIT", decided: "Hvad red urslitum", flow: "Framvinda leiksins", ourPl: "Okkar lyklar", oppThreat: "Haettulegastir hja andstaedingi", takeaways: "Laerdomar", ff: "Four Factors (vid vs andstaedingur)", byQ: "Eftir leikhluta", scored: "Hvernig vid skorudum", playtypes: "Soknartegundir", eff: "Soknargerd (efficiency)", zones: "Skotsvaedi", opp: "Andstaedingur - leikmenn", lineups: "Fimmundir (net +/-)", min: "Min", pts: "Stig", us: "Vid", them: "Andst.", foot: "InStat stakur-leiks lestur. AI-samantektin er gerd af gervigreind ur thessum tolum, merkt sem slik og akvedur ekkert - breytir aldrei readiness-domi." },
} as const;

function Doc({ data, ai, lang }: { data: BasketballMatchPdfData; ai: BasketballAiSummary | null; lang: Lang }) {
  const t = T[lang];
  const m = data.match;
  const title = `${clean(m.ownName ?? (lang === "IS" ? "Okkar lid" : "Our team"))} ${m.ownPoints ?? "-"} - ${m.oppPoints ?? "-"} ${clean(m.opponent ?? "-")}`;
  const q = data.quarters;
  return (
    <Document>
      <Page size="A4" style={st.page}>
        <Text style={st.kicker}>{t.kicker}</Text>
        <Text style={st.h1}>{title}</Text>
        <Text style={st.sub}>{clean(m.date ?? "")}</Text>

        {ai ? (
          <>
            <Text style={st.kicker}>{t.ai}</Text>
            {ai.headline ? <View style={st.vbox}><Text style={st.vlabel}>{t.overview}</Text><Text style={{ fontSize: 11, fontFamily: "Helvetica-Bold" }}>{clean(ai.headline)}</Text>{ai.summary ? <Text style={{ fontSize: 9.5, color: "#333", marginTop: 4 }}>{clean(ai.summary)}</Text> : null}</View> : (ai.summary ? <View style={st.vbox}><Text style={st.vlabel}>{t.overview}</Text><Text style={{ fontSize: 9.5, color: "#333" }}>{clean(ai.summary)}</Text></View> : null)}

            {ai.decisiveFactors && ai.decisiveFactors.length ? (
              <><Text style={st.h2}>{t.decided}</Text>
                {ai.decisiveFactors.map((f, i) => (
                  <View key={i} style={st.li}><Text style={st.bullet}>{"•"}</Text><Text style={st.liTxt}><Text style={{ fontFamily: "Helvetica-Bold" }}>{clean(f.factor)}: </Text>{clean(f.detail)}</Text></View>
                ))}
              </>
            ) : null}

            {ai.quarterFlow ? (<><Text style={st.h2}>{t.flow}</Text><Text style={st.para}>{clean(ai.quarterFlow)}</Text></>) : null}

            {(ai.keyPlayers?.length || ai.opponentThreats?.length) ? (
              <View style={st.twoCol}>
                <View style={st.col}><Text style={st.h3}>{t.ourPl}</Text>{(ai.keyPlayers ?? []).map((p, i) => <View key={i} style={st.li}><Text style={st.bullet}>{"•"}</Text><Text style={st.liTxt}><Text style={{ fontFamily: "Helvetica-Bold" }}>{clean(p.name)}</Text>{p.note ? ` - ${clean(p.note)}` : ""}</Text></View>)}</View>
                <View style={st.col}><Text style={st.h3}>{t.oppThreat}</Text>{(ai.opponentThreats ?? []).map((p, i) => <View key={i} style={st.li}><Text style={st.bullet}>{"•"}</Text><Text style={st.liTxt}><Text style={{ fontFamily: "Helvetica-Bold" }}>{clean(p.name)}</Text>{p.note ? ` - ${clean(p.note)}` : ""}</Text></View>)}</View>
              </View>
            ) : null}

            {ai.takeaways && ai.takeaways.length ? (<><Text style={st.h2}>{t.takeaways}</Text>{ai.takeaways.map((x, i) => <View key={i} style={st.li}><Text style={st.bullet}>{"•"}</Text><Text style={st.liTxt}>{clean(x)}</Text></View>)}</>) : null}
          </>
        ) : null}

        {data.fourFactors ? (
          <><Text style={st.h2}>{t.ff}</Text>
            <View style={st.ffRow}>
              {([["eFG%", "efgPct", true], ["TO%", "toPct", true], ["OREB%", "orebPct", true], ["FTF", "ftf", true], ["PPP", "ppp", false]] as const).map(([lbl, key, isPct]) => (
                <View key={lbl} style={st.ffCell}>
                  <Text style={st.ffLbl}>{lbl}</Text>
                  <Text style={st.ffVal}>{isPct ? pct(data.fourFactors!.own[key]) : d1(data.fourFactors!.own[key])}</Text>
                  <Text style={st.ffOpp}>{t.them} {isPct ? pct(data.fourFactors!.opp[key]) : d1(data.fourFactors!.opp[key])}</Text>
                </View>
              ))}
            </View>
          </>
        ) : null}

        {q ? (
          <><Text style={st.h2}>{t.byQ}</Text>
            <View style={st.row}><Text style={st.cL}>{t.us}</Text><Text style={st.cR}>{q.own.map((x) => d1(x)).join("   ")}</Text></View>
            <View style={st.row}><Text style={st.cL}>{t.them}</Text><Text style={st.cR}>{q.opp.map((x) => d1(x)).join("   ")}</Text></View>
          </>
        ) : null}

        {data.tacticalShots && (data.tacticalShots.playtypes.length || data.tacticalShots.efficiency.length) ? (
          <><Text style={st.h2}>{t.scored}</Text>
            {data.tacticalShots.playtypes.length ? (<><Text style={st.h3}>{t.playtypes}</Text>{data.tacticalShots.playtypes.slice(0, 8).map((r) => (
              <View key={r.key} style={st.row}><Text style={st.cL}>{clean(shotLabel(r.key, lang))}</Text><Text style={st.cR}>{r.made}-{r.att}{r.pct != null ? `  ${r.pct}%` : ""}</Text></View>
            ))}</>) : null}
            {data.tacticalShots.efficiency.length ? (<><Text style={st.h3}>{t.eff}</Text>{data.tacticalShots.efficiency.map((r) => (
              <View key={r.key} style={st.row}><Text style={st.cL}>{clean(shotLabel(r.key, lang))}</Text><Text style={st.cR}>{r.made}-{r.att}{r.pct != null ? `  ${r.pct}%` : ""}</Text></View>
            ))}</>) : null}
          </>
        ) : null}

        {data.courtRegions && data.courtRegions.length ? (
          <><Text style={st.h2}>{lang === "IS" ? "Skotkort (teigur / midsvaedi / thristar)" : "Shot map (paint / mid-range / 3PT)"}</Text>{data.courtRegions.map((r) => (
            <View key={r.key} style={st.row}><Text style={st.cL}>{r.key === "paint" ? (lang === "IS" ? "Teigur" : "Paint") : r.key === "mid" ? (lang === "IS" ? "Midsvaedi" : "Mid-range") : (lang === "IS" ? "Thristar" : "3PT")}</Text><Text style={st.cR}>{r.made}-{r.att}{r.pct != null ? `  ${r.pct}%` : ""}</Text></View>
          ))}</>
        ) : null}

        {data.shotZones && data.shotZones.team.length ? (
          <><Text style={st.h2}>{t.zones}</Text>{data.shotZones.team.map((z) => (
            <View key={z.key} style={st.row}><Text style={st.cL}>{clean(zoneLabel(z.key, lang))}</Text><Text style={st.cR}>{z.made}-{z.att}{z.pct != null ? `  ${z.pct}%` : ""}</Text></View>
          ))}</>
        ) : null}

        {data.oppPlayers && data.oppPlayers.players.length ? (
          <><Text style={st.h2}>{t.opp}{data.oppPlayers.team ? ` - ${clean(data.oppPlayers.team)}` : ""}</Text>
            <View style={[st.pRow, { borderBottomWidth: 0 }]}><Text style={[st.pName, { color: MUTE }]}>{lang === "IS" ? "Leikmadur" : "Player"}</Text><Text style={[st.pNum, { color: MUTE, fontFamily: "Helvetica" }]}>{t.pts}</Text><Text style={[st.pShot, { color: MUTE }]}>FG</Text><Text style={[st.pShot, { color: MUTE }]}>3PT</Text></View>
            {[...data.oppPlayers.players].sort((a, b) => (b.points ?? 0) - (a.points ?? 0)).map((p, i) => (
              <View key={i} style={st.pRow}><Text style={st.pName}>{clean(p.name)}</Text><Text style={st.pNum}>{p.points ?? "-"}</Text><Text style={st.pShot}>{maS(p.fg)}</Text><Text style={st.pShot}>{maS(p.threePt)}</Text></View>
            ))}
          </>
        ) : null}

        {data.lineups && data.lineups.length ? (
          <><Text style={st.h2}>{t.lineups}</Text>{[...data.lineups].sort((a, b) => (b.minutes ?? 0) - (a.minutes ?? 0)).slice(0, 10).map((l, i) => (
            <View key={i} style={st.row}><Text style={st.cL}>{clean(l.players.join(", "))}</Text><Text style={[st.cR, { color: (l.plusMinus ?? 0) > 0 ? "#1c7a4a" : (l.plusMinus ?? 0) < 0 ? "#a83e28" : INK }]}>{l.minutes != null ? `${l.minutes.toFixed(1)}m` : "-"}   {l.pointsFor ?? "-"}-{l.pointsAgainst ?? "-"}   {l.plusMinus == null ? "" : `${l.plusMinus > 0 ? "+" : ""}${l.plusMinus}`}</Text></View>
          ))}</>
        ) : null}

        <Text style={st.foot} fixed>{t.foot}</Text>
      </Page>
    </Document>
  );
}

export async function downloadBasketballMatchPdf(data: BasketballMatchPdfData, ai: BasketballAiSummary | null, lang: Lang) {
  const blob = await pdf(<Doc data={data} ai={ai} lang={lang} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const base = clean(`${data.match.ownName ?? "team"}-${data.match.opponent ?? "game"}-${data.match.date ?? ""}`).replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "") || "match";
  a.href = url; a.download = `${base}-instat.pdf`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
