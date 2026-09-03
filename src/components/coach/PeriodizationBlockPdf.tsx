"use client";

/**
 * PeriodizationBlockPdf — a scheduled mesocycle as a match-anchored calendar, styled to the approved
 * demo (MicroPulse-Periodization-Manudur1-Demo.pdf).
 *
 * Page 1: navy header band, the match unit as four colour-coded stat chips, a weekly progressive-overload
 * table (training total as % of one match, per dimension), and the MD microcycle template. Page 2+:
 * session-by-session Mon–Sun tables for the whole block — absolute DIST/HSR/LOAD, day-type row tints,
 * rest days as em-dashes, a friendly (MD-0) alternating Sat/Sun.
 *
 * Numbers scale from the scope's own match unit; a starting point, never a norm (Little & Buchheit).
 * Descriptive — never the readiness colour.
 */

import { Document, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import type { CalendarBlock, CalType, Bi } from "@/lib/micropulse/periodization/index";

type Lang = "EN" | "IS";
export type PeriodizationBlockPayload = { teamName: string; block: CalendarBlock; generatedAt?: string };

const NAVY = "#14181C", INK = "#14181C", MUTE = "#6b7280", LINE = "#DCD9CF", BONE = "#F4F2EC";
const COBALT = "#2740E6", AMBER = "#DE9328", PURPLE = "#7A5CC4", GREEN = "#1C7A4A", RED = "#A83E28";
const DELOAD_TINT = "#FCF2E2";
const ACCENT: Record<CalType, string> = { mechanical: RED, locomotive: GREEN, mixed: COBALT, activation: "#64748b", topup: PURPLE, match: AMBER, rest: MUTE };
const TINT: Record<CalType, string> = { mechanical: "#F6E7E1", locomotive: "#E4F1EA", mixed: "#E7EAFB", activation: "#EFEFEF", topup: "#F0EAF7", match: "#FBEFDD", rest: BONE };

const s = StyleSheet.create({
  page: { paddingTop: 38, paddingBottom: 40, paddingHorizontal: 40, fontSize: 8.5, color: INK, fontFamily: "Helvetica", lineHeight: 1.35 },
  band: { backgroundColor: NAVY, marginHorizontal: -40, marginTop: -38, paddingHorizontal: 40, paddingTop: 22, paddingBottom: 16, borderTopWidth: 3, borderTopColor: COBALT },
  eyebrow: { fontSize: 8, letterSpacing: 3, color: "#8ea2ff", fontFamily: "Helvetica-Bold" },
  h1: { fontSize: 19, fontFamily: "Helvetica-Bold", color: "#ffffff", marginTop: 3 },
  bandSub: { fontSize: 9, color: "#c7cdd6", marginTop: 3 },
  callout: { marginTop: 14, borderWidth: 1, borderColor: COBALT, borderRadius: 6, padding: 10 },
  calloutLead: { fontSize: 9, fontFamily: "Helvetica-Bold" },
  chips: { flexDirection: "row", marginTop: 8 },
  chip: { flex: 1, paddingHorizontal: 8 },
  chipDiv: { borderRightWidth: 1, borderRightColor: LINE },
  chipNum: { fontSize: 14, fontFamily: "Helvetica-Bold" },
  chipLbl: { fontSize: 7, color: MUTE, marginTop: 2, textTransform: "uppercase", letterSpacing: 0.5 },
  h2: { fontSize: 12, fontFamily: "Helvetica-Bold", marginTop: 16, marginBottom: 5 },
  narr: { fontSize: 8.5, color: "#374151", marginBottom: 6 },
  navHead: { flexDirection: "row", backgroundColor: NAVY, paddingVertical: 3.5, paddingHorizontal: 5 },
  cobHead: { flexDirection: "row", backgroundColor: COBALT, paddingVertical: 3.5, paddingHorizontal: 5 },
  hc: { fontSize: 7, color: "#ffffff", textTransform: "uppercase", letterSpacing: 0.4, fontFamily: "Helvetica-Bold" },
  row: { flexDirection: "row", paddingVertical: 2.8, paddingHorizontal: 5, borderBottomWidth: 1, borderBottomColor: LINE, alignItems: "flex-start" },
  weekBanner: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 4, paddingHorizontal: 7, borderRadius: 4, marginTop: 12 },
  weekBannerTxt: { fontSize: 10.5, fontFamily: "Helvetica-Bold", color: "#ffffff" },
  weekBannerR: { fontSize: 8.5, color: "#e5e7eb" },
  mdTag: { fontSize: 7, fontFamily: "Helvetica-Bold" },
  footRow: { position: "absolute", bottom: 18, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: LINE, paddingTop: 6 },
  footTxt: { fontSize: 7, color: MUTE },
  noteLi: { flexDirection: "row", marginBottom: 2 }, bullet: { width: 9, color: COBALT }, noteTxt: { flex: 1, fontSize: 8, color: "#374151" },
  tag: { marginTop: 10, alignSelf: "flex-start", fontSize: 7.5, color: COBALT, borderColor: COBALT, borderWidth: 1, borderRadius: 3, paddingVertical: 2, paddingHorizontal: 5 },
});

