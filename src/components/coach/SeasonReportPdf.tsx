"use client";

/**
 * SeasonReportPdf — a one-team season match-stats report (PDF).
 *
 * Numbers are deterministic aggregates of ingested Wyscout team stats; the prose,
 * when present, is AI-written from those numbers and LABELLED as AI (explainability
 * rules: AI cites real data, invents nothing). Descriptive context only — it never
 * touches the readiness colour. Works for any team with ingested stats.
 */

import { Document, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import type { SeasonReport } from "@/lib/micropulse/seasonReport";

type Lang = "EN" | "IS";
type Narrative = Record<string, string> | null;
type Physical = { key: string; r: number; n: number }[] | null;

export type SeasonReportPayload = {
  season: number;
  data: SeasonReport;
  physical: Physical;
  narrative: Narrative;
  aiGenerated: boolean;
  model: string | null;
  source?: "statsbomb" | "wyscout";
};

const INK = "#14181c";
const MUTE = "#6b7280";
const LINE = "#e5e7eb";
const COBALT = "#2740e6";

const s = StyleSheet.create({
  page: { paddingTop: 42, paddingBottom: 48, paddingHorizontal: 44, fontSize: 10, color: INK, fontFamily: "Helvetica", lineHeight: 1.45 },
  h1: { fontSize: 19, fontFamily: "Helvetica-Bold" },
  sub: { fontSize: 10, color: MUTE, marginTop: 3 },
  aiTag: { marginTop: 8, alignSelf: "flex-start", fontSize: 8, color: COBALT, borderColor: COBALT, borderWidth: 1, borderRadius: 3, paddingVertical: 2, paddingHorizontal: 5 },
  section: { marginTop: 15 },
  h2: { fontSize: 12, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  p: { marginBottom: 3 },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: LINE, paddingVertical: 3 },
  cellL: { flex: 1, color: MUTE },
  cellR: { width: 150, textAlign: "right", fontFamily: "Helvetica-Bold" },
  small: { fontSize: 8, color: MUTE },
  footNote: { marginTop: 16, paddingTop: 8, borderTopWidth: 1, borderTopColor: LINE, fontSize: 8, color: MUTE, lineHeight: 1.5 },
});

const L = {
  EN: {
    report: "season report", prepared: "Prepared for the coaching staff · MicroPulse",
    ai: "AI-written from the numbers below — cites real data, decides nothing",
    results: "Results", attack: "Attack", defence: "Defence", goalkeeping: "Goalkeeping",
    homeAway: "Home vs away", home: "Home", away: "Away",
    pressing: "Pressing & possession", winsLosses: "Wins vs losses", physical: "The physical picture",
    bottomLine: "Bottom line", keyNumbers: "Key numbers",
    matches: "Matches (graded)", record: "Record (W-D-L)", points: "Points (per game)",
    gf: "Goals for / against (per match)", gd: "Goal difference (per match)",
    xg: "xG for / against (per match)", xgd: "xG difference (per match)",
    shots: "Shots for / against", poss: "Possession", ppda: "Pressing (PPDA · lower = more)",
    defduel: "Defensive duels won", finishing: "Finishing (goals − xG)", saved: "Goals saved (xG conceded − conceded)",
    inWins: "In wins", inLosses: "In losses", xgAg: "xG against", shAg: "Shots against", xgFor: "xG for",
    tracks: "Movement ↔ result (Pearson r, n matches)",
    method: "Descriptive context only — it never changes the readiness colour or the daily decision. Figures are per-match aggregates of ingested Wyscout team stats for the season shown; results are the entered fixture score where present, else derived from Wyscout goals. Goalkeeping “goals saved” and “finishing” are over/under-performance vs expected goals and tend to regress over time. xG and PPDA are models with uncertainty; a season with few losses is a small sample in which single games pull the averages. Association, not causation or prediction.",
    lowSample: "Small sample — few losses this season, so the wins-vs-losses split is tentative.",
  },
  IS: {
    report: "tímabilsskýrsla", prepared: "Unnið fyrir þjálfarateymið · MicroPulse",
    ai: "AI skrifaði úr tölunum að neðan — vitnar í raunveruleg gögn, ákveður ekkert",
    results: "Úrslit", attack: "Sókn", defence: "Vörn", goalkeeping: "Markvarsla",
    homeAway: "Heima vs úti", home: "Heima", away: "Úti",
    pressing: "Pressa & boltahald", winsLosses: "Sigrar vs töp", physical: "Líkamlega myndin",
    bottomLine: "Niðurstaða", keyNumbers: "Lykiltölur",
    matches: "Leikir (metnir)", record: "Skor (S-J-T)", points: "Stig (á leik)",
    gf: "Mörk með / á móti (á leik)", gd: "Markamunur (á leik)",
    xg: "xG með / á móti (á leik)", xgd: "xG munur (á leik)",
    shots: "Skot með / á móti", poss: "Boltahald", ppda: "Pressa (PPDA · lægra = meiri)",
    defduel: "Varnarnávígi unnin", finishing: "Klárun (mörk − xG)", saved: "Mörk varin (xG á móti − á móti)",
    inWins: "Í sigrum", inLosses: "Í töpum", xgAg: "xG á móti", shAg: "Skot á móti", xgFor: "xG með",
    tracks: "Hreyfing ↔ úrslit (Pearson r, n leikir)",
    method: "Aðeins lýsandi samhengi — breytir aldrei readiness-litnum né daglegu ákvörðuninni. Tölur eru meðaltöl per leik úr innfluttri Wyscout-liðstölfræði fyrir sýnt tímabil; úrslit eru skráð leikjastig þar sem þau eru til, annars leidd af Wyscout-mörkum. „Mörk varin“ og „klárun“ eru yfir/undir-frammistaða vs væntanleg mörk og leita til baka með tímanum. xG og PPDA eru líkön með óvissu; tímabil með fáum töpum er lítið úrtak þar sem einstakir leikir toga í meðaltölin. Fylgni, ekki orsök eða spá.",
    lowSample: "Lítið úrtak — fá töp á tímabilinu, svo sigrar-vs-töp lesturinn er vísbending.",
  },
} as const;

const PHYS_LABEL: Record<string, { EN: string; IS: string }> = {
  totalDistPerMin: { EN: "Distance / min", IS: "Vegalengd / mín" },
  hsrPerMin: { EN: "High-speed running / min", IS: "Háhraðahlaup / mín" },
  sprintPerMin: { EN: "Sprint distance / min", IS: "Sprettir / mín" },
  topSpeed: { EN: "Top speed", IS: "Hámarkshraði" },
  hmldPerMin: { EN: "High metabolic-load / min", IS: "Hátt efnaskiptaálag / mín" },
  highDecelPerMin: { EN: "Braking (decel) / min", IS: "Hemlun / mín" },
  highCodPerMin: { EN: "High change-of-direction / min", IS: "Stefnubreytingar / mín" },
  sprintStridesPerMin: { EN: "Sprint strides / min", IS: "Sprettskref / mín" },
  jumpsPerMin: { EN: "Jumps / min", IS: "Stökk / mín" },
};

const n1 = (v: number | null | undefined, d = 2) => (v == null ? "—" : v.toFixed(d));
const sign = (v: number | null | undefined, d = 2) => (v == null ? "—" : (v >= 0 ? "+" : "") + v.toFixed(d));

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.row}>
      <Text style={s.cellL}>{label}</Text>
      <Text style={s.cellR}>{value}</Text>
    </View>
  );
}
function Section({ title, body }: { title: string; body?: string }) {
  if (!body || !body.trim()) return null;
  return (
    <View style={s.section} wrap={false}>
      <Text style={s.h2}>{title}</Text>
      <Text style={s.p}>{body}</Text>
    </View>
  );
}

