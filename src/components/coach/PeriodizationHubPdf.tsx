"use client";

/**
 * PeriodizationHubPdf — the WHOLE hub as one PDF: the season macro map, the squad demands (baseline
 * by position + the three axes vs the match), the meso blocks, the scheduled plan-ahead block, and a
 * per-player individualisation table. Everything the coach sees across the four tabs, in one export.
 *
 * Descriptive planning — it never sets the readiness colour. Numbers are the team's / player's own
 * data; targets are a starting point, not a norm to obey (Little & Buchheit). Rules recommend; the
 * coach decides.
 */

import { Document, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import type { MatchAxes, MatchUnitAbs, CalendarBlock, CalType, CalDay, MesoPlan, Bi } from "@/lib/micropulse/periodization/index";

type Lang = "EN" | "IS";

export type HubBaselineRow = { label: Bi; players: number; distanceM: number | null; hsrM: number | null; maxKmh: number | null; playerLoad: number | null; accel: number | null; decel: number | null; isTeam: boolean };
export type HubPlayerRow = { name: string; position: string | null; masKmh: number | null; matchUnitLoad: number | null; matchUnitHsr: number | null; nNearFull: number; matchUnitConf?: "high" | "medium" | "low" | null; valdCap: number | null; gaps: number };
export type HubBlockRow = { phase: Bi; goal: Bi; goalKey?: string; start: string; end: string; weeks: number; isDeload: boolean; deloadWeekStart?: string | null; tmr: number | null; volumeTargetPct: number | null; flag: Bi | null };
export type HubPlayerBlock = { name: string; position: string | null; note: Bi; block: CalendarBlock };

export type PeriodizationHubPayload = {
  teamName: string; seasonYear: number; generatedAt?: string;
  teamUnit: MatchUnitAbs | null;
  tier: { label: Bi; loadSource: string; confidence: string } | null;
  phases: Array<{ label: Bi; start: string; end: string; weeks: number; matches: number; rationale: Bi }>;
  congested: Array<{ weekStart: string; matches: number }>;
  baselines: HubBaselineRow[];
  teamAxes: MatchAxes | null;
  blocks: HubBlockRow[];
  /** The scheduled block as the demo-format Mon–Sun calendar (rest days, deload-as-last-week, IMA per
   *  session). Replaces the old MD-list. */
  block: CalendarBlock | null;
  /** The chosen players' individualised blocks (own match unit + VALD ceiling + minutes trim) — one clean
   *  page each. The coach picks Selected / All / a custom subset; players without a match unit + GKs are
   *  omitted here (kept in the summary table). */
  playerBlocks: HubPlayerBlock[];
  /** Deprecated MD-list block (superseded by `block`, the calendar); accepted but no longer rendered. */
  mesoPlan?: MesoPlan | null;
  players: HubPlayerRow[];
};

const INK = "#14181c", MUTE = "#6b7280", LINE = "#e5e7eb", COBALT = "#2740e6", AMBER = "#de9328", PURPLE = "#7a5cc4", GREEN = "#1c7a4a", RED = "#a83e28", BONE = "#F4F2EC";
// Calendar day-type palette (shared vocabulary with the block PDF — one Top-up, MD-1 Activation, no "Restart").
const CAL_ACCENT: Record<CalType, string> = { mechanical: RED, locomotive: GREEN, mixed: COBALT, activation: "#64748b", topup: PURPLE, match: AMBER, rest: MUTE };
const CAL_TINT: Record<CalType, string> = { mechanical: "#F6E7E1", locomotive: "#E4F1EA", mixed: "#E7EAFB", activation: "#EFEFEF", topup: "#F0EAF7", match: "#FBEFDD", rest: BONE };

const s = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 44, paddingHorizontal: 40, fontSize: 9, color: INK, fontFamily: "Helvetica", lineHeight: 1.4 },
  h1: { fontSize: 18, fontFamily: "Helvetica-Bold" },
  sub: { fontSize: 9, color: MUTE, marginTop: 3 },
  tag: { marginTop: 7, alignSelf: "flex-start", fontSize: 7.5, color: COBALT, borderColor: COBALT, borderWidth: 1, borderRadius: 3, paddingVertical: 2, paddingHorizontal: 5 },
  section: { marginTop: 14 },
  h2: { fontSize: 12, fontFamily: "Helvetica-Bold", marginBottom: 5, borderBottomWidth: 1, borderBottomColor: LINE, paddingBottom: 2 },
  p: { marginBottom: 2 }, small: { fontSize: 7.5, color: MUTE },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: LINE, paddingVertical: 2.5 },
  th: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#cbd5e1", paddingBottom: 2 },
  thc: { fontSize: 7, color: MUTE, textTransform: "uppercase" },
  teamRow: { backgroundColor: "#f1f5f9" },
  chip: { fontSize: 7, fontFamily: "Helvetica-Bold", color: "#fff", borderRadius: 3, paddingVertical: 1.5, paddingHorizontal: 4, marginLeft: 5 },
  weekBox: { marginTop: 9, borderWidth: 1, borderColor: LINE, borderRadius: 5, padding: 8 },
  weekHead: { flexDirection: "row", alignItems: "center", marginBottom: 5 },
  dayRow: { flexDirection: "row", alignItems: "flex-start", borderTopWidth: 1, borderTopColor: LINE, paddingVertical: 2.5 },
  mdTag: { width: 40, fontSize: 7.5, fontFamily: "Helvetica-Bold", color: "#fff", borderRadius: 3, paddingVertical: 1.5, textAlign: "center" },
  flag: { marginTop: 4, backgroundColor: "#fef3c7", color: "#92400e", fontSize: 8, borderRadius: 3, padding: 4 },
  noteLi: { flexDirection: "row", marginBottom: 2 }, bullet: { width: 9, color: COBALT }, noteTxt: { flex: 1, fontSize: 8 },
  calBanner: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 3, paddingHorizontal: 6, borderRadius: 4, marginTop: 8 },
  calBannerTxt: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#fff" },
  calBannerR: { fontSize: 7.5, color: "#e5e7eb" },
  calHead: { flexDirection: "row", backgroundColor: COBALT, paddingVertical: 2.5, paddingHorizontal: 4 },
  calHc: { fontSize: 6.5, color: "#fff", textTransform: "uppercase", fontFamily: "Helvetica-Bold" },
  calRow: { flexDirection: "row", paddingVertical: 2, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: LINE, alignItems: "flex-start" },
  calCap: { fontSize: 6.5, color: MUTE, marginTop: 1 },
  callout: { marginBottom: 8, borderWidth: 1, borderColor: COBALT, borderRadius: 5, padding: 8 },
  calloutLead: { fontSize: 8, fontFamily: "Helvetica-Bold" },
  uChips: { flexDirection: "row", flexWrap: "wrap", marginTop: 5 },
  uChip: { paddingHorizontal: 7, marginBottom: 2, minWidth: 66 },
  uChipDiv: { borderRightWidth: 1, borderRightColor: LINE },
  uNum: { fontSize: 11.5, fontFamily: "Helvetica-Bold" },
  uLbl: { fontSize: 6.5, color: MUTE, marginTop: 1.5, textTransform: "uppercase", letterSpacing: 0.4 },
  foot: { position: "absolute", bottom: 20, left: 40, right: 40, paddingTop: 6, borderTopWidth: 1, borderTopColor: LINE, fontSize: 7, color: MUTE, lineHeight: 1.4 },
});