const L = {
  EN: { eyebrow: "MICROPULSE", plan: "Periodization Plan", block: "Week Block", anchored: "match-anchored · individualised to", team: "the squad",
    tag: "Recommended from the team's own data — the coach decides and overrides",
    unitLead: "THE MATCH IS THE UNIT — one near-full match (median, ≥80 min), the multiple every training week is scaled from.",
    dist: "Distance", hsr: "HSR (V5+V6)", load: "Player Load", accdec: "Acc + Dec",
    ramp: "Progressive overload — weekly ramp", rampNarr: "Each week's training load is a multiple of the match, rising to a peak then a deload. Running distance and HSR accumulate above one match; mechanical work (accel/decel, read on Player Load) accumulates highest — it over-shoots the match while HSR sits under it per session.",
    week: "Week", intent: "Intent", running: "Running dist", mech: "Mechanical", rest: "Rest days", deload: "Deload", match: "match",
    theWeek: "The week — matchday-anchored microcycle", weekNarr: "Built around a weekly friendly (MD-0) that alternates Saturday / Sunday. After the match: a light top-up (MD+1), then a full day off (MD+2). Sessions are spaced so there are never more than three in a row — often just two — with HSR (Locomotive) and mechanical work on separate days to protect the posterior chain. The deload week adds rest.",
    md: "MD", dayType: "Day-type", whatItIs: "What it is",
    sbs: "Session-by-session — the full block", sbsNarr: "Absolute per-session targets, scaled from the match unit by the day-type and the week multiplier. DIST and HSR in metres; LOAD in Player Load (AU). Rest days shown as dashes.",
    day: "Day", focus: "Focus", footer: "MicroPulse — Periodization Plan",
    foot: "Descriptive planning — never sets the readiness colour, never overrides the daily decision. Targets scale from the scope's own match unit (median of near-full matches ≥80 min) by each day-type's share of the match and the week multiplier; a data-anchored starting point, not a norm to obey (Little & Buchheit). No single \"% of match\" — mechanical over-shoots, HSR/sprint fall short (Figueiredo). Cites: Figueiredo · Owen 2017 · Oliveira 2019 · Teixeira 2021." },
  IS: { eyebrow: "MICROPULSE", plan: "Tímabilsáætlun", block: "vikna lota", anchored: "leik-fest · einstaklingsmiðað fyrir", team: "liðið",
    tag: "Ráðlagt út frá eigin gögnum liðsins — þjálfarinn ákveður og hnekkir",
    unitLead: "LEIKURINN ER EININGIN — einn næstum-heill leikur (miðgildi, ≥80 mín), margfeldið sem hver æfingavika skalar frá.",
    dist: "Vegalengd", hsr: "Háhraði (V5+V6)", load: "Player Load", accdec: "Acc + Dec",
    ramp: "Stígandi álag — vikuleg þróun", rampNarr: "Álag hverrar viku er margfeldi af leiknum, hækkar að toppi og svo niðurtröppun. Vegalengd og háhraði safnast yfir einn leik; vélrænt (accel/decel, lesið á Player Load) safnast hæst — það fer yfir leikinn meðan háhraði er undir honum per æfingu.",
    week: "Vika", intent: "Markmið", running: "Hlaup vegal.", mech: "Vélrænt", rest: "Hvíldard.", deload: "Niðurtröppun", match: "leik",
    theWeek: "Vikan — leikdags-fest microcycle", weekNarr: "Byggt um vikulegan æfingaleik (MD-0) sem skiptist á laugardag / sunnudag. Eftir leik: létt áfylling (MD+1), svo heill frídagur (MD+2). Æfingar dreifðar svo aldrei eru fleiri en þrjár í röð — oft bara tvær — með háhraða (Locomotive) og vélrænu á sitt hvorum degi til að vernda afturkeðjuna. Niðurtröppunarvikan bætir við hvíld.",
    md: "MD", dayType: "Dagsgerð", whatItIs: "Hvað það er",
    sbs: "Æfing fyrir æfingu — öll lotan", sbsNarr: "Alger mörk per æfingu, skalað frá leikviðmiðinu eftir dagsgerð og vikumargfeldi. VEGAL og HÁHRAÐI í metrum; ÁLAG í Player Load (AU). Hvíldardagar sýndir sem strik.",
    day: "Dagur", focus: "Áhersla", footer: "MicroPulse — Tímabilsáætlun",
    foot: "Lýsandi áætlun — setur aldrei readiness-litinn, hnekkir aldrei daglegu ákvörðuninni. Álagsmörk skala frá eigin leikviðmiði (miðgildi næstum-heilla leikja ≥80 mín) eftir hlutdeild hverrar dagsgerðar og vikumargfeldi; gagna-festur upphafspunktur, ekki viðmið til að hlýða (Little & Buchheit). Ekkert eitt „%-af-leik“ — vélrænt fer yfir, háhraði/sprettur ná ekki (Figueiredo). Vitnar í: Figueiredo · Owen 2017 · Oliveira 2019 · Teixeira 2021." },
} as const;

