"use client";

/**
 * PeriodizationBlockPdf — a scheduled mesocycle as a match-anchored calendar (the demo format).
 *
 * Cover: the match unit (the near-full match every training week is scaled from) as four stat tiles,
 * a weekly progressive-overload ramp (each week's accumulated running / HSR / mechanical as a % of one
 * match), and the MD day-type legend. Then a session-by-session Mon–Sun breakdown of the whole block —
 * absolute DIST/HSR/LOAD per session, rest days as dashes, a friendly (MD-0) alternating Sat/Sun.
 *
 * Numbers scale from the player's / team's own match unit; a starting point, never a norm (Little &
 * Buchheit). Descriptive — never the readiness colour.
 */

import { Document, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import type { CalendarBlock, Bi } from "@/lib/micropulse/periodization/index";

type Lang = "EN" | "IS";
export type PeriodizationBlockPayload = { teamName: string; block: CalendarBlock; generatedAt?: string };

const INK = "#14181c", MUTE = "#6b7280", LINE = "#e5e7eb", COBALT = "#2740e6", AMBER = "#de9328", PURPLE = "#7a5cc4", GREEN = "#1c7a4a", RED = "#a83e28";
const TYPE_COLOR: Record<string, string> = { mechanical: RED, locomotive: COBALT, mixed: PURPLE, activation: "#64748b", topup: AMBER, match: GREEN, rest: "#cbd5e1" };

const s = StyleSheet.create({
  page: { paddingTop: 38, paddingBottom: 42, paddingHorizontal: 40, fontSize: 8.5, color: INK, fontFamily: "Helvetica", lineHeight: 1.35 },
  eyebrow: { fontSize: 8, letterSpacing: 2, color: COBALT, fontFamily: "Helvetica-Bold" },
  h1: { fontSize: 19, fontFamily: "Helvetica-Bold", marginTop: 2 },
  sub: { fontSize: 9.5, color: MUTE, marginTop: 3 },
  lead: { fontSize: 9, marginTop: 12, color: "#374151" },
  tiles: { flexDirection: "row", gap: 8, marginTop: 8 },
  tile: { flex: 1, borderWidth: 1, borderColor: LINE, borderRadius: 6, padding: 8 },
  tileNum: { fontSize: 15, fontFamily: "Helvetica-Bold" },
  tileLbl: { fontSize: 7.5, color: MUTE, marginTop: 2, textTransform: "uppercase", letterSpacing: 0.5 },
  h2: { fontSize: 12, fontFamily: "Helvetica-Bold", marginTop: 16, marginBottom: 4 },
  narr: { fontSize: 8.5, color: "#374151", marginBottom: 5 },
  th: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#cbd5e1", paddingBottom: 2.5, marginTop: 2 },
  thc: { fontSize: 7, color: MUTE, textTransform: "uppercase", letterSpacing: 0.3 },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: LINE, paddingVertical: 2.5, alignItems: "flex-start" },
  chip: { fontSize: 7, fontFamily: "Helvetica-Bold", color: "#fff", borderRadius: 3, paddingVertical: 1.5, paddingHorizontal: 4 },
  weekHead: { flexDirection: "row", alignItems: "center", marginTop: 12, marginBottom: 3 },
  weekTitle: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  mdTag: { width: 40, fontSize: 7, fontFamily: "Helvetica-Bold", color: "#fff", borderRadius: 3, paddingVertical: 1.5, textAlign: "center" },
  foot: { position: "absolute", bottom: 20, left: 40, right: 40, paddingTop: 6, borderTopWidth: 1, borderTopColor: LINE, fontSize: 7, color: MUTE, lineHeight: 1.4 },
  noteLi: { flexDirection: "row", marginBottom: 2 }, bullet: { width: 9, color: COBALT }, noteTxt: { flex: 1, fontSize: 8 },
});

