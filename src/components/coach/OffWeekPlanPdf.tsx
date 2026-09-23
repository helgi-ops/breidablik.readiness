"use client";

/**
 * Off-week maintenance plan → PDF (per player or a team pack). The offline artefact for travel:
 * name, the days, prescriptions, per-player "why", and an RPE/pace key. Client-side @react-pdf
 * (pdf(<Doc/>).toBlob()) — the canonical pattern in this app (KsiReportPdf).
 */

import { Document, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";

type Bi = { en: string; is: string };
type OffWeekDay = { dayIndex: number; type: string; title: Bi; blocks: Array<{ label: Bi; prescription: Bi }>; note: Bi };
type OffWeekPlan = { days: OffWeekDay[]; summary: Bi; caveat: Bi; why: Bi[] };
export type OffWeekPlayerPlan = { playerId: string; name: string; position: string | null; plan: OffWeekPlan };

const s = StyleSheet.create({
  page: { padding: 32, fontSize: 10, color: "#14181c", fontFamily: "Helvetica" },
  h1: { fontSize: 18, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  sub: { fontSize: 10, color: "#5b6472", marginBottom: 10 },
  why: { backgroundColor: "#f1ecfa", borderRadius: 4, padding: 8, marginBottom: 10 },
  whyLine: { fontSize: 9, color: "#4a3a7a", marginBottom: 2 },
  day: { borderTop: "1 solid #e2e5ea", paddingTop: 6, marginBottom: 6 },
  dayHead: { flexDirection: "row", justifyContent: "space-between", marginBottom: 3 },
  dayTitle: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  dayTag: { fontSize: 8, color: "#7a5cc4", textTransform: "uppercase" },
  block: { flexDirection: "row", marginBottom: 2 },
  blockLabel: { width: 110, fontSize: 9, color: "#5b6472" },
  blockRx: { flex: 1, fontSize: 9 },
  note: { fontSize: 8, color: "#8a5a10", marginTop: 2 },
  caveat: { fontSize: 8, color: "#8892a0", marginTop: 12, borderTop: "1 solid #e2e5ea", paddingTop: 6 },
  key: { fontSize: 8, color: "#5b6472", marginTop: 4 },
});

function PlayerPage({ p, lang }: { p: OffWeekPlayerPlan; lang: "EN" | "IS" }) {
  const t = (b: Bi) => (lang === "IS" ? b.is : b.en);
  return (
    <Page size="A4" style={s.page}>
      <Text style={s.h1}>{p.name}</Text>
      <Text style={s.sub}>{(p.position ? `${p.position} · ` : "")}{t(p.plan.summary)}</Text>
      {p.plan.why.length > 0 && (
        <View style={s.why}>
          <Text style={[s.whyLine, { fontFamily: "Helvetica-Bold" }]}>{lang === "IS" ? "Af hverju þetta plan" : "Why this plan"}</Text>
          {p.plan.why.map((w, i) => <Text key={i} style={s.whyLine}>• {t(w)}</Text>)}
        </View>
      )}
      {p.plan.days.map((d) => (
        <View key={d.dayIndex} style={s.day} wrap={false}>
          <View style={s.dayHead}>
            <Text style={s.dayTitle}>{lang === "IS" ? "Dagur" : "Day"} {d.dayIndex + 1} — {t(d.title)}</Text>
            <Text style={s.dayTag}>{d.type}</Text>
          </View>
          {d.blocks.map((b, i) => (
            <View key={i} style={s.block}>
              <Text style={s.blockLabel}>{t(b.label)}</Text>
              <Text style={s.blockRx}>{t(b.prescription)}</Text>
            </View>
          ))}
          {d.note && <Text style={s.note}>{t(d.note)}</Text>}
        </View>
      ))}
      <Text style={s.key}>{lang === "IS" ? "RPE = áreynsla 1–10 · MAS = hámarks loftháð hraði (úr þínu prófi)" : "RPE = effort 1–10 · MAS = maximal aerobic speed (from your test)"}</Text>
      <Text style={s.caveat}>{t(p.plan.caveat)}</Text>
    </Page>
  );
}

export function OffWeekDoc({ players, lang }: { players: OffWeekPlayerPlan[]; lang: "EN" | "IS" }) {
  return <Document>{players.map((p) => <PlayerPage key={p.playerId} p={p} lang={lang} />)}</Document>;
}

export async function downloadOffWeekPlanPdf(players: OffWeekPlayerPlan[], lang: "EN" | "IS", filename?: string) {
  const blob = await pdf(<OffWeekDoc players={players} lang={lang} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename ?? (players.length === 1 ? `off-week-${players[0].name.replace(/\s+/g, "-")}.pdf` : "off-week-team-pack.pdf");
  a.click(); a.remove(); URL.revokeObjectURL(url);
}
