"use client";

/**
 * ScoutReportPdf — a pre-match opponent scouting *article* the coach can print for
 * the staff. Written like the MicroPulse season articles: abstract → profile →
 * how they attack / defend → key players → how to hurt them → form → them-vs-you →
 * interpretation → caveats → references.
 *
 * Every sentence is composed deterministically from `buildOpponentReport` (rules
 * decide, this only lays them out — no AI, no new data). Descriptive context only:
 * it never touches the readiness colour, the daily decision, or the training plan.
 */

import { Document, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import type { OpponentReport, Bi, Cited } from "@/lib/micropulse/scouting/opponentReport";

type Lang = "EN" | "IS";
const INK = "#14181c", MUTE = "#5c6570", LINE = "#e5e7eb", COBALT = "#2740e6", SHADE = "#eef0fb";

const s = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 42, paddingHorizontal: 46, fontSize: 9.5, color: INK, fontFamily: "Helvetica", lineHeight: 1.45 },
  h1: { fontSize: 17, fontFamily: "Helvetica-Bold" },
  sub: { fontSize: 11, fontFamily: "Helvetica-Bold", color: COBALT, marginTop: 3 },
  byline: { fontSize: 8.5, color: MUTE, fontFamily: "Helvetica-Oblique", marginTop: 3, marginBottom: 2 },
  abstract: { borderLeftWidth: 3, borderColor: COBALT, paddingLeft: 10, marginTop: 10, marginBottom: 2 },
  sec: { marginTop: 13, marginBottom: 3, fontSize: 8, fontFamily: "Helvetica-Bold", color: COBALT, textTransform: "uppercase", letterSpacing: 0.7 },
  verdict: { fontSize: 10.5, fontFamily: "Helvetica-Bold" },
  facts: { marginTop: 2, color: MUTE },
  para: { marginTop: 3 },
  rec: { marginTop: 3, flexDirection: "row" },
  recDot: { width: 11, color: COBALT, fontFamily: "Helvetica-Bold" },
  row: { flexDirection: "row", borderTopWidth: 1, borderColor: LINE, paddingVertical: 2.5 },
  hrow: { flexDirection: "row", backgroundColor: SHADE, paddingVertical: 2.5 },
  c1: { flex: 1 }, cN: { width: 58, textAlign: "right" }, cNb: { width: 58, textAlign: "right", fontFamily: "Helvetica-Bold" },
  th: { fontFamily: "Helvetica-Bold", fontSize: 8.5 },
  foot: { marginTop: 16, paddingTop: 8, borderTopWidth: 1, borderColor: LINE, fontSize: 7.5, color: MUTE, lineHeight: 1.5 },
  ref: { fontSize: 7.5, color: MUTE, marginTop: 3 },
});

const pick = (b: Bi, lang: Lang) => b[lang.toLowerCase() as "en" | "is"];
const f1 = (v: number | null | undefined): string => (v == null ? "—" : v.toFixed(1));
const fi = (v: number | null | undefined): string => (v == null ? "—" : String(Math.round(v)));
// Percentages and whole counts read as integers; per-match rates keep one decimal.
const PCT = new Set(["possession", "defDuelsWonPct", "crossAccPct", "offensiveDuelsWonPct", "forwardPassAccPct", "passesFinalThirdAccPct"]);
const COUNT = new Set(["minutes", "goals", "assists"]);
const fm = (metric: string, v: number | null | undefined): string =>
  v == null ? "—" : PCT.has(metric) || COUNT.has(metric) ? fi(v) : f1(v);