function SeasonReportDoc({ payload, lang }: { payload: SeasonReportPayload; lang: Lang }) {
  const t = L[lang];
  const { data, physical, narrative, aiGenerated, season } = payload;
  const pm = data.perMatch;
  const wl = data.winsVsLosses;
  const nv = (k: string) => narrative?.[k] ?? "";
  // Source-aware provenance: the report is built from ONE provider's per-match data.
  // Naming/method name the actual source so a StatsBomb report never reads "Wyscout".
  const srcName = payload.source === "statsbomb" ? "StatsBomb" : "Wyscout";
  const method = t.method.replace(/Wyscout/g, srcName);

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.h1}>{data.team} {season} — {t.report} ({srcName})</Text>
        <Text style={s.sub}>{t.prepared} · {data.dateFrom ?? ""}–{data.dateTo ?? ""}</Text>
        {aiGenerated ? <Text style={s.aiTag}>AI · {t.ai}</Text> : null}

        <Section title={t.results} body={nv("headline")} />

        {/* Key numbers table */}
        <View style={s.section}>
          <Text style={s.h2}>{t.keyNumbers}</Text>
          <Row label={t.matches} value={`${data.matches} (${data.graded})`} />
          <Row label={t.record} value={`${data.record.w}-${data.record.d}-${data.record.l}`} />
          <Row label={t.points} value={`${data.points} (${n1(data.ppg)})`} />
          <Row label={t.gf} value={`${n1(pm.goalsFor)} / ${n1(pm.goalsAgainst)}`} />
          <Row label={t.gd} value={sign(pm.goalDiff)} />
          <Row label={t.xg} value={`${n1(pm.xgFor)} / ${n1(pm.xgAgainst)}`} />
          <Row label={t.xgd} value={sign(pm.xgDiff)} />
          <Row label={t.shots} value={`${n1(pm.shotsFor, 1)} / ${n1(pm.shotsAgainst, 1)}`} />
          <Row label={t.poss} value={pm.possessionPct == null ? "—" : `${n1(pm.possessionPct, 1)}%`} />
          <Row label={t.ppda} value={n1(pm.ppda)} />
          <Row label={t.defduel} value={pm.defDuelsWonPct == null ? "—" : `${n1(pm.defDuelsWonPct, 1)}%`} />
          <Row label={t.finishing} value={sign(pm.finishing)} />
          <Row label={t.saved} value={sign(pm.goalsSaved)} />
        </View>

        <Section title={t.attack} body={nv("attack")} />
        <Section title={t.defence} body={nv("defence")} />
        <Section title={t.goalkeeping} body={nv("goalkeeping")} />
        <Section title={t.pressing} body={nv("pressing")} />

        {/* Wins vs losses table */}
        <View style={s.section} wrap={false}>
          <Text style={s.h2}>{t.winsLosses}</Text>
          {data.confidence.lowSample ? <Text style={[s.small, { marginBottom: 3 }]}>⚠ {t.lowSample}</Text> : null}
          <View style={s.row}>
            <Text style={s.cellL}> </Text>
            <Text style={[s.cellR, { width: 75 }]}>{t.inWins}</Text>
            <Text style={[s.cellR, { width: 75 }]}>{t.inLosses}</Text>
          </View>
          {[
            { label: t.xgAg, g: wl.xgAgainst, d: 2 },
            { label: t.shAg, g: wl.shotsAgainst, d: 1 },
            { label: t.xgFor, g: wl.xgFor, d: 2 },
            { label: "PPDA", g: wl.ppda, d: 2 },
          ].map((r) => (
            <View style={s.row} key={r.label}>
              <Text style={s.cellL}>{r.label}</Text>
              <Text style={[s.cellR, { width: 75 }]}>{n1(r.g.win.mean, r.d)}</Text>
              <Text style={[s.cellR, { width: 75 }]}>{n1(r.g.loss.mean, r.d)}</Text>
            </View>
          ))}
        </View>
        <Section title="" body={nv("winsLosses")} />

        {/* Home vs away — where the season's results and process actually come from. */}
        {data.homeAway && (data.homeAway.home.n > 0 || data.homeAway.away.n > 0) ? (
          <View style={s.section} wrap={false}>
            <Text style={s.h2}>{t.homeAway}</Text>
            <View style={s.row}>
              <Text style={s.cellL}> </Text>
              <Text style={[s.cellR, { width: 75 }]}>{t.home} (n={data.homeAway.home.n})</Text>
              <Text style={[s.cellR, { width: 75 }]}>{t.away} (n={data.homeAway.away.n})</Text>
            </View>
            {[
              { label: t.record, h: `${data.homeAway.home.w}-${data.homeAway.home.d}-${data.homeAway.home.l}`, a: `${data.homeAway.away.w}-${data.homeAway.away.d}-${data.homeAway.away.l}` },
              { label: t.gf, h: `${n1(data.homeAway.home.goalsFor)} / ${n1(data.homeAway.home.goalsAgainst)}`, a: `${n1(data.homeAway.away.goalsFor)} / ${n1(data.homeAway.away.goalsAgainst)}` },
              { label: t.xg, h: `${n1(data.homeAway.home.xgFor)} / ${n1(data.homeAway.home.xgAgainst)}`, a: `${n1(data.homeAway.away.xgFor)} / ${n1(data.homeAway.away.xgAgainst)}` },
              { label: t.xgd, h: sign(data.homeAway.home.xgDiff), a: sign(data.homeAway.away.xgDiff) },
              { label: t.shots, h: `${n1(data.homeAway.home.shotsFor, 1)} / ${n1(data.homeAway.home.shotsAgainst, 1)}`, a: `${n1(data.homeAway.away.shotsFor, 1)} / ${n1(data.homeAway.away.shotsAgainst, 1)}` },
              { label: t.finishing, h: sign(data.homeAway.home.finishing), a: sign(data.homeAway.away.finishing) },
            ].map((r) => (
              <View style={s.row} key={r.label}>
                <Text style={s.cellL}>{r.label}</Text>
                <Text style={[s.cellR, { width: 75 }]}>{r.h}</Text>
                <Text style={[s.cellR, { width: 75 }]}>{r.a}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* Physical */}
        {physical && physical.length ? (
          <View style={s.section} wrap={false}>
            <Text style={s.h2}>{t.physical}</Text>
            {nv("physical") ? <Text style={s.p}>{nv("physical")}</Text> : null}
            <Text style={[s.small, { marginBottom: 2 }]}>{t.tracks}</Text>
            {physical.map((c) => (
              <View style={s.row} key={c.key}>
                <Text style={s.cellL}>{PHYS_LABEL[c.key]?.[lang] ?? c.key}</Text>
                <Text style={s.cellR}>r = {c.r.toFixed(2)} · n={c.n}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <Section title={t.bottomLine} body={nv("bottomLine")} />

        <Text style={s.footNote}>{method}</Text>
      </Page>
    </Document>
  );
}

export async function downloadSeasonReportPdf(payload: SeasonReportPayload, lang: Lang) {
  const blob = await pdf(<SeasonReportDoc payload={payload} lang={lang} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${payload.data.team.replace(/\s+/g, "-")}-${payload.season}-season-report-${payload.source ?? "wyscout"}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