const L = {
  EN: { title: "periodization — full plan", prepared: "Prepared for the coaching staff · MicroPulse", tag: "Recommended from the team's own data — the coach decides and overrides",
    macro: "Season map (macro)", tier: "Data tier", congested: "Congested weeks (2+ matches)", demands: "Squad demands — baseline by position", axes: "Three axes vs the match (whole squad)",
    running: "Running (Locomotive) — training UNDER-reaches", mech: "Mechanical / IMA — training OVER-shoots", metric: "Metric", match: "Match", ceil: "Tr. ceiling",
    meso: "Meso blocks", block: "The scheduled block", players: "Players — individualisation", pos: "Pos", mas: "MAS", munit: "Match unit", vald: "VALD cap", gaps: "Gaps", week: "Week", deload: "Deload", overload: "overload", weekly: "weekly",
    munitLead: "THE MATCH IS THE UNIT (whole squad) — the running spine + the mechanical / IMA axis every block scales from (present where the feed carries it).",
    dist: "Distance", hsr: "HSR", load: "Player Load", accdec: "Acc + Dec", accB: "Acc B2–3", decB: "Dec B2–3", strideL: "Stride", dirL: "IMA dir", rhieL: "RHIE", symL: "Symmetry", metL: "Met power", fwd: "fwd", lat: "lat", back: "back",
    foot: "Descriptive planning — never sets the readiness colour, never overrides the daily decision. Targets scale from the team's / player's own match unit (median of near-full matches) and each MD day's %-of-match shape; a data-anchored starting point, not a norm to obey (Little & Buchheit). No single \"% of match\" — mechanical over-shoots, HSR/sprint fall short (Figueiredo). Never stack HSR + mechanical the same day. Cites: Figueiredo · Owen 2017 · Oliveira 2019 · Teixeira 2021 · Impellizzeri 2020 (ACWR contested)." },
  IS: { title: "tímabilsskipulag — heildaráætlun", prepared: "Unnið fyrir þjálfarateymið · MicroPulse", tag: "Ráðlagt út frá eigin gögnum liðsins — þjálfarinn ákveður og hnekkir",
    macro: "Tímabils-kort (makró)", tier: "Gagnastig", congested: "Þéttar vikur (2+ leikir)", demands: "Kröfur liðs — grunnlína eftir stöðu", axes: "Þrír ásar gagnvart leik (allt liðið)",
    running: "Hlaup (Locomotive) — æfing NÆR EKKI", mech: "Vélrænt / IMA — æfing FER YFIR", metric: "Mæling", match: "Leikur", ceil: "Æf.þak",
    meso: "Mesó lotur", block: "Skipulagða lotan", players: "Leikmenn — einstaklingsmiðun", pos: "Staða", mas: "MAS", munit: "Leikviðmið", vald: "VALD þak", gaps: "Vantar", week: "Vika", deload: "Niðurtröppun", overload: "álag", weekly: "vikumark",
    munitLead: "LEIKURINN ER EININGIN (allt liðið) — hlaupa-hryggurinn + vélræni / IMA ásinn sem hver lota skalar frá (þar sem gögnin ná).",
    dist: "Vegalengd", hsr: "Háhraði", load: "Player Load", accdec: "Acc + Dec", accB: "Acc B2–3", decB: "Dec B2–3", strideL: "Skref", dirL: "IMA stefna", rhieL: "RHIE", symL: "Samhverfa", metL: "Efnaafl", fwd: "fram", lat: "hlið", back: "aftur",
    foot: "Lýsandi áætlun — setur aldrei readiness-litinn, hnekkir aldrei daglegu ákvörðuninni. Álagsmörk skala frá eigin leikviðmiði (miðgildi næstum-heilla leikja) og %-af-leik lögun hvers MD-dags; gagna-festur upphafspunktur, ekki viðmið til að hlýða (Little & Buchheit). Ekkert eitt „%-af-leik“ — vélrænt fer yfir, háhraði/sprettur ná ekki (Figueiredo). Aldrei stafla háhraða + vélrænu sama dag. Vitnar í: Figueiredo · Owen 2017 · Oliveira 2019 · Teixeira 2021 · Impellizzeri 2020." },
} as const;

