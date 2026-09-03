"use client";

/**
 * PeriodizationBlockPdf — a comprehensive PDF of a scheduled mesocycle (4–6 weeks), team or per-player.
 *
 * Cover overview (scope, phase/goal, session count, the match unit, the honest notes) + a
 * session-by-session breakdown of the whole block: every week's overload %, weekly target + TMr, and
 * each MD-anchored session's day-type + targets. Numbers scale from the team's / player's OWN match
 * unit — a data-anchored starting point, never a norm to obey (Little & Buchheit). Descriptive
 * planning: it never sets the readiness colour. Rules recommend; the coach decides.
 */

import { Document, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import type { MesoPlan, Bi } from "@/lib/micropulse/periodization/index";

type Lang = "EN" | "IS";

export type PeriodizationBlockPayload = {
  teamName: string;
  scope: { kind: "team" | "player"; name: string; position?: string | null };
  matchUnitLabel?: string | null;
  plan: MesoPlan;
  generatedAt?: string;
};

const INK = "#14181c";
const MUTE = "#6b7280";
const LINE = "#e5e7eb";
const COBALT = "#2740e6";
const AMBER = "#de9328";
const PURPLE = "#7a5cc4";

const TYPE_COLOR: Record<string, string> = {
  mechanical: "#a83e28", locomotive: COBALT, mixed: PURPLE, technical: "#64748b", restart: AMBER, topup: AMBER, match: "#1c7a4a",
};

const s = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 46, paddingHorizontal: 42, fontSize: 9.5, color: INK, fontFamily: "Helvetica", lineHeight: 1.4 },
  h1: { fontSize: 18, fontFamily: "Helvetica-Bold" },
  sub: { fontSize: 9.5, color: MUTE, marginTop: 3 },
  tag: { marginTop: 8, alignSelf: "flex-start", fontSize: 8, color: COBALT, borderColor: COBALT, borderWidth: 1, borderRadius: 3, paddingVertical: 2, paddingHorizontal: 5 },
  section: { marginTop: 14 },
  h2: { fontSize: 12, fontFamily: "Helvetica-Bold", marginBottom: 5 },
  overviewRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: LINE, paddingVertical: 3 },
  ovL: { flex: 1, color: MUTE }, ovR: { width: 260, textAlign: "right", fontFamily: "Helvetica-Bold" },
  weekBox: { marginTop: 12, borderWidth: 1, borderColor: LINE, borderRadius: 5, padding: 9 },
  weekHead: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  weekTitle: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  chip: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: "#fff", borderRadius: 3, paddingVertical: 1.5, paddingHorizontal: 4, marginLeft: 6 },
  chipMute: { fontSize: 8, color: MUTE, marginLeft: 6 },
  dayRow: { flexDirection: "row", alignItems: "flex-start", borderTopWidth: 1, borderTopColor: LINE, paddingVertical: 3 },
  mdTag: { width: 42, fontSize: 8, fontFamily: "Helvetica-Bold", color: "#fff", borderRadius: 3, paddingVertical: 1.5, textAlign: "center" },
  dayType: { width: 82, fontSize: 9, fontFamily: "Helvetica-Bold", paddingLeft: 6 },
  dayTargets: { flex: 1, fontSize: 8.5, color: "#374151" },
  dayNote: { fontSize: 7.5, color: MUTE, marginTop: 1 },
  noteLi: { flexDirection: "row", marginBottom: 2 },
  bullet: { width: 10, color: COBALT }, noteTxt: { flex: 1, fontSize: 8.5, color: "#374151" },
  foot: { position: "absolute", bottom: 22, left: 42, right: 42, paddingTop: 7, borderTopWidth: 1, borderTopColor: LINE, fontSize: 7.5, color: MUTE, lineHeight: 1.45 },
});

const L = {
  EN: {
    title: "periodization block", prepared: "Prepared for the coaching staff · MicroPulse",
    tag: "Recommended from the team's own data — the coach decides and overrides",
    overview: "Block overview", scope: "Scope", team: "Team", player: "Player", position: "Position",
    goal: "Block goal", start: "Start", weeks: "Weeks", sessions: "Sessions / week", matchUnit: "Match unit",
    notes: "How to read this block", week: "Week", deload: "Deload", overload: "overload", weekly: "weekly target",
    congested: "congested", matches: "matches", session: "session", off: "no match this week",
    foot: "Descriptive planning — it never sets the readiness colour and never overrides the daily decision. Targets scale from the team's / player's own match unit (median of near-full matches) and each MD day's %-of-match shape; they are a data-anchored starting point, not a norm to obey (Little & Buchheit). No single \"% of match\" exists — mechanical work over-shoots the match while HSR/sprint fall short (Figueiredo). Never stack HSR and mechanical work on the same day. Cites: Figueiredo (dimension-specific match ratios) · Owen 2017 (MD taper) · Oliveira 2019 (congested weeks) · Teixeira 2021 (~80/20).",
  },
  IS: {
    title: "álagslota (periodization)", prepared: "Unnið fyrir þjálfarateymið · MicroPulse",
    tag: "Ráðlagt út frá eigin gögnum liðsins — þjálfarinn ákveður og hnekkir",
    overview: "Yfirlit lotu", scope: "Umfang", team: "Lið", player: "Leikmaður", position: "Staða",
    goal: "Markmið lotu", start: "Upphaf", weeks: "Vikur", sessions: "Æfingar / viku", matchUnit: "Leikviðmið",
    notes: "Hvernig á að lesa þessa lotu", week: "Vika", deload: "Niðurtröppun", overload: "álag", weekly: "vikumark",
    congested: "þétt", matches: "leikir", session: "æfingu", off: "enginn leikur þessa viku",
    foot: "Lýsandi áætlun — hún setur aldrei readiness-litinn og hnekkir aldrei daglegu ákvörðuninni. Álagsmörk skala frá eigin leikviðmiði liðsins/leikmannsins (miðgildi næstum-heilla leikja) og %-af-leik lögun hvers MD-dags; þau eru gagna-festur upphafspunktur, ekki viðmið til að hlýða í blindni (Little & Buchheit). Ekkert eitt „%-af-leik“ er til — vélrænt fer yfir leikinn en háhraði/sprettur ná ekki (Figueiredo). Aldrei stafla háhraða og vélrænu á sama dag. Vitnar í: Figueiredo · Owen 2017 · Oliveira 2019 · Teixeira 2021.",
  },
} as const;