const L = {
  EN: { eyebrow: "MICROPULSE", plan: "Periodization Plan", block: "Week Block", anchored: "match-anchored · individualised to", team: "the squad",
    unitLead: "THE MATCH IS THE UNIT — one near-full match (median, ≥80 min), the multiple every training week is scaled from.",
    dist: "Distance", hsr: "HSR (V5+V6)", load: "Player Load", accdec: "Acc + Dec",
    ramp: "Progressive overload — weekly ramp", rampNarr: "Each week's training load is a multiple of the match, rising to a peak then a deload. Running distance and HSR accumulate above one match; mechanical work (accel/decel, read on Player Load) accumulates highest — it over-shoots the match while HSR sits under it per session.",
    week: "Week", intent: "Intent", running: "Running dist", mech: "Mechanical", rest: "Rest days", deload: "Deload", match: "match", overload: "overload",
    theWeek: "The week — matchday-anchored microcycle", weekNarr: "Built around a weekly friendly (MD-0) that alternates Saturday / Sunday. After the match: a light top-up (MD+1), then a full day off (MD+2). Sessions are spaced so there are never more than three in a row, with HSR (Locomotive) and mechanical work on separate days to protect the posterior chain. The deload week adds rest.",
    md: "MD", dayType: "Day-type", whatItIs: "What it is",
    sbs: "Session-by-session — the full block", sbsNarr: "Absolute per-session targets, scaled from the match unit by the day-type and the week multiplier. DIST and HSR in metres; LOAD in Player Load (AU). Rest days shown as dashes.",
    day: "Day", focus: "Focus",
    foot: "Descriptive planning — never sets the readiness colour, never overrides the daily decision. Targets scale from the player's / team's own match unit (median of near-full matches ≥80 min) by each day-type's share of the match and the week multiplier; a data-anchored starting point, not a norm to obey (Little & Buchheit). No single \"% of match\" — mechanical over-shoots, HSR/sprint fall short (Figueiredo). Cites: Figueiredo · Owen 2017 · Oliveira 2019 · Teixeira 2021." },
  IS: { eyebrow: "MICROPULSE", plan: "Tímabilsáætlun", block: "vikna lota", anchored: "leik-fest · einstaklingsmiðað fyrir", team: "liðið",
    unitLead: "LEIKURINN ER EININGIN — einn næstum-heill leikur (miðgildi, ≥80 mín), margfeldið sem hver æfingavika skalar frá.",
    dist: "Vegalengd", hsr: "Háhraði (V5+V6)", load: "Player Load", accdec: "Acc + Dec",
    ramp: "Stígandi álag — vikuleg þróun", rampNarr: "Álag hverrar viku er margfeldi af leiknum, hækkar að toppi og svo niðurtröppun. Vegalengd og háhraði safnast yfir einn leik; vélrænt (accel/decel, lesið á Player Load) safnast hæst — það fer yfir leikinn meðan háhraði er undir honum per æfingu.",
    week: "Vika", intent: "Markmið", running: "Hlaup vegal.", mech: "Vélrænt", rest: "Hvíldard.", deload: "Niðurtröppun", match: "leik", overload: "álag",
    theWeek: "Vikan — leikdags-fest microcycle", weekNarr: "Byggt um vikulegan æfingaleik (MD-0) sem skiptist á laugardag / sunnudag. Eftir leik: létt áfylling (MD+1), svo heill frídagur (MD+2). Æfingar dreifðar svo aldrei eru fleiri en þrjár í röð, með háhraða (Locomotive) og vélrænu á sitt hvorum degi til að vernda afturkeðjuna. Niðurtröppunarvikan bætir við hvíld.",
    md: "MD", dayType: "Dagsgerð", whatItIs: "Hvað það er",
    sbs: "Æfing fyrir æfingu — öll lotan", sbsNarr: "Alger mörk per æfingu, skalað frá leikviðmiðinu eftir dagsgerð og vikumargfeldi. VEGAL og HÁHRAÐI í metrum; ÁLAG í Player Load (AU). Hvíldardagar sýndir sem strik.",
    day: "Dagur", focus: "Áhersla",
    foot: "Lýsandi áætlun — setur aldrei readiness-litinn, hnekkir aldrei daglegu ákvörðuninni. Álagsmörk skala frá eigin leikviðmiði (miðgildi næstum-heilla leikja ≥80 mín) eftir hlutdeild hverrar dagsgerðar og vikumargfeldi; gagna-festur upphafspunktur, ekki viðmið til að hlýða (Little & Buchheit). Ekkert eitt „%-af-leik“ — vélrænt fer yfir, háhraði/sprettur ná ekki (Figueiredo). Vitnar í: Figueiredo · Owen 2017 · Oliveira 2019 · Teixeira 2021." },
} as const;

const nfmt = (n: number | null) => (n == null ? "—" : n.toLocaleString("en-US"));

