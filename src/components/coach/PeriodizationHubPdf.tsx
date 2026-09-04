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
import type { MesoPlan, MatchAxes, MatchUnitAbs, Bi } from "@/lib/micropulse/periodization/index";

type Lang = "EN" | "IS";

export type HubBaselineRow = { label: Bi; players: number; distanceM: number | null; hsrM: number | null; maxKmh: number | null; playerLoad: number | null; accel: number | null; decel: number | null; isTeam: boolean };
export type HubPlayerRow = { name: string; position: string | null; masKmh: number | null; matchUnitLoad: number | null; matchUnitHsr: number | null; nNearFull: number; valdCap: number | null; gaps: number };
export type HubBlockRow = { phase: Bi; goal: Bi; start: string; end: string; weeks: number; isDeload: boolean; tmr: number | null; volumeTargetPct: number | null; flag: Bi | null };

export type PeriodizationHubPayload = {
  teamName: string; seasonYear: number; generatedAt?: string;
  teamUnit: MatchUnitAbs | null;
  tier: { label: Bi; loadSource: string; confidence: string } | null;
  phases: Array<{ label: Bi; start: string; end: string; weeks: number; matches: number; rationale: Bi }>;
  congested: Array<{ weekStart: string; matches: number }>;
  baselines: HubBaselineRow[];
  teamAxes: MatchAxes | null;
  blocks: HubBlockRow[];
  mesoPlan: MesoPlan | null;
  players: HubPlayerRow[];
};

const INK = "#14181c", MUTE = "#6b7280", LINE = "#e5e7eb", COBALT = "#2740e6", AMBER = "#de9328", PURPLE = "#7a5cc4", GREEN = "#1c7a4a", RED = "#a83e28";
const TYPE_COLOR: Record<string, string> = { mechanical: "#a83e28", locomotive: COBALT, mixed: PURPLE, technical: "#64748b", restart: AMBER, topup: AMBER, match: "#1c7a4a" };

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
  const { tier, phases, congested, baselines, teamAxes, blocks, mesoPlan, players, teamUnit } = payload;
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

        {/* SCHEDULED BLOCK (plan-ahead) */}
        {mesoPlan && (
          <View style={s.section}>
            <Text style={s.h2}>{t.block} — {bi(mesoPlan.goal)}</Text>
            {mesoPlan.notes.slice(0, 3).map((n, i) => <View key={i} style={s.noteLi}><Text style={s.bullet}>•</Text><Text style={s.noteTxt}>{bi(n)}</Text></View>)}
            {mesoPlan.weeks.map((w) => (
              <View key={w.index} style={s.weekBox} wrap={false}>
                <View style={s.weekHead}>
                  <Text style={{ fontSize: 10.5, fontFamily: "Helvetica-Bold" }}>{t.week} {w.index + 1} · {shortDate(w.weekStart, lang)}</Text>
                  <Text style={[s.chip, { backgroundColor: w.isDeload ? AMBER : COBALT }]}>{w.isDeload ? t.deload : `${w.overloadPct}% ${t.overload}`}</Text>
                  {w.weeklyLoadTarget != null && <Text style={{ fontSize: 8, color: MUTE, marginLeft: 6 }}>{t.weekly} ≈ {w.weeklyLoadTarget} PL{w.tmr != null ? ` (${w.tmr}×)` : ""}</Text>}
                </View>
                {w.sessions.map((d, i) => (
                  <View key={i} style={s.dayRow}>
                    <Text style={[s.mdTag, { backgroundColor: TYPE_COLOR[d.type] ?? MUTE }]}>{d.mdTag}</Text>
                    <Text style={{ width: 74, fontSize: 8.5, fontFamily: "Helvetica-Bold", paddingLeft: 5 }}>{bi(d.label)}</Text>
                    <Text style={{ flex: 1, fontSize: 8, color: "#374151" }}>{d.targets.map((x) => `${bi(x.metric)}: ${x.value}`).join("   ")}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        )}

        {/* PLAYERS */}
        {players.length > 0 && (
          <View style={s.section}>
            <Text style={s.h2}>{t.players}</Text>
            <View style={s.th}><Text style={[s.thc, { flex: 1 }]}>{lang === "IS" ? "Leikmaður" : "Player"}</Text><Text style={[s.thc, { width: 34 }]}>{t.pos}</Text><Text style={[s.thc, { width: 50, textAlign: "right" }]}>{t.mas}</Text><Text style={[s.thc, { width: 90, textAlign: "right" }]}>{t.munit}</Text><Text style={[s.thc, { width: 44, textAlign: "right" }]}>{t.vald}</Text><Text style={[s.thc, { width: 34, textAlign: "right" }]}>{t.gaps}</Text></View>
            {players.map((p, i) => (
              <View key={i} style={s.row}>
                <Text style={{ flex: 1 }}>{p.name}</Text>
                <Text style={{ width: 34, color: MUTE }}>{p.position ?? "–"}</Text>
                <Text style={{ width: 50, textAlign: "right" }}>{p.masKmh != null ? `${p.masKmh}` : "–"}</Text>
                <Text style={{ width: 90, textAlign: "right" }}>{p.matchUnitLoad != null ? `${p.matchUnitLoad} PL${p.matchUnitHsr != null ? ` · ${Math.round(p.matchUnitHsr)}m` : ""}` : (p.nNearFull === 0 ? "–" : "–")}</Text>
                <Text style={{ width: 44, textAlign: "right" }}>{p.valdCap != null ? `${p.valdCap}%` : "–"}</Text>
                <Text style={{ width: 34, textAlign: "right", color: p.gaps > 0 ? AMBER : "#1c7a4a" }}>{p.gaps}</Text>
              </View>
            ))}
            <Text style={[s.small, { marginTop: 3 }]}>{lang === "IS" ? "MAS í km/klst · Leikviðmið = miðgildi PL/HSR næstum-heilla leikja · VALD þak = geta til að taka álag · Vantar = fjöldi gagna-gata." : "MAS in km/h · Match unit = median PL/HSR of near-full matches · VALD cap = readiness-to-load · Gaps = missing/stale data items."}</Text>
          </View>
        )}

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