const shortDate = (iso: string, lang: Lang) => { try { return new Intl.DateTimeFormat(lang === "IS" ? "is-IS" : "en-GB", { day: "numeric", month: "short" }).format(new Date(`${iso}T00:00:00`)); } catch { return iso; } };

function PeriodizationBlockDoc({ payload, lang }: { payload: PeriodizationBlockPayload; lang: Lang }) {
  const t = L[lang]; const bi = (b: Bi) => (lang === "IS" ? b.is : b.en);
  const { plan, scope } = payload;
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.h1}>{scope.name} — {t.title}</Text>
        <Text style={s.sub}>{payload.teamName} · {t.prepared}{payload.generatedAt ? ` · ${payload.generatedAt.slice(0, 10)}` : ""}</Text>
        <Text style={s.tag}>{t.tag}</Text>

        {/* Overview */}
        <View style={s.section}>
          <Text style={s.h2}>{t.overview}</Text>
          <View style={s.overviewRow}><Text style={s.ovL}>{t.scope}</Text><Text style={s.ovR}>{scope.kind === "player" ? `${t.player}: ${scope.name}${scope.position ? ` (${scope.position})` : ""}` : `${t.team}: ${scope.name}`}</Text></View>
          <View style={s.overviewRow}><Text style={s.ovL}>{t.goal}</Text><Text style={s.ovR}>{bi(plan.goal)}</Text></View>
          <View style={s.overviewRow}><Text style={s.ovL}>{t.start}</Text><Text style={s.ovR}>{shortDate(plan.startDate, lang)}</Text></View>
          <View style={s.overviewRow}><Text style={s.ovL}>{t.weeks}</Text><Text style={s.ovR}>{plan.numWeeks}</Text></View>
          <View style={s.overviewRow}><Text style={s.ovL}>{t.sessions}</Text><Text style={s.ovR}>{plan.sessionsPerWeek}</Text></View>
          {payload.matchUnitLabel && <View style={s.overviewRow}><Text style={s.ovL}>{t.matchUnit}</Text><Text style={s.ovR}>{payload.matchUnitLabel}</Text></View>}
        </View>

        {/* Notes */}
        <View style={s.section}>
          <Text style={s.h2}>{t.notes}</Text>
          {plan.notes.map((n, i) => (
            <View key={i} style={s.noteLi}><Text style={s.bullet}>•</Text><Text style={s.noteTxt}>{bi(n)}</Text></View>
          ))}
        </View>

        {/* Weeks */}
        {plan.weeks.map((w) => (
          <View key={w.index} style={s.weekBox} wrap={false}>
            <View style={s.weekHead}>
              <Text style={s.weekTitle}>{t.week} {w.index + 1} · {shortDate(w.weekStart, lang)}</Text>
              <Text style={[s.chip, { backgroundColor: w.isDeload ? AMBER : COBALT }]}>{w.isDeload ? t.deload : `${w.overloadPct}% ${t.overload}`}</Text>
              {w.weeklyLoadTarget != null && <Text style={s.chipMute}>{t.weekly} ≈ {w.weeklyLoadTarget} PL{w.tmr != null ? ` (${w.tmr}×)` : ""}</Text>}
              {w.matchesInWeek >= 2 && <Text style={[s.chip, { backgroundColor: "#a83e28" }]}>{w.matchesInWeek} {t.matches} · {t.congested}</Text>}
            </View>
            {w.sessions.map((d, i) => (
              <View key={i} style={s.dayRow}>
                <Text style={[s.mdTag, { backgroundColor: TYPE_COLOR[d.type] ?? MUTE }]}>{d.mdTag}</Text>
                <Text style={s.dayType}>{bi(d.label)}</Text>
                <View style={s.dayTargets}>
                  <Text>{d.targets.map((x) => `${bi(x.metric)}: ${x.value}`).join("   ")}</Text>
                  <Text style={s.dayNote}>{bi(d.quality)}{d.note ? ` — ${bi(d.note)}` : ""}</Text>
                </View>
              </View>
            ))}
          </View>
        ))}

        <Text style={s.foot} fixed>{t.foot}</Text>
      </Page>
    </Document>
  );
}

export async function downloadPeriodizationBlockPdf(payload: PeriodizationBlockPayload, lang: Lang) {
  const blob = await pdf(<PeriodizationBlockDoc payload={payload} lang={lang} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${payload.scope.name.replace(/\s+/g, "-")}-periodization-block.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
