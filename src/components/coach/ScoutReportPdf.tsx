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
const GREEN = "#1c7a4a", AMBER = "#de9328", RED = "#a83e28", BARBG = "#c7cdd6";
const resultColor = (r: "W" | "D" | "L") => (r === "W" ? GREEN : r === "D" ? AMBER : RED);

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
  cW: { width: 130, textAlign: "right", fontFamily: "Helvetica-Bold" },
  th: { fontFamily: "Helvetica-Bold", fontSize: 8.5 },
  cBar: { width: 66, justifyContent: "center", paddingLeft: 6 },
  formDot: { width: 15, height: 15, borderRadius: 2, marginRight: 3, alignItems: "center", justifyContent: "center" },
  formLetter: { color: "#ffffff", fontSize: 9, fontFamily: "Helvetica-Bold" },
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

export function Doc({ report, lang, label }: { report: OpponentReport; lang: Lang; label: (k: string) => string }) {
  const isIS = lang === "IS";
  const factLine = (facts: Cited[]) =>
    facts.map((c) => `${label(c.metric)} ${fm(c.metric, c.value)}${c.league != null ? ` (${isIS ? "deild" : "lg"} ${fm(c.metric, c.league)})` : ""}`).join("   ·   ");

  // Abstract is a purpose-written, concise lede; the closing note pulls the matchup + form
  // together (the defensive read already lives in its own section + the game plan).
  const abstract = pick(report.summary, lang);
  const interpretation = [report.matchup.verdict, report.form.verdict].map((b) => pick(b, lang)).join(" ");

  // Caveats footer names the actual source (never hardcode "Wyscout" on a StatsBomb
  // report) — the provider whose season/models this report is built from.
  const footText = report.source === "statsbomb"
    ? (isIS
      ? "Lýsandi samhengi úr StatsBomb Team Stats (árstölfræði andstæðingsins), borið saman við deildar-meðaltal og þitt lið. Reglur reikna staðreyndirnar; textinn raðar þeim aðeins upp — engin AI. Ráðleggingar sýna merkið sem þær koma frá og eru til viðmiðunar — þjálfarinn ræður. Snertir aldrei readiness-litinn né daglegu ákvörðunina. xG, PPDA og OBV eru StatsBomb-líkön með óvissu; season-meðaltöl segja til um stíl, ekki um einstakan leik. Dýpri gögn (event- og 360-gögn) eru v2 (StatsBomb Data API)."
      : "Descriptive context from StatsBomb Team Stats (the opponent's season), benchmarked against the league average and your team. Rules compute the facts; this only lays them out — no AI. Recommendations show the signal they came from and are guidance — the coach decides. Never touches the readiness colour or the daily decision. xG, PPDA and OBV are StatsBomb models with uncertainty; season averages describe style, not a single match. Deeper data (event & 360 data) is v2 (StatsBomb Data API).")
    : (isIS
      ? "Lýsandi samhengi úr Wyscout Team-Stats (árstölfræði andstæðingsins), borið saman við deildar-meðaltal og þitt lið. Reglur reikna staðreyndirnar; textinn raðar þeim aðeins upp — engin AI. Ráðleggingar sýna merkið sem þær koma frá og eru til viðmiðunar — þjálfarinn ræður. Snertir aldrei readiness-litinn né daglegu ákvörðunina. xG og PPDA eru Wyscout-líkön með óvissu; season-meðaltöl segja til um stíl, ekki um einstakan leik. Dýpri gögn (myndbönd, event-gögn) eru v2 (Wyscout Data API)."
      : "Descriptive context from Wyscout Team-Stats (the opponent's season), benchmarked against the league average and your team. Rules compute the facts; this only lays them out — no AI. Recommendations show the signal they came from and are guidance — the coach decides. Never touches the readiness colour or the daily decision. xG and PPDA are Wyscout models with uncertainty; season averages describe style, not a single match. Deeper data (video, event data) is v2 (Wyscout Data API).");

  // Profile table: them / league / you, from block facts (+ matchup for "you").
  const factMap: Record<string, Cited> = {};
  [...report.identity.facts, ...report.attack.facts, ...report.defend.facts].forEach((c) => { factMap[c.metric] = c; });
  const youMap: Record<string, number | null> = {};
  report.matchup.rows.forEach((r) => { youMap[r.metric] = r.you; });
  const PROFILE = ["xgf", "gf", "xga", "ga", "shots", "shotsAgainst", "possession", "ppda", "defDuelsWonPct", "passesFinalThird", "crosses"];
  const profileRows = PROFILE
    .filter((k) => factMap[k] && factMap[k].value != null)
    .map((k) => ({ metric: k, them: factMap[k].value, league: factMap[k].league ?? null, you: youMap[k] ?? null }));

  // Standings + efficiency (finishing / goalkeeping) — derived from the report's own numbers.
  const rec = report.record;
  const gfM = factMap["gf"]?.value ?? null, gaM = factMap["ga"]?.value ?? null;
  const xgfM = factMap["xgf"]?.value ?? null, xgaM = factMap["xga"]?.value ?? null;
  const gfTot = report.goalsFor, gaTot = report.goalsAgainst;   // full-precision season totals (not round-then-multiply)
  const l5w = report.form.results.filter((r) => r === "W").length, l5d = report.form.results.filter((r) => r === "D").length, l5l = report.form.results.filter((r) => r === "L").length;
  const finishing = gfM != null && xgfM != null ? Math.round((gfM - xgfM) * 100) / 100 : null;
  const keeping = xgaM != null && gaM != null ? Math.round((xgaM - gaM) * 100) / 100 : null;
  const signed = (v: number | null) => (v == null ? "—" : (v > 0 ? "+" : "") + v.toFixed(2));
  // Mini comparison bar: value scaled against the row's max (them vs league magnitude).
  const BAR_MAX = 54;
  const barW = (v: number | null, other: number | null) => { const m = Math.max(v ?? 0, other ?? 0); return v != null && m > 0 ? Math.max(1, (v / m) * BAR_MAX) : 0; };
  const sp = report.setPieces, kp = report.keyPlayers, splits = report.splits, sb = report.statsbomb;

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.h1}>{report.opponent} — {isIS ? "andstæðingagreining" : "opponent scouting"} {report.season}</Text>
        <Text style={s.sub}>{isIS ? "Hvað leiktölfræðin segir — og hvar á að meiða þá" : "What the match stats say — and where to hurt them"}</Text>
        <Text style={s.byline}>
          {isIS ? "Unnið fyrir þjálfarateymið" : "Prepared for the coaching staff"} · MicroPulse · {report.matches} {isIS ? "leikir" : "matches"}
          {report.record ? ` (${report.record.w}${isIS ? "S" : "W"} ${report.record.d}${isIS ? "J" : "D"} ${report.record.l}${isIS ? "T" : "L"})` : ""}
          {` · ${isIS ? "Byggt á" : "Built from"}: ${report.source === "statsbomb" ? "StatsBomb" : "Wyscout"}`}
        </Text>

        <View style={s.abstract}>
          <Text><Text style={{ fontFamily: "Helvetica-Bold" }}>{isIS ? "Útdráttur. " : "Summary. "}</Text>{abstract}</Text>
        </View>

        {rec ? (
          <>
            <Text style={s.sec}>{isIS ? "Staðan" : "Standing"}</Text>
            {report.position != null ? (
              <View style={s.row}><Text style={s.c1}>{isIS ? "Sæti" : "League position"}</Text><Text style={s.cW}>{isIS ? `${report.position}.` : `${report.position}`}</Text></View>
            ) : null}
            <View style={s.row}><Text style={s.c1}>{isIS ? "Leikir" : "Matches"}</Text><Text style={s.cW}>{report.matches}</Text></View>
            <View style={s.row}><Text style={s.c1}>{isIS ? "Sigrar – Jafntefli – Töp" : "Wins – Draws – Losses"}</Text><Text style={s.cW}>{`${rec.w}${isIS ? "S" : "W"}  ${rec.d}${isIS ? "J" : "D"}  ${rec.l}${isIS ? "T" : "L"}`}</Text></View>
            {gfTot != null && gaTot != null ? (
              <View style={s.row}><Text style={s.c1}>{isIS ? "Mörk skoruð : á sig" : "Goals for : against"}</Text><Text style={s.cW}>{`${gfTot} : ${gaTot}`}</Text></View>
            ) : null}
            <View style={s.row}><Text style={s.c1}>{isIS ? "Síðustu 5" : "Last 5"}</Text><Text style={s.cW}>{`${l5w}${isIS ? "S" : "W"}  ${l5d}${isIS ? "J" : "D"}  ${l5l}${isIS ? "T" : "L"}`}</Text></View>
            {report.form.results.length ? (
              <View style={[s.row, { alignItems: "center" }]}>
                <Text style={s.c1}>{isIS ? "Form (nýjast til vinstri)" : "Form (latest left)"}</Text>
                <View style={{ flexDirection: "row" }}>
                  {report.form.results.map((r, i) => (
                    <View key={i} style={[s.formDot, { backgroundColor: resultColor(r) }]}><Text style={s.formLetter}>{isIS ? (r === "W" ? "S" : r === "D" ? "J" : "T") : r}</Text></View>
                  ))}
                </View>
              </View>
            ) : null}
          </>
        ) : null}

        <Text style={s.sec}>{isIS ? "Prófíll — þeir vs deild vs þú" : "Profile — them vs league vs you"}</Text>
        <View style={s.hrow}>
          <Text style={[s.c1, s.th]}>{isIS ? "Mælikvarði (á leik)" : "Metric (per match)"}</Text>
          <Text style={[s.cN, s.th]}>{isIS ? "Þeir" : "Them"}</Text>
          <Text style={[s.cN, s.th]}>{isIS ? "Deild" : "League"}</Text>
          <Text style={[s.cN, s.th]}>{isIS ? "Þú" : "You"}</Text>
          <View style={s.cBar} />
        </View>
        {profileRows.map((r) => (
          <View style={[s.row, { alignItems: "center" }]} key={r.metric}>
            <Text style={s.c1}>{label(r.metric)}</Text>
            <Text style={s.cNb}>{fm(r.metric, r.them)}</Text>
            <Text style={s.cN}>{fm(r.metric, r.league)}</Text>
            <Text style={s.cN}>{fm(r.metric, r.you)}</Text>
            <View style={s.cBar}>
              <View style={{ height: 3, width: barW(r.them, r.league), backgroundColor: COBALT, marginBottom: 1.5 }} />
              <View style={{ height: 3, width: barW(r.league, r.them), backgroundColor: BARBG }} />
            </View>
          </View>
        ))}
        <Text style={[s.facts, { fontSize: 7.5 }]}>{isIS ? "Súlur: þeir (blátt) vs deild (grátt), hlutfallslegt." : "Bars: them (blue) vs league (grey), relative."}</Text>

        {finishing != null || keeping != null ? (
          <>
            <Text style={s.sec}>{isIS ? "Nýting og markvarsla" : "Finishing & goalkeeping"}</Text>
            <View style={s.row}><Text style={s.c1}>{isIS ? "xG fyrir / mörk skoruð" : "xG for / goals scored"}</Text><Text style={s.cW}>{`${f1(xgfM)} / ${f1(gfM)}`}</Text></View>
            <View style={s.row}><Text style={s.c1}>{isIS ? "Nýting (mörk − xG)" : "Finishing (goals − xG)"}</Text><Text style={s.cW}>{signed(finishing)}</Text></View>
            <View style={s.row}><Text style={s.c1}>{isIS ? "xG á móti / mörk á sig" : "xG against / goals conceded"}</Text><Text style={s.cW}>{`${f1(xgaM)} / ${f1(gaM)}`}</Text></View>
            <View style={s.row}><Text style={s.c1}>{isIS ? "Markvarsla (xGA − mörk á sig)" : "Goalkeeping (xGA − conceded)"}</Text><Text style={s.cW}>{signed(keeping)}</Text></View>
          </>
        ) : null}

        {sb ? (
          <>
            <Text style={s.sec}>{isIS ? "StatsBomb-merki (dýpri en Wyscout)" : "StatsBomb signals (deeper than Wyscout)"}</Text>
            <View style={s.hrow}>
              <Text style={[s.c1, s.th]}>{isIS ? "Mælikvarði (á leik)" : "Metric (per match)"}</Text>
              <Text style={[s.cN, s.th]}>{isIS ? "Þeir" : "Them"}</Text>
              <Text style={[s.cN, s.th]}>{isIS ? "Deild" : "League"}</Text>
            </View>
            {([
              [isIS ? "OBV (sóknarvirði)" : "OBV (attacking value)", sb.obv, sb.obvLeague],
              [isIS ? "OBV á móti" : "OBV against", sb.obvAgainst, sb.obvAgainstLeague],
              [isIS ? "Fastaleikja-xG" : "Set-piece xG", sb.setPieceXg, sb.setPieceXgLeague],
              [isIS ? "Fastaleikja-xG á móti" : "Set-piece xG against", sb.setPieceXgAgainst, sb.setPieceXgAgainstLeague],
            ] as Array<[string, number | null, number | null]>).filter(([, v]) => v != null).map(([lab, them, lg]) => (
              <View style={s.row} key={lab}>
                <Text style={s.c1}>{lab}</Text>
                <Text style={s.cNb}>{f1(them)}</Text>
                <Text style={s.cN}>{f1(lg)}</Text>
              </View>
            ))}
            <Text style={[s.facts, { fontSize: 7.5 }]}>{isIS ? "OBV = verðmæti aðgerða á vellinum (StatsBomb). Hærra á móti = þeir gefa frá sér meira virði." : "OBV = value added by on-ball actions (StatsBomb). Higher against = they concede more value."}</Text>
          </>
        ) : null}

        {splits && (splits.home.games > 0 || splits.away.games > 0) ? (
          <>
            <Text style={s.sec}>{isIS ? "Heima vs úti" : "Home vs away"}</Text>
            <View style={s.hrow}>
              <Text style={[s.c1, s.th]}> </Text>
              <Text style={[s.cN, s.th]}>{isIS ? "Lk" : "Pl"}</Text>
              <Text style={[s.cN, s.th]}>{isIS ? "S-J-T" : "W-D-L"}</Text>
              <Text style={[s.cN, s.th]}>{isIS ? "xG" : "xG"}</Text>
              <Text style={[s.cN, s.th]}>{isIS ? "xGA" : "xGA"}</Text>
            </View>
            {([["home", splits.home], ["away", splits.away]] as const).map(([k, sd]) => (
              <View style={s.row} key={k}>
                <Text style={s.c1}>{k === "home" ? (isIS ? "Heima" : "Home") : (isIS ? "Úti" : "Away")}</Text>
                <Text style={s.cN}>{sd.games}</Text>
                <Text style={s.cNb}>{`${sd.w}-${sd.d}-${sd.l}`}</Text>
                <Text style={s.cN}>{f1(sd.xg)}</Text>
                <Text style={s.cN}>{f1(sd.xga)}</Text>
              </View>
            ))}
          </>
        ) : null}

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
            {report.keyPlayers.topScorers.map((p) => {
              const over = p.goals != null && p.xg != null && p.goals - p.xg >= 1.5;
              const under = p.goals != null && p.xg != null && p.xg - p.goals >= 2.5;
              return (
                <View style={s.row} key={p.name}>
                  <Text style={s.c1}>{p.name}{p.position ? `  ${p.position}` : ""}{over ? (isIS ? "  · yfir-nýtir" : "  · overperforming") : under ? (isIS ? "  · vannýtir" : "  · underperforming") : ""}</Text>
                  <Text style={s.cN}>{fi(p.minutes)}</Text>
                  <Text style={s.cNb}>{fi(p.goals)}</Text>
                  <Text style={s.cN}>{f1(p.xg)}</Text>
                </View>
              );
            })}
            {kp.watch.length ? (
              <Text style={[s.facts, { marginTop: 3 }]}>
                <Text style={{ fontFamily: "Helvetica-Bold", color: INK }}>{isIS ? "Fylgstu líka með: " : "Also watch: "}</Text>
                {kp.watch.map((p) => `${p.name} (${fi(p.goals)}${isIS ? " mörk" : "g"} / ${f1(p.xg)} xG)`).join(", ")}{isIS ? " — komast í færin en klára ekki; eiga inni." : " — getting chances but not converting; due a goal."}
              </Text>
            ) : null}
          </>
        ) : null}

        <Text style={s.sec}>{isIS ? "Fastaleikir og skallaógn" : "Set pieces & aerial threat"}</Text>
        <Text style={s.para}>{pick(report.setPieces.verdict, lang)}</Text>
        {sp.players.length ? (
          <Text style={[s.facts, { marginTop: 2 }]}>{sp.players.map((p) => `${p.name}${p.position ? ` (${p.position})` : ""} — ${p.goals}${isIS ? " mörk" : "g"}`).join("   ·   ")}</Text>
        ) : null}

        <Text style={s.sec}>{isIS ? "Form" : "Form"}</Text>
        <Text style={s.para}>{pick(report.form.verdict, lang)}</Text>
        {report.worstDefeats.length ? (
          <Text style={[s.facts, { marginTop: 2 }]}>
            <Text style={{ fontFamily: "Helvetica-Bold", color: INK }}>{isIS ? "Þyngstu töp: " : "Heaviest defeats: "}</Text>
            {report.worstDefeats.map((m) => `${m.gf}–${m.ga}${m.opponent ? ` ${isIS ? "gegn" : "vs"} ${m.opponent}` : ""}`).join("   ·   ")}{isIS ? " — svona líta þeir út þegar þeir eru keyrðir." : " — how they look when overrun."}
          </Text>
        ) : null}

        <Text style={s.sec}>{isIS ? "Þeir vs þú" : "Them vs you"}</Text>
        <Text style={s.verdict}>{pick(report.matchup.verdict, lang)}</Text>
        {report.headToHead.map((h, i) => {
          const verb = h.result === "W" ? (isIS ? "vann ykkur" : "beat you") : h.result === "L" ? (isIS ? "tapaði fyrir ykkur" : "lost to you") : (isIS ? "gerði jafntefli við ykkur" : "drew with you");
          const score = h.gf != null && h.ga != null ? ` ${h.gf}–${h.ga}` : "";
          const where = h.isHome === true ? (isIS ? " á heimavelli þeirra" : " at their ground") : h.isHome === false ? (isIS ? " á ykkar velli" : " at your ground") : "";
          return <Text key={i} style={s.para}>{isIS ? "Fyrri viðureign: " : "Earlier meeting: "}<Text style={{ fontFamily: "Helvetica-Bold" }}>{`${report.opponent} ${verb}${score}`}</Text>{`${where} (${h.date}).`}</Text>;
        })}
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

        <Text style={s.sec}>{isIS ? "Leikáætlun" : "Game plan"}</Text>
        <Text style={[s.verdict, { color: COBALT }]}>{pick(report.gameplan, lang)}</Text>
        <Text style={[s.para, { marginTop: 2 }]}>{interpretation}</Text>

        <Text style={s.foot}>{footText}</Text>
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