const nfmt = (n: number | null) => (n == null ? "—" : n.toLocaleString("en-US"));

function Footer({ t }: { t: { footer: string } }) {
  return (
    <View style={s.footRow} fixed>
      <Text style={s.footTxt}>{t.footer}</Text>
      <Text style={s.footTxt} render={({ pageNumber }) => `Page ${pageNumber}`} />
    </View>
  );
}

function BlockDoc({ payload, lang }: { payload: PeriodizationBlockPayload; lang: Lang }) {
  const t = L[lang]; const bi = (b: Bi) => (lang === "IS" ? b.is : b.en);
  const { block } = payload; const u = block.unit;
  const who = block.scopeName === "__team__" ? t.team : `${block.scopeName}${block.scopePos ? ` (${block.scopePos})` : ""}`;
  return (
    <Document>
      {/* PAGE 1 — overview */}
      <Page size="A4" style={s.page}>
        <View style={s.band}>
          <Text style={s.eyebrow}>{t.eyebrow}</Text>
          <Text style={s.h1}>{t.plan} — {block.numWeeks}-{t.block}</Text>
          <Text style={s.bandSub}>{bi(block.phase)} · {t.anchored} {who}</Text>
        </View>

        {/* Match-unit callout */}
        <View style={s.callout}>
          <Text style={s.calloutLead}>{t.unitLead}</Text>
          <View style={s.chips}>
            <View style={[s.chip, s.chipDiv]}><Text style={[s.chipNum, { color: INK }]}>{nfmt(u.dist)} m</Text><Text style={s.chipLbl}>{t.dist}</Text></View>
            <View style={[s.chip, s.chipDiv]}><Text style={[s.chipNum, { color: GREEN }]}>{nfmt(u.hsr)} m</Text><Text style={s.chipLbl}>{t.hsr}</Text></View>
            <View style={[s.chip, s.chipDiv]}><Text style={[s.chipNum, { color: PURPLE }]}>{nfmt(u.load)} AU</Text><Text style={s.chipLbl}>{t.load}</Text></View>
            <View style={s.chip}><Text style={[s.chipNum, { color: RED }]}>{nfmt(u.accdec)}</Text><Text style={s.chipLbl}>{t.accdec}</Text></View>
          </View>
        </View>

        {/* Progressive-overload table */}
        <Text style={s.h2}>{t.ramp}</Text>
        <Text style={s.narr}>{t.rampNarr}</Text>
        <View style={s.navHead}>
          <Text style={[s.hc, { width: 54 }]}>{t.week}</Text><Text style={[s.hc, { flex: 1 }]}>{t.intent}</Text>
          <Text style={[s.hc, { width: 62, textAlign: "right" }]}>{t.running}</Text><Text style={[s.hc, { width: 46, textAlign: "right" }]}>HSR</Text>
          <Text style={[s.hc, { width: 62, textAlign: "right" }]}>{t.mech}</Text><Text style={[s.hc, { width: 52, textAlign: "right" }]}>{t.rest}</Text>
        </View>
        {block.weeks.map((w, i) => (
          <View key={w.index} style={[s.row, { backgroundColor: w.isDeload ? DELOAD_TINT : i % 2 ? BONE : "#ffffff" }]}>
            <Text style={{ width: 54, fontFamily: "Helvetica-Bold" }}>{t.week} {w.index + 1}</Text>
            <Text style={{ flex: 1, color: w.isDeload ? AMBER : INK }}>{bi(w.intent)}</Text>
            <Text style={{ width: 62, textAlign: "right", color: INK }}>{w.pctRunning != null ? `${w.pctRunning}%` : "—"}</Text>
            <Text style={{ width: 46, textAlign: "right", color: GREEN }}>{w.pctHsr != null ? `${w.pctHsr}%` : "—"}</Text>
            <Text style={{ width: 62, textAlign: "right", color: RED, fontFamily: "Helvetica-Bold" }}>{w.pctMech != null ? `${w.pctMech}%` : "—"}</Text>
            <Text style={{ width: 52, textAlign: "right" }}>{w.restDays}</Text>
          </View>
        ))}

        {/* Microcycle template */}
        <Text style={s.h2}>{t.theWeek}</Text>
        <Text style={s.narr}>{t.weekNarr}</Text>
        <View style={s.cobHead}><Text style={[s.hc, { width: 52 }]}>{t.md}</Text><Text style={[s.hc, { width: 120 }]}>{t.dayType}</Text><Text style={[s.hc, { flex: 1 }]}>{t.whatItIs}</Text></View>
        {block.legend.map((g, i) => (
          <View key={i} style={[s.row, { backgroundColor: i % 2 ? BONE : "#ffffff" }]}>
            <Text style={{ width: 52, fontFamily: "Helvetica-Bold", color: COBALT }}>{g.md}</Text>
            <Text style={{ width: 120, fontFamily: "Helvetica-Bold" }}>{bi(g.label)}</Text>
            <Text style={{ flex: 1, color: "#374151" }}>{bi(g.what)}</Text>
          </View>
        ))}
        <Text style={s.tag}>{t.tag}</Text>
        <Footer t={t} />
      </Page>

      {/* PAGE 2+ — session-by-session */}
      <Page size="A4" style={s.page}>
        <Text style={s.h2}>{t.sbs}</Text>
        <Text style={s.narr}>{t.sbsNarr}</Text>
        {block.weeks.map((w) => (
          <View key={w.index} wrap={false}>
            <View style={[s.weekBanner, { backgroundColor: w.isDeload ? AMBER : NAVY }]}>
              <Text style={s.weekBannerTxt}>{t.week} {w.index + 1} — {bi(w.intent)}</Text>
              <Text style={s.weekBannerR}>{t.match} {bi(w.matchDow)} · ×{w.mult.toFixed(2)}{w.isDeload ? ` · ${t.deload.toUpperCase()}` : ""}</Text>
            </View>
            <View style={s.cobHead}>
              <Text style={[s.hc, { width: 32 }]}>{t.day}</Text><Text style={[s.hc, { width: 38 }]}>{t.md}</Text><Text style={[s.hc, { width: 76 }]}>{t.dayType}</Text>
              <Text style={[s.hc, { flex: 1 }]}>{t.focus}</Text>
              <Text style={[s.hc, { width: 44, textAlign: "right" }]}>DIST</Text><Text style={[s.hc, { width: 40, textAlign: "right" }]}>HSR</Text><Text style={[s.hc, { width: 40, textAlign: "right" }]}>LOAD</Text>
            </View>
            {w.days.map((d, i) => (
              <View key={i} style={[s.row, { backgroundColor: TINT[d.type] }]}>
                <Text style={{ width: 32, fontFamily: "Helvetica-Bold" }}>{bi(d.dow)}</Text>
                <Text style={[s.mdTag, { width: 38, color: ACCENT[d.type] }]}>{d.md}</Text>
                <Text style={{ width: 76, fontFamily: "Helvetica-Bold", color: ACCENT[d.type] }}>{bi(d.label)}</Text>
                <Text style={{ flex: 1, color: "#374151", paddingRight: 4 }}>{bi(d.focus)}</Text>
                <Text style={{ width: 44, textAlign: "right" }}>{d.dist == null ? "—" : nfmt(d.dist)}</Text>
                <Text style={{ width: 40, textAlign: "right" }}>{d.hsr == null ? "—" : nfmt(d.hsr)}</Text>
                <Text style={{ width: 40, textAlign: "right", fontFamily: "Helvetica-Bold" }}>{d.load == null ? "—" : nfmt(d.load)}</Text>
              </View>
            ))}
          </View>
        ))}
        <View style={{ marginTop: 12 }}>
          {block.notes.map((n, i) => <View key={i} style={s.noteLi}><Text style={s.bullet}>•</Text><Text style={s.noteTxt}>{bi(n)}</Text></View>)}
        </View>
        <Text style={[s.footTxt, { marginTop: 10 }]}>{t.foot}</Text>
        <Footer t={t} />
      </Page>
    </Document>
  );
}

export async function downloadPeriodizationBlockPdf(payload: PeriodizationBlockPayload, lang: Lang) {
  const blob = await pdf(<BlockDoc payload={payload} lang={lang} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const name = payload.block.scopeName === "__team__" ? payload.teamName : payload.block.scopeName;
  a.href = url;
  a.download = `${name.replace(/\s+/g, "-")}-periodization-block.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
