/**
 * Week setup — one-page PDF of the planned week: the 7 days with each day's intent (or match / off),
 * the MD tag, and — in pre-season — the per-day load doses (PL, sRPE, the KPIs each day loads most)
 * that the grid shows on screen, under a header carrying the week's starting-load target + ramp position.
 * Descriptive planning — never the readiness colour.
 */

import { Document, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";

type Lang = "EN" | "IS";

export type WeekSetupPdfDay = {
  weekday: string;
  date: string;                 // "dd.mm."
  md: string | null;            // MD tag ("MD", "MD-3", …)
  kind: "match" | "off" | "train";
  stripe?: string;              // day-type colour band (hex)
  matchLabel?: string;          // "@Opp" / "vs Opp"
  intent?: string;              // localized intent label (train days)
  dose?: { load: number | null; srpe: number | null; kpis: Array<{ label: string; value: number; unit: string }> } | null;
};

export type WeekSetupPdfPayload = {
  teamName: string;
  weekLabel: string;            // e.g. "Week of 5 Aug"
  phaseLabel: string;
  weekTypeLabel: string;
  preseason?: {
    weekIndex: number; preWeeks: number;
    multiple: number | null; weeklyLoad: number | null; perSession: number | null; srpe: number | null;
    anchor: string; confidence: string;
  } | null;
  days: WeekSetupPdfDay[];
};

const INK = "#14181c", MUTE = "#6b7280", LINE = "#e5e7eb", PURPLE = "#7a5cc4", RED = "#a83e28", GREEN = "#1c7a4a", COBALT = "#2740e6", AMBER = "#de9328", BONE = "#F4F2EC";
const nf = (n: number) => (Math.abs(n) >= 1000 ? Math.round(n).toLocaleString("en-US") : String(Math.round(n)));

const L = {
  EN: { title: "week plan", prepared: "Prepared for the coaching staff · MicroPulse", phase: "Phase", wtype: "Week type",
    pre: "Pre-season start", week: "Week", anchor: "anchor", conf: "confidence", weekly: "weekly", sess: "/session",
    day: "Day", plan: "Plan", pl: "PL", srpe: "sRPE", loads: "Loads most", match: "Match", off: "Off", rest: "Rest",
    legForce: "Force / mechanical", legVel: "Velocity / speed", legAct: "Activation / polish", legRec: "Recovery", legMatchOff: "Match / off",
    foot: "Descriptive planning — the doses are this week's slice of the pre-season target, split by each day's intent (velocity days pull the sprint bands, force days accel/decel). The days sum to the weekly target. Never sets the readiness colour. Teixeira 2021 · Owen 2017 · Foster (sRPE)." },
  IS: { title: "vikuplan", prepared: "Unnið fyrir þjálfarateymið · MicroPulse", phase: "Fasi", wtype: "Vikugerð",
    pre: "Undirbúningur — byrjun", week: "Vika", anchor: "grunnur", conf: "vissa", weekly: "vikumark", sess: "/æfingu",
    day: "Dagur", plan: "Plan", pl: "PL", srpe: "sRPE", loads: "Mest álag", match: "Leikur", off: "Frí", rest: "Hvíld",
    legForce: "Kraftur / vélrænt", legVel: "Hraði", legAct: "Virkjun / fínpússun", legRec: "Endurheimt", legMatchOff: "Leikur / frí",
    foot: "Lýsandi áætlun — skammtarnir eru hlutur þessarar viku af undirbúnings-markinu, skipt eftir áherslu hvers dags (hraða-dagar draga sprett-böndin, kraft-dagar hröðun/hemlun). Summa daganna = vikumarkið. Setur aldrei readiness-litinn. Teixeira 2021 · Owen 2017 · Foster (sRPE)." },
} as const;

const s = StyleSheet.create({
  page: { padding: 28, fontSize: 9, fontFamily: "Helvetica", color: INK },
  h1: { fontSize: 16, fontFamily: "Helvetica-Bold" },
  sub: { fontSize: 8.5, color: MUTE, marginTop: 2 },
  tag: { fontSize: 8, color: MUTE, marginTop: 3 },
  pre: { marginTop: 10, borderWidth: 1, borderColor: PURPLE, borderRadius: 6, padding: 8, backgroundColor: BONE },
  preH: { fontSize: 8, fontFamily: "Helvetica-Bold", color: PURPLE, textTransform: "uppercase", letterSpacing: 0.5 },
  preBig: { fontSize: 13, fontFamily: "Helvetica-Bold", marginTop: 2 },
  preLine: { fontSize: 8.5, color: MUTE, marginTop: 2 },
  th: { flexDirection: "row", borderBottomWidth: 1, borderColor: INK, paddingBottom: 3, marginTop: 12 },
  thc: { fontSize: 7.5, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.4, color: MUTE },
  row: { flexDirection: "row", borderBottomWidth: 1, borderColor: LINE, paddingVertical: 5, alignItems: "flex-start" },
  foot: { marginTop: 14, fontSize: 7, color: MUTE, lineHeight: 1.4 },
  legend: { flexDirection: "row", flexWrap: "wrap", marginTop: 10, gap: 10 },
  legItem: { flexDirection: "row", alignItems: "center" },
  legDot: { width: 7, height: 7, borderRadius: 2, marginRight: 3 },
  legTxt: { fontSize: 7.5, color: MUTE },
});

function WeekDoc({ payload, lang }: { payload: WeekSetupPdfPayload; lang: Lang }) {
  const t = L[lang];
  const p = payload.preseason;
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.h1}>{payload.teamName} — {t.title}</Text>
        <Text style={s.sub}>{payload.weekLabel} · {t.phase}: {payload.phaseLabel} · {t.wtype}: {payload.weekTypeLabel} · {t.prepared}</Text>

        {p && (
          <View style={s.pre} wrap={false}>
            <Text style={s.preH}>{t.pre} — {t.week} {p.weekIndex}/{p.preWeeks}</Text>
            <Text style={s.preBig}>
              {p.multiple == null ? "–" : `${p.multiple}× ${lang === "IS" ? "leik" : "match"}`}
              {p.weeklyLoad != null ? `  ·  ${t.weekly} ≈ ${nf(p.weeklyLoad)} PL` : ""}
              {p.perSession != null ? `  ·  ≈ ${nf(p.perSession)} ${t.sess}` : ""}
              {p.srpe != null ? `  ·  sRPE ≈ ${nf(p.srpe)} AU` : ""}
            </Text>
            <Text style={s.preLine}>{t.anchor}: {p.anchor} · {t.conf}: {p.confidence}</Text>
          </View>
        )}

        <View style={s.legend}>
          {[{ c: PURPLE, l: t.legForce }, { c: COBALT, l: t.legVel }, { c: AMBER, l: t.legAct }, { c: GREEN, l: t.legRec }, { c: RED, l: t.legMatchOff }].map((g, i) => (
            <View key={i} style={s.legItem}><View style={[s.legDot, { backgroundColor: g.c }]} /><Text style={s.legTxt}>{g.l}</Text></View>
          ))}
        </View>

        <View style={s.th}>
          <Text style={[s.thc, { width: 3, marginRight: 6 }]}> </Text>
          <Text style={[s.thc, { width: 74 }]}>{t.day}</Text>
          <Text style={[s.thc, { flex: 1 }]}>{t.plan}</Text>
          <Text style={[s.thc, { width: 46, textAlign: "right" }]}>{t.pl}</Text>
          <Text style={[s.thc, { width: 50, textAlign: "right" }]}>{t.srpe}</Text>
          <Text style={[s.thc, { width: 150 }]}>{t.loads}</Text>
        </View>

        {payload.days.map((d, i) => {
          const accent = d.kind === "match" ? RED : d.kind === "off" ? GREEN : INK;
          const stripe = d.stripe ?? (d.kind === "match" ? RED : d.kind === "off" ? GREEN : MUTE);
          const planText = d.kind === "match" ? (d.matchLabel || t.match) : d.kind === "off" ? t.off : (d.intent ?? "");
          return (
            <View key={i} style={s.row} wrap={false}>
              <View style={{ width: 3, backgroundColor: stripe, borderRadius: 1, marginRight: 6, minHeight: 16, alignSelf: "stretch" }} />
              <View style={{ width: 74 }}>
                <Text style={{ fontFamily: "Helvetica-Bold" }}>{d.weekday} <Text style={{ color: MUTE, fontFamily: "Helvetica" }}>{d.date}</Text></Text>
                {d.md && <Text style={{ fontSize: 7, color: accent, fontFamily: "Helvetica-Bold", marginTop: 1 }}>{d.md}</Text>}
              </View>
              <Text style={{ flex: 1, color: accent, fontFamily: d.kind === "train" ? "Helvetica" : "Helvetica-Bold" }}>{planText}</Text>
              <Text style={{ width: 46, textAlign: "right", fontFamily: "Helvetica-Bold" }}>{d.dose?.load != null ? nf(d.dose.load) : "—"}</Text>
              <Text style={{ width: 50, textAlign: "right", color: PURPLE }}>{d.dose?.srpe != null ? `${nf(d.dose.srpe)}` : "—"}</Text>
              <View style={{ width: 150 }}>
                {(d.dose?.kpis ?? []).map((k, j) => (
                  <Text key={j} style={{ fontSize: 8 }}>{k.label} <Text style={{ fontFamily: "Helvetica-Bold" }}>{nf(k.value)}{k.unit}</Text></Text>
                ))}
              </View>
            </View>
          );
        })}

        <Text style={s.foot}>{t.foot}</Text>
      </Page>
    </Document>
  );
}

export async function downloadWeekSetupPdf(payload: WeekSetupPdfPayload, lang: Lang) {
  const blob = await pdf(<WeekDoc payload={payload} lang={lang} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `week-plan-${payload.weekLabel.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