function BlockDoc({ payload, lang }: { payload: PeriodizationBlockPayload; lang: Lang }) {
  const t = L[lang]; const bi = (b: Bi) => (lang === "IS" ? b.is : b.en);
  const { block } = payload; const u = block.unit;
  const who = block.scopeName === "__team__" ? t.team : `${block.scopeName}${block.scopePos ? ` (${block.scopePos})` : ""}`;
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.eyebrow}>{t.eyebrow}</Text>
        <Text style={s.h1}>{t.plan} — {block.numWeeks}-{t.block}</Text>
        <Text style={s.sub}>{bi(block.phase)} · {t.anchored} {who}</Text>

        {/* Match unit tiles */}
        <Text style={s.lead}>{t.unitLead}</Text>
        <View style={s.tiles}>
          <View style={s.tile}><Text style={s.tileNum}>{nfmt(u.dist)} m</Text><Text style={s.tileLbl}>{t.dist}</Text></View>
          <View style={s.tile}><Text style={s.tileNum}>{nfmt(u.hsr)} m</Text><Text style={s.tileLbl}>{t.hsr}</Text></View>
          <View style={s.tile}><Text style={s.tileNum}>{nfmt(u.load)} AU</Text><Text style={s.tileLbl}>{t.load}</Text></View>
          <View style={s.tile}><Text style={s.tileNum}>{nfmt(u.accdec)}</Text><Text style={s.tileLbl}>{t.accdec}</Text></View>
        </View>

        {/* Weekly ramp */}
        <Text style={s.h2}>{t.ramp}</Text>
        <Text style={s.narr}>{t.rampNarr}</Text>
        <View style={s.th}>
          <Text style={[s.thc, { width: 52 }]}>{t.week}</Text><Text style={[s.thc, { flex: 1 }]}>{t.intent}</Text>
          <Text style={[s.thc, { width: 64, textAlign: "right" }]}>{t.running}</Text><Text style={[s.thc, { width: 50, textAlign: "right" }]}>HSR</Text>
          <Text style={[s.thc, { width: 64, textAlign: "right" }]}>{t.mech}</Text><Text style={[s.thc, { width: 52, textAlign: "right" }]}>{t.rest}</Text>
        </View>
        {block.weeks.map((w) => (
          <View key={w.index} style={s.row}>
            <Text style={{ width: 52, fontFamily: "Helvetica-Bold" }}>{t.week} {w.index + 1}</Text>
            <Text style={{ flex: 1, color: w.isDeload ? AMBER : INK }}>{bi(w.intent)}</Text>
            <Text style={{ width: 64, textAlign: "right" }}>{w.pctRunning != null ? `${w.pctRunning}%` : "—"}</Text>
            <Text style={{ width: 50, textAlign: "right" }}>{w.pctHsr != null ? `${w.pctHsr}%` : "—"}</Text>
            <Text style={{ width: 64, textAlign: "right", fontFamily: "Helvetica-Bold" }}>{w.pctMech != null ? `${w.pctMech}%` : "—"}</Text>
            <Text style={{ width: 52, textAlign: "right" }}>{w.restDays}</Text>
          </View>
        ))}

        {/* The week + MD legend */}
        <Text style={s.h2}>{t.theWeek}</Text>
        <Text style={s.narr}>{t.weekNarr}</Text>
        <View style={s.th}><Text style={[s.thc, { width: 48 }]}>{t.md}</Text><Text style={[s.thc, { width: 110 }]}>{t.dayType}</Text><Text style={[s.thc, { flex: 1 }]}>{t.whatItIs}</Text></View>
        {block.legend.map((g, i) => (
          <View key={i} style={s.row}><Text style={{ width: 48, fontFamily: "Helvetica-Bold" }}>{g.md}</Text><Text style={{ width: 110 }}>{bi(g.label)}</Text><Text style={{ flex: 1, color: "#374151" }}>{bi(g.what)}</Text></View>
        ))}

        <Text style={s.foot} fixed>{t.foot}</Text>
      </Page>

      {/* Session-by-session */}
      <Page size="A4" style={s.page}>
        <Text style={s.h2}>{t.sbs}</Text>
        <Text style={s.narr}>{t.sbsNarr}</Text>
        {block.weeks.map((w) => (
          <View key={w.index} wrap={false}>
            <View style={s.weekHead}>
              <Text style={s.weekTitle}>{t.week} {w.index + 1} — {bi(w.intent)}</Text>
              <Text style={{ fontSize: 8.5, color: MUTE, marginLeft: 8 }}>{t.match} {bi(w.matchDow)} · ×{w.mult.toFixed(2)}{w.isDeload ? ` · ${t.deload.toUpperCase()}` : ""}</Text>
            </View>
            <View style={s.th}>
              <Text style={[s.thc, { width: 34 }]}>{t.day}</Text><Text style={[s.thc, { width: 40 }]}>{t.md}</Text><Text style={[s.thc, { width: 78 }]}>{t.dayType}</Text>
              <Text style={[s.thc, { flex: 1 }]}>{t.focus}</Text>
              <Text style={[s.thc, { width: 44, textAlign: "right" }]}>DIST</Text><Text style={[s.thc, { width: 40, textAlign: "right" }]}>HSR</Text><Text style={[s.thc, { width: 40, textAlign: "right" }]}>LOAD</Text>
            </View>
            {w.days.map((d, i) => (
              <View key={i} style={s.row}>
                <Text style={{ width: 34, fontFamily: "Helvetica-Bold" }}>{bi(d.dow)}</Text>
                <Text style={{ width: 40, color: MUTE }}>{d.md}</Text>
                <Text style={{ width: 78, color: TYPE_COLOR[d.type], fontFamily: "Helvetica-Bold", fontSize: 8 }}>{bi(d.label)}</Text>
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
        <Text style={s.foot} fixed>{t.foot}</Text>
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