function Doc({ report, lang, label }: { report: OpponentReport; lang: Lang; label: (k: string) => string }) {
  const isIS = lang === "IS";
  const factLine = (facts: Cited[]) =>
    facts.map((c) => `${label(c.metric)} ${fm(c.metric, c.value)}${c.league != null ? ` (${isIS ? "deild" : "lg"} ${fm(c.metric, c.league)})` : ""}`).join("   ·   ");

  // Abstract + interpretation are composed from the deterministic block verdicts.
  const abstract = [report.identity.verdict, report.attack.verdict, report.defend.verdict, report.keyPlayers.available ? report.keyPlayers.verdict : null]
    .filter(Boolean).map((b) => pick(b as Bi, lang)).join(" ");
  const interpretation = [report.defend.verdict, report.matchup.verdict, report.form.verdict]
    .map((b) => pick(b, lang)).join(" ");

  // Profile table: them / league / you, from block facts (+ matchup for "you").
  const factMap: Record<string, Cited> = {};
  [...report.identity.facts, ...report.attack.facts, ...report.defend.facts].forEach((c) => { factMap[c.metric] = c; });
  const youMap: Record<string, number | null> = {};
  report.matchup.rows.forEach((r) => { youMap[r.metric] = r.you; });
  const PROFILE = ["xgf", "gf", "xga", "ga", "shots", "shotsAgainst", "possession", "ppda", "defDuelsWonPct", "passesFinalThird", "crosses"];
  const profileRows = PROFILE
    .filter((k) => factMap[k] && factMap[k].value != null)
    .map((k) => ({ metric: k, them: factMap[k].value, league: factMap[k].league ?? null, you: youMap[k] ?? null }));

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.h1}>{report.opponent} — {isIS ? "andstæðingagreining" : "opponent scouting"} {report.season}</Text>
        <Text style={s.sub}>{isIS ? "Hvað leiktölfræðin segir — og hvar á að meiða þá" : "What the match stats say — and where to hurt them"}</Text>
        <Text style={s.byline}>
          {isIS ? "Unnið fyrir þjálfarateymið" : "Prepared for the coaching staff"} · MicroPulse · {report.matches} {isIS ? "leikir" : "matches"}
          {report.record ? ` (${report.record.w}${isIS ? "S" : "W"} ${report.record.d}${isIS ? "J" : "D"} ${report.record.l}${isIS ? "T" : "L"})` : ""}
        </Text>

        <View style={s.abstract}>
          <Text><Text style={{ fontFamily: "Helvetica-Bold" }}>{isIS ? "Útdráttur. " : "Summary. "}</Text>{abstract}</Text>
        </View>

        <Text style={s.sec}>{isIS ? "Prófíll — þeir vs deild vs þú" : "Profile — them vs league vs you"}</Text>
        <View style={s.hrow}>
          <Text style={[s.c1, s.th]}>{isIS ? "Mælikvarði (á leik)" : "Metric (per match)"}</Text>
          <Text style={[s.cN, s.th]}>{isIS ? "Þeir" : "Them"}</Text>
          <Text style={[s.cN, s.th]}>{isIS ? "Deild" : "League"}</Text>
          <Text style={[s.cN, s.th]}>{isIS ? "Þú" : "You"}</Text>
        </View>
        {profileRows.map((r) => (
          <View style={s.row} key={r.metric}>
            <Text style={s.c1}>{label(r.metric)}</Text>
            <Text style={s.cNb}>{fm(r.metric, r.them)}</Text>
            <Text style={s.cN}>{fm(r.metric, r.league)}</Text>
            <Text style={s.cN}>{fm(r.metric, r.you)}</Text>
          </View>
        ))}

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
          <View style={s.rec} key={r.id}>
            <Text style={s.recDot}>»</Text>
            <Text style={{ flex: 1 }}>{pick(r.text, lang)} <Text style={{ color: MUTE }}>({isIS ? "merki" : "signal"}: {label(r.signal.metric)} {fm(r.signal.metric, r.signal.value)})</Text></Text>
          </View>
        ))}

        {report.keyPlayers.available && report.keyPlayers.topScorers.length > 0 ? (
          <>
            <Text style={s.sec}>{isIS ? "Lykilmenn" : "Key players"}</Text>
            <Text style={s.verdict}>{pick(report.keyPlayers.verdict, lang)}</Text>
            <View style={[s.row, { borderTopWidth: 0, marginTop: 3 }]}>
              <Text style={[s.c1, s.th]}>{isIS ? "Leikmaður" : "Player"}</Text>
              <Text style={[s.cN, s.th]}>{isIS ? "Mín." : "Min."}</Text>
              <Text style={[s.cN, s.th]}>{isIS ? "Mörk" : "Goals"}</Text>
              <Text style={[s.cN, s.th]}>xG</Text>
            </View>
            {report.keyPlayers.topScorers.map((p) => (
              <View style={s.row} key={p.name}>
                <Text style={s.c1}>{p.name}{p.position ? `  ${p.position}` : ""}</Text>
                <Text style={s.cN}>{fi(p.minutes)}</Text>
                <Text style={s.cNb}>{fi(p.goals)}</Text>
                <Text style={s.cN}>{f1(p.xg)}</Text>
              </View>
            ))}
          </>
        ) : null}

        <Text style={s.sec}>{isIS ? "Fastaleikir" : "Set pieces"}</Text>
        <Text style={s.para}>{pick(report.setPieces.verdict, lang)}</Text>

        <Text style={s.sec}>{isIS ? "Form" : "Form"}</Text>
        <Text style={s.para}>{pick(report.form.verdict, lang)}</Text>

        <Text style={s.sec}>{isIS ? "Þeir vs þú" : "Them vs you"}</Text>
        <Text style={s.verdict}>{pick(report.matchup.verdict, lang)}</Text>
        <View style={[s.row, { borderTopWidth: 0, marginTop: 3 }]}>
          <Text style={[s.c1, s.th]}>{isIS ? "Mælikvarði" : "Metric"}</Text>
          <Text style={[s.cN, s.th]}>{isIS ? "Þeir" : "Them"}</Text>
          <Text style={[s.cN, s.th]}>{isIS ? "Þú" : "You"}</Text>
        </View>
        {report.matchup.rows.filter((r) => r.them != null || r.you != null).map((r) => (
          <View style={s.row} key={r.metric}>
            <Text style={s.c1}>{label(r.metric)}</Text>
            <Text style={s.cN}>{fm(r.metric, r.them)}</Text>
            <Text style={s.cN}>{fm(r.metric, r.you)}</Text>
          </View>
        ))}

        <Text style={s.sec}>{isIS ? "Túlkun" : "Interpretation"}</Text>
        <Text style={s.para}>{interpretation}</Text>

        <Text style={s.foot}>
          {isIS
            ? "Lýsandi samhengi úr Wyscout Team-Stats (árstölfræði andstæðingsins), borið saman við deildar-meðaltal og þitt lið. Reglur reikna staðreyndirnar; textinn raðar þeim aðeins upp — engin AI. Ráðleggingar sýna merkið sem þær koma frá og eru til viðmiðunar — þjálfarinn ræður. Snertir aldrei readiness-litinn né daglegu ákvörðunina. xG og PPDA eru Wyscout-líkön með óvissu; season-meðaltöl segja til um stíl, ekki um einstakan leik. Dýpri gögn (myndbönd, event-gögn) eru v2 (Wyscout Data API)."
            : "Descriptive context from Wyscout Team-Stats (the opponent's season), benchmarked against the league average and your team. Rules compute the facts; this only lays them out — no AI. Recommendations show the signal they came from and are guidance — the coach decides. Never touches the readiness colour or the daily decision. xG and PPDA are Wyscout models with uncertainty; season averages describe style, not a single match. Deeper data (video, event data) is v2 (Wyscout Data API)."}
        </Text>
        <Text style={s.ref}>
          {isIS ? "Heimildir: " : "References: "}
          Rathke, A. (2017). An examination of expected goals and shot efficiency in soccer. Journal of Human Sport and Exercise, 12(2proc), S514–S529.
          {"  "}Fernández-Navarro, J., Fradua, L., Zubillaga, A., Ford, P. R., & McRobert, A. P. (2016). Attacking and defensive styles of play in soccer. Journal of Sports Sciences, 34(24), 2195–2204.
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