const shortDate = (iso: string, lang: Lang) => { try { return new Intl.DateTimeFormat(lang === "IS" ? "is-IS" : "en-GB", { day: "numeric", month: "short" }).format(new Date(`${iso}T00:00:00`)); } catch { return iso; } };
const km = (m: number | null) => (m == null ? "–" : m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${Math.round(m)}m`);

const nf = (n: number | null) => (n == null ? "—" : Math.round(n).toLocaleString("en-US"));
function domDir(d: { fwd: number; back: number; lat: number } | null, is: boolean): string | null {
  if (!d) return null;
  const m = Math.max(d.fwd, d.back, d.lat);
  const w = m === d.fwd ? (is ? "fram" : "fwd") : m === d.lat ? (is ? "hlið" : "lat") : (is ? "aftur" : "back");
  return `${w} ${Math.round(m * 100)}%`;
}
function dayIma(d: CalDay, is: boolean, unitStride: number | null): string {
  const p: string[] = [];
  if (d.accHiEff != null) p.push(`Acc B2–3 ${d.accHiEff}`);
  if (d.decHiEff != null) p.push(`Dec B2–3 ${d.decHiEff}`);
  // The ceiling marker attaches to the STRIDE value it refers to (built TO match, not beyond), not the dir.
  if (d.stride != null) p.push(`${is ? "Skref" : "Stride"} ${d.stride}${unitStride != null && d.stride >= unitStride && d.type !== "match" ? "†" : ""}`);
  const dd = domDir(d.dir, is); if (dd) p.push(`${is ? "stefna" : "dir"} → ${dd}`);
  return p.join("  ·  ");
}
/** The scheduled block as the demo-format Mon–Sun calendar: rest days as dashes, MD+1 top-up / MD+2 off,
 *  the match on its real weekday, the deload as the LAST week, and the per-session IMA line (tier-gated). */
function CalWeeks({ block, lang }: { block: CalendarBlock; lang: Lang }) {
  const is = lang === "IS";
  const bi = (b: Bi) => (is ? b.is : b.en);
  const hasMech = block.unit.accHiEff != null || block.unit.stride != null;
  return (
    <>
      {block.weeks.map((w) => (
        <View key={w.index} wrap={false}>
          <View style={[s.calBanner, { backgroundColor: w.isDeload ? AMBER : INK }]}>
            <Text style={s.calBannerTxt}>{is ? "Vika" : "Week"} {w.index + 1} — {bi(w.intent)}</Text>
            <Text style={s.calBannerR}>{is ? "leikur" : "match"} {bi(w.matchDow)} · ×{w.mult.toFixed(2)}{w.isDeload ? ` · ${is ? "NIÐURTR." : "DELOAD"}` : ""}</Text>
          </View>
          <View style={s.calHead}>
            <Text style={[s.calHc, { width: 26 }]}>{is ? "Dag" : "Day"}</Text><Text style={[s.calHc, { width: 32 }]}>MD</Text>
            <Text style={[s.calHc, { flex: 1 }]}>{is ? "Dagsgerð" : "Day-type"}</Text>
            <Text style={[s.calHc, { width: 40, textAlign: "right" }]}>DIST</Text><Text style={[s.calHc, { width: 34, textAlign: "right" }]}>HSR</Text><Text style={[s.calHc, { width: 34, textAlign: "right" }]}>LOAD</Text>
          </View>
          {w.days.map((d, i) => (
            <View key={i} style={[s.calRow, { backgroundColor: CAL_TINT[d.type] }]}>
              <Text style={{ width: 26, fontFamily: "Helvetica-Bold" }}>{bi(d.dow)}</Text>
              <Text style={{ width: 32, fontSize: 7, fontFamily: "Helvetica-Bold", color: CAL_ACCENT[d.type] }}>{d.md}</Text>
              <View style={{ flex: 1, paddingRight: 3 }}>
                <Text style={{ fontFamily: "Helvetica-Bold", color: CAL_ACCENT[d.type], fontSize: 8 }}>{bi(d.label)}</Text>
                {hasMech && d.type !== "rest" && dayIma(d, is, block.unit.stride) !== "" && <Text style={s.calCap}>{dayIma(d, is, block.unit.stride)}</Text>}
              </View>
              <Text style={{ width: 40, textAlign: "right" }}>{d.dist == null ? "—" : nf(d.dist)}</Text>
              <Text style={{ width: 34, textAlign: "right" }}>{d.hsr == null ? "—" : nf(d.hsr)}</Text>
              <Text style={{ width: 34, textAlign: "right", fontFamily: "Helvetica-Bold" }}>{d.load == null ? "—" : nf(d.load)}</Text>
            </View>
          ))}
          {w.capNote && <Text style={[s.calCap, { marginTop: 2, fontFamily: "Helvetica-Bold" }]}>{is ? "Vikuþak" : "Week cap"}: {bi(w.capNote)}</Text>}
        </View>
      ))}
      {block.unit.stride != null && <Text style={[s.calCap, { marginTop: 3 }]}>{is ? "† skref við leikþak (byggt AÐ leik) · stefna = leikmanns-undirskrift, hallar eftir dagsgerð (vélrænt/virkjun aftur+hlið, hlaup fram)." : "† stride at match ceiling (built TO match) · dir = the player's signature, tilted by day-type (mechanical/activation back+lateral, locomotive forward)."}</Text>}
    </>
  );
}

function AxisTable({ axis, t, bi }: { axis: MatchAxes["running"]; t: { metric: string; match: string; ceil: string }; bi: (b: Bi) => string }) {
  return (
    <View style={{ marginTop: 4 }}>
      <View style={s.th}><Text style={[s.thc, { flex: 1 }]}>{t.metric}</Text><Text style={[s.thc, { width: 60, textAlign: "right" }]}>{t.match}</Text><Text style={[s.thc, { width: 60, textAlign: "right" }]}>{t.ceil}</Text><Text style={[s.thc, { width: 60, textAlign: "right" }]}>%</Text></View>
      {axis.metrics.map((m, i) => (
        <View key={i} style={s.row}><Text style={{ flex: 1 }}>{bi(m.metric)}</Text><Text style={{ width: 60, textAlign: "right", color: MUTE }}>{m.matchValue}</Text><Text style={{ width: 60, textAlign: "right", fontFamily: "Helvetica-Bold" }}>{m.trainingCeiling}</Text><Text style={{ width: 60, textAlign: "right", color: MUTE }}>{m.band}</Text></View>
      ))}
      {axis.flag && <Text style={s.flag}>{bi(axis.flag)}</Text>}
    </View>
  );
}

function HubDoc({ payload, lang }: { payload: PeriodizationHubPayload; lang: Lang }) {
  const t = L[lang]; const bi = (b: Bi) => (lang === "IS" ? b.is : b.en);
  const { tier, phases, congested, baselines, teamAxes, blocks, block, playerBlocks, players, teamUnit } = payload;
  // #4 — align the detailed block's label/dates/goal to the season-map block that actually contains its start.
  const mapBlock = block ? blocks.find((b) => b.start <= block.startDate && block.startDate < b.end) ?? null : null;
  const nfmt = (n: number | null) => (n == null ? "—" : n.toLocaleString("en-US"));
  const kmv = (m: number | null) => (m == null ? "—" : m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);
  const dom = (u: MatchUnitAbs) => { if (u.dirFwd == null || u.dirBack == null || u.dirLat == null) return null; const m = Math.max(u.dirFwd, u.dirBack, u.dirLat); const w = m === u.dirFwd ? t.fwd : m === u.dirLat ? t.lat : t.back; return `${w} ${Math.round(m * 100)}%`; };
  const unitChips: Array<{ n: string; l: string; c: string }> = [];
  if (teamUnit) {
    unitChips.push({ n: kmv(teamUnit.dist), l: t.dist, c: INK }, { n: kmv(teamUnit.hsr), l: t.hsr, c: GREEN }, { n: `${nfmt(teamUnit.load)} AU`, l: t.load, c: PURPLE }, { n: nfmt(teamUnit.accdec), l: t.accdec, c: RED });
    if (teamUnit.accHiEff != null) unitChips.push({ n: nfmt(teamUnit.accHiEff), l: t.accB, c: RED });
    if (teamUnit.decHiEff != null) unitChips.push({ n: nfmt(teamUnit.decHiEff), l: t.decB, c: RED });
    if (teamUnit.stride != null) unitChips.push({ n: nfmt(teamUnit.stride), l: t.strideL, c: GREEN });
    const dd = dom(teamUnit); if (dd) unitChips.push({ n: dd, l: t.dirL, c: COBALT });
    if (teamUnit.rhie != null) unitChips.push({ n: nfmt(teamUnit.rhie), l: t.rhieL, c: PURPLE });
    if (teamUnit.symmetry != null) unitChips.push({ n: `${teamUnit.symmetry}`, l: t.symL, c: PURPLE });
    if (teamUnit.metPower != null) unitChips.push({ n: `${teamUnit.metPower}`, l: t.metL, c: PURPLE });
  }
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.h1}>{payload.teamName} — {t.title}</Text>
        <Text style={s.sub}>{t.prepared}{payload.generatedAt ? ` · ${payload.generatedAt.slice(0, 10)}` : ""} · {payload.seasonYear}</Text>
        <Text style={s.tag}>{t.tag}</Text>

        {/* MACRO */}
        <View style={s.section}>
          <Text style={s.h2}>{t.macro}</Text>
          {tier && <Text style={s.p}>{t.tier}: <Text style={{ fontFamily: "Helvetica-Bold" }}>{bi(tier.label)}</Text> · {tier.loadSource === "srpe" ? "sRPE" : tier.loadSource === "gps" ? "GPS" : "—"} · conf {tier.confidence}</Text>}
          {phases.map((ph, i) => (
            <Text key={i} style={s.p}><Text style={{ fontFamily: "Helvetica-Bold" }}>{bi(ph.label)}</Text> ({shortDate(ph.start, lang)}–{shortDate(ph.end, lang)}, {ph.weeks}w{ph.matches ? `, ${ph.matches} matches` : ""}) — {bi(ph.rationale)}</Text>
          ))}
          {congested.length > 0 && <Text style={[s.small, { marginTop: 3 }]}>{t.congested}: {congested.map((c) => `${shortDate(c.weekStart, lang)} (${c.matches})`).join(", ")}</Text>}
        </View>

        {/* DEMANDS — baseline by position */}
        <View style={s.section}>
          <Text style={s.h2}>{t.demands}</Text>
          {unitChips.length > 0 && (
            <View style={s.callout}>
              <Text style={s.calloutLead}>{t.munitLead}</Text>
              <View style={s.uChips}>
                {unitChips.map((c, i) => (
                  <View key={i} style={[s.uChip, i < unitChips.length - 1 ? s.uChipDiv : {}]}>
                    <Text style={[s.uNum, { color: c.c }]}>{c.n}</Text><Text style={s.uLbl}>{c.l}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
          <View style={s.th}><Text style={[s.thc, { flex: 1 }]}>{t.pos}</Text><Text style={[s.thc, { width: 46, textAlign: "right" }]}>Dist</Text><Text style={[s.thc, { width: 46, textAlign: "right" }]}>HSR</Text><Text style={[s.thc, { width: 40, textAlign: "right" }]}>Max</Text><Text style={[s.thc, { width: 40, textAlign: "right" }]}>PL</Text><Text style={[s.thc, { width: 60, textAlign: "right" }]}>Acc/Dec</Text></View>
          {baselines.map((b, i) => (
            <View key={i} style={[s.row, ...(b.isTeam ? [s.teamRow] : [])]}>
              <Text style={{ flex: 1, fontFamily: b.isTeam ? "Helvetica-Bold" : "Helvetica" }}>{bi(b.label)} ({b.players})</Text>
              <Text style={{ width: 46, textAlign: "right" }}>{km(b.distanceM)}</Text>
              <Text style={{ width: 46, textAlign: "right" }}>{b.hsrM == null ? "–" : `${Math.round(b.hsrM)}m`}</Text>
              <Text style={{ width: 40, textAlign: "right" }}>{b.maxKmh ?? "–"}</Text>
              <Text style={{ width: 40, textAlign: "right" }}>{b.playerLoad == null ? "–" : Math.round(b.playerLoad)}</Text>
              <Text style={{ width: 60, textAlign: "right" }}>{b.accel ?? "–"}/{b.decel ?? "–"}</Text>
            </View>
          ))}
        </View>

        {/* THREE AXES (whole squad) */}
        {teamAxes && (
          <View style={s.section} wrap={false}>
            <Text style={s.h2}>{t.axes}</Text>
            {teamAxes.hsrDeficit && <Text style={s.flag}>{bi(teamAxes.hsrDeficit)}</Text>}
            {teamAxes.mechNeglect && <Text style={s.flag}>{bi(teamAxes.mechNeglect)}</Text>}
            <Text style={[s.p, { marginTop: 5, fontFamily: "Helvetica-Bold" }]}>{t.running}</Text>
            <AxisTable axis={teamAxes.running} t={t} bi={bi} />
            <Text style={[s.p, { marginTop: 6, fontFamily: "Helvetica-Bold" }]}>{t.mech}</Text>
            <AxisTable axis={teamAxes.mechanical} t={t} bi={bi} />
          </View>
        )}

        {/* MESO BLOCKS */}
        {blocks.length > 0 && (
          <View style={s.section}>
            <Text style={s.h2}>{t.meso}</Text>
            {blocks.map((b, i) => (
              <View key={i} style={s.row}>
                <Text style={{ flex: 1, fontFamily: "Helvetica-Bold" }}>{bi(b.phase)}</Text>
                <Text style={{ width: 90, color: MUTE }}>{shortDate(b.start, lang)}–{shortDate(b.end, lang)} · {b.weeks}w</Text>
                <Text style={{ width: 70, textAlign: "right" }}>{b.tmr != null ? `TMr ${b.tmr}×` : ""}</Text>
                <Text style={{ width: 60, textAlign: "right" }}>{b.volumeTargetPct != null ? `${b.volumeTargetPct}%` : ""}</Text>
                <Text style={{ width: 90, textAlign: "right", color: b.isDeload ? AMBER : MUTE, fontSize: 7.5 }}>{b.flag ? bi(b.flag).slice(0, 28) : ""}</Text>
              </View>
            ))}
          </View>
        )}

        {/* SCHEDULED BLOCK — the demo-format Mon–Sun calendar (rest days, MD+1 top-up / MD+2 off,
            match on its real weekday, deload = last week, IMA per session). Title aligned to the map block. */}
        {block && (
          <View style={s.section}>
            <Text style={s.h2}>{t.block} — {bi(mapBlock ? mapBlock.phase : block.phase)}</Text>
            <Text style={s.small}>{shortDate(mapBlock ? mapBlock.start : block.startDate, lang)}–{shortDate(mapBlock ? mapBlock.end : (block.weeks[block.weeks.length - 1]?.weekStart ?? block.startDate), lang)} · {block.numWeeks}w · {block.scopeName === "__team__" ? (lang === "IS" ? "liðið" : "the squad") : block.scopeName}{mapBlock ? ` · ${bi(mapBlock.goal)}` : ""}</Text>
            {block.notes.slice(0, 3).map((n, i) => <View key={i} style={s.noteLi}><Text style={s.bullet}>•</Text><Text style={s.noteTxt}>{bi(n)}</Text></View>)}
            {congested.length > 0 && <Text style={[s.small, { marginTop: 2 }]}>{lang === "IS" ? "Þéttar vikur (2+ leikir) þjappa lotuna — færri gæðadagar milli leikja." : "Congested weeks (2+ matches) compress the block — fewer quality days between games."}</Text>}
            <CalWeeks block={block} lang={lang} />
          </View>
        )}

        {/* PLAYERS */}
        {players.length > 0 && (
          <View style={s.section}>
            <Text style={s.h2}>{t.players}</Text>
            <View style={s.th}><Text style={[s.thc, { flex: 1 }]}>{lang === "IS" ? "Leikmaður" : "Player"}</Text><Text style={[s.thc, { width: 34 }]}>{t.pos}</Text><Text style={[s.thc, { width: 50, textAlign: "right" }]}>{t.mas}</Text><Text style={[s.thc, { width: 118, textAlign: "right" }]}>{t.munit}</Text><Text style={[s.thc, { width: 44, textAlign: "right" }]}>{t.vald}</Text><Text style={[s.thc, { width: 34, textAlign: "right" }]}>{t.gaps}</Text></View>
            {players.map((p, i) => {
              const gk = /GK|MARK|KEEP/i.test(p.position ?? "");
              return (
              <View key={i} style={s.row}>
                <Text style={{ flex: 1 }}>{p.name}{gk ? (lang === "IS" ? "  (mm)" : "  (GK)") : ""}</Text>
                <Text style={{ width: 34, color: MUTE }}>{p.position ?? "–"}</Text>
                <Text style={{ width: 50, textAlign: "right" }}>{p.masKmh != null ? `${p.masKmh}` : "–"}</Text>
                <Text style={{ width: 118, textAlign: "right", color: gk ? MUTE : INK }}>{gk ? (lang === "IS" ? "sérlíkan" : "GK model") : (p.matchUnitLoad != null ? `${p.matchUnitLoad} PL · ${p.matchUnitHsr != null ? `${Math.round(p.matchUnitHsr)}m · ` : ""}n${p.nNearFull}${p.matchUnitConf && p.matchUnitConf !== "high" ? ` (${p.matchUnitConf})` : ""}` : "–")}</Text>
                <Text style={{ width: 44, textAlign: "right" }}>{p.valdCap != null ? `${p.valdCap}%` : "–"}</Text>
                <Text style={{ width: 34, textAlign: "right", color: p.gaps > 0 ? AMBER : "#1c7a4a" }}>{p.gaps}</Text>
              </View>
              );
            })}
            <Text style={[s.small, { marginTop: 3 }]}>{lang === "IS" ? "MAS í km/klst · Leikviðmið = miðgildi PL/HSR næstum-heilla leikja (n = fjöldi; lítil/miðlungs vissa → lestu sem vísbendingu, ekki hart mark) · VALD þak = geta til að taka álag · Vantar = fjöldi gagna-gata." : "MAS in km/h · Match unit = median PL/HSR of near-full matches (n = count; low/medium confidence → read as a hint, not a hard target) · VALD cap = readiness-to-load · Gaps = missing/stale data items."}</Text>
            <Text style={[s.small, { marginTop: 1 }]}>{lang === "IS" ? "„–“ = engin næstum-heilir leikir enn (leikviðmið) eða ekkert VALD-próf (þak) — ekki villa; fyllist eftir því sem gögn safnast. Markmenn (mm) nota sérstakt álagslíkan, ekki útspilara-periodiseringu." : "\"–\" = no near-full matches yet (match unit) or no VALD test (cap) — not a bug; fills in as data accrues. Goalkeepers (GK) use a separate load model, not outfield periodization."}</Text>
          </View>
        )}

        {/* PER-PLAYER BLOCKS (appendix) — one clean page per chosen player: own match unit, VALD ceiling +
            minutes trim applied. A plan, not just a table row. */}
        {playerBlocks.map((pbk, i) => (
          <View key={i} style={s.section} break>
            <Text style={s.h2}>{lang === "IS" ? "Einstaklings-lota" : "Individualised block"} — {pbk.name}{pbk.position ? ` (${pbk.position})` : ""}</Text>
            <Text style={s.small}>{bi(pbk.note)}</Text>
            <CalWeeks block={pbk.block} lang={lang} />
          </View>
        ))}

        <Text style={s.foot} fixed>{t.foot}</Text>
      </Page>
    </Document>
  );
}

export async function downloadPeriodizationHubPdf(payload: PeriodizationHubPayload, lang: Lang) {
  const blob = await pdf(<HubDoc payload={payload} lang={lang} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${payload.teamName.replace(/\s+/g, "-")}-periodization-${payload.seasonYear}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
