"use client";

/**
 * SessionPdf — the planned training session (drills × sets) as a PDF. Explainability-first:
 * the plan-vs-history verdict and the headline totals come first, then how each variable sits
 * against this MD-day's history band, then the drill table. Icelandic (as the screen it comes from).
 *
 * Styling + download: shared MicroPulse PDF kit (src/components/pdf/brand.tsx).
 */

import { Document, Text, View } from "@react-pdf/renderer";
import { BrandPage, C, FactRow, Provenance, Section, StatGrid, Status, TONE, Table, Verdict, clean, fb, fh, renderPdfBlob, saveBlob, type Tone } from "@/components/pdf/brand";

type Drill = {
  id: string;
  category: string;
  drill_name: string;
  drill_format: string | null;
  reps: string | null;
  duration_min: number | null;
  distance_m: number | null;
  hir_total: number | null;
  player_load: number | null;
  accel_b23: number | null;
  decel_b23: number | null;
  accel_total: number | null;
  decel_total: number | null;
  vel_b5: number | null;
  vel_b6: number | null;
};

export type SessionPdfItem = {
  drill: Drill;
  sets: number;
};

export type SessionPdfPlanMetric = {
  metric: string;
  label: string;
  mean: number;
  low: number;
  high: number;
  sessionValue: number;
  status: "ok" | "low" | "high" | "none";
  decimals: number;
};

export type SessionPdfData = {
  sessionName: string;
  mdDay: string;
  date: string;
  items: SessionPdfItem[];
  totals: {
    duration_min: number;
    distance_m: number;
    player_load: number;
    vel_b5: number;
    vel_b6: number;
    accel_b23: number;
    decel_b23: number;
    accel_total: number;
    decel_total: number;
  };
  avgPlPerMin: number | null;
  planningMetrics: SessionPdfPlanMetric[]; // already computed comparison rows
  mdSessionCount?: number;
  mdPlayerCount?: number;
};

const CATEGORY_LABELS: Record<string, string> = {
  possession: "Possession",
  ssg: "SSG",
  transition: "Transition",
  running: "Running",
  finishing: "Finishing",
  warmup: "Warm-up",
  other: "Annað",
};

/** Plan-vs-history status → kit tone + the word (colour is never the only signal). */
const STATUS: Record<SessionPdfPlanMetric["status"], { tone: Tone; word: string }> = {
  ok: { tone: "green", word: "Innan bils" },
  low: { tone: "amber", word: "Undir sögu" },
  high: { tone: "red", word: "Yfir sögu" },
  none: { tone: "neutral", word: "Engin saga" },
};

/** Local building block: plan value vs history band. The kit <Bar> paints the value over the band,
 *  so here the band is the full-height tint and the value a thinner bar inside it (both readable). */
function PlanBar({ value, low, high, color }: { value: number; low: number; high: number; color: string }) {
  const max = Math.max(high, value, 1) * 1.15;
  const p = (v: number) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
  return (
    <View style={{ height: 10, backgroundColor: C.track, borderRadius: 2, position: "relative", justifyContent: "center" }}>
      {high > low ? <View style={{ position: "absolute", left: p(low), width: `${Math.max(0, Math.min(100, ((high - low) / max) * 100))}%`, top: 0, bottom: 0, backgroundColor: C.cobaltEdge, borderRadius: 1 }} /> : null}
      <View style={{ width: value > 0 ? p(value) : 0, minWidth: value > 0 ? 2 : 0, height: 4, backgroundColor: color, borderRadius: 2 }} />
    </View>
  );
}

function fmt(v: number | null | undefined, digits = 0): string {
  if (v == null || Number.isNaN(Number(v))) return "-";
  return Number(v).toFixed(digits);
}

export function SessionPdfDocument({ data }: { data: SessionPdfData }) {
  const md = data.mdDay || "MD";
  const pm = data.planningMetrics;
  const high = pm.filter((m) => m.status === "high");
  const low = pm.filter((m) => m.status === "low");
  const ok = pm.filter((m) => m.status === "ok");
  const rated = high.length + low.length + ok.length;
  // Layer 0 — rule-based verdict straight from the already-computed comparison rows.
  const verdict: { tone: Tone; label: string; headline: string; body?: string } =
    rated === 0
      ? { tone: "neutral", label: "Áætlun", headline: `${data.items.length} drillur · ${fmt(data.totals.duration_min)} mín · ${fmt(data.totals.player_load)} Player Load.`, body: pm.length ? `Engin ${md}-saga til samanburðar enn.` : undefined }
      : high.length === 0 && low.length === 0
        ? { tone: "green", label: "Innan bils", headline: `Æfingin er innan ${md}-sögunnar í öllum ${ok.length} breytum.` }
        : {
            tone: high.length ? "red" : "amber",
            label: high.length ? "Yfir sögu" : "Undir sögu",
            headline: `${high.length + low.length} af ${rated} breytum utan ${md}-sögunnar.`,
            body: [high.length ? `Yfir: ${high.map((m) => m.label).join(", ")}.` : "", low.length ? `Undir: ${low.map((m) => m.label).join(", ")}.` : ""].filter(Boolean).join(" "),
          };

  return (
    <Document>
      <BrandPage
        doc="Æfingaáætlun"
        context={data.mdDay ? `${data.date} · ${data.mdDay}` : data.date}
        kicker="Æfingaáætlun"
        title={data.sessionName || "Æfing"}
        subtitle={`${data.date}${data.mdDay ? ` · ${data.mdDay}` : ""}`}
        chips={[
          { text: `${data.items.length} drillur` },
          ...(data.mdDay ? [{ text: `MD-dagur: ${data.mdDay}`, tone: "cobalt" as const }] : []),
          ...(data.mdSessionCount != null ? [{ text: `Liðs-saga: ${data.mdSessionCount} æf.` }] : []),
        ]}
        note={`MicroPulse · Session plan · ${data.date}`}
      >
        <Verdict
          tone={verdict.tone}
          label={verdict.label}
          headline={verdict.headline}
          body={verdict.body}
          confidence={data.mdSessionCount != null ? `Saga: ${data.mdSessionCount} æfingar á ${md}` : undefined}
        />

        {/* Layer 1 — the headline totals */}
        <FactRow
          facts={[
            { value: fmt(data.totals.player_load, 0), label: "Player Load", sub: "Áætlað heildar-load" },
            { value: `${fmt(data.totals.duration_min, 0)} mín`, label: "Lengd" },
            { value: `${fmt(data.totals.distance_m, 0)} m`, label: "Vegalengd" },
          ]}
        />

        {/* Plan vs this MD-day's history band */}
        {pm.length > 0 && (
          <Section title={`Breytur vs ${data.mdDay} saga`} hint="Mjó stika = áætlað gildi; ljósblátt svæði = sögulegt bil fyrir þennan MD-dag.">
            <View style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.rule, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
              {pm.map((m, i) => {
                const st = STATUS[m.status];
                return (
                  <View key={i} wrap={false} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 5, borderBottomWidth: i < pm.length - 1 ? 1 : 0, borderBottomColor: C.hair }}>
                    <Text style={[fb(600), { width: 120, fontSize: 8.75 }]}>{clean(m.label)}</Text>
                    <Text style={[fh(700), { width: 52, fontSize: 10, textAlign: "right", color: TONE[st.tone].text }]}>{m.sessionValue > 0 ? m.sessionValue.toFixed(m.decimals) : "-"}</Text>
                    <View style={{ flex: 1 }}>
                      <PlanBar value={m.sessionValue} low={m.low} high={m.high} color={m.status === "none" ? C.ink : TONE[st.tone].fill} />
                    </View>
                    <Text style={[fb(400), { width: 86, fontSize: 7.5, color: C.mute, textAlign: "right" }]}>{`saga: ${m.low.toFixed(m.decimals)}-${m.high.toFixed(m.decimals)}`}</Text>
                    <View style={{ width: 68, alignItems: "flex-end" }}><Status tone={st.tone} text={st.word} size={7.75} /></View>
                  </View>
                );
              })}
            </View>
          </Section>
        )}

        {/* Layer 2 — all totals + the drill table */}
        <Section title="Áætlað heildar-load">
          <StatGrid
            items={[
              { label: "Player Load", value: fmt(data.totals.player_load, 0) },
              { label: "Duration", value: `${fmt(data.totals.duration_min, 0)} mín` },
              { label: "Distance", value: `${fmt(data.totals.distance_m, 0)} m` },
              { label: "PL / mín", value: data.avgPlPerMin != null ? data.avgPlPerMin.toFixed(2) : "-" },
              { label: "Vel B5", value: `${fmt(data.totals.vel_b5, 0)} m` },
              { label: "Vel B6", value: `${fmt(data.totals.vel_b6, 0)} m` },
              { label: "Accel B2-3", value: fmt(data.totals.accel_b23, 0) },
              { label: "Decel B2-3", value: fmt(data.totals.decel_b23, 0) },
            ]}
          />
        </Section>

        <Section title="Drillur">
          <Table
            cols={[
              { label: "#", width: 18 },
              { label: "Nafn", flex: 1 },
              { label: "Sett", width: 30, align: "center" },
              { label: "PL", width: 38, align: "right", strong: true },
              { label: "Mín", width: 34, align: "right" },
              { label: "Dist", width: 42, align: "right" },
              { label: "Acc B2-3", width: 44, align: "right" },
              { label: "Dec B2-3", width: 44, align: "right" },
            ]}
            rows={data.items.map((it, i) => {
              const d = it.drill;
              return [
                String(i + 1),
                <View key="n">
                  <Text style={[fb(600), { fontSize: 8.75 }]}>{clean(d.drill_name)}</Text>
                  <Text style={[fb(400), { fontSize: 7.25, color: C.mute, marginTop: 1 }]}>
                    {clean(`${CATEGORY_LABELS[d.category] ?? d.category}${d.drill_format ? ` · ${d.drill_format}` : ""}${d.reps ? ` · ${d.reps}` : ""}`)}
                  </Text>
                </View>,
                `${it.sets}×`,
                fmt((d.player_load ?? 0) * it.sets, 0),
                fmt((d.duration_min ?? 0) * it.sets, 0),
                fmt((d.distance_m ?? 0) * it.sets, 0),
                d.accel_b23 != null ? fmt(d.accel_b23 * it.sets, 0) : "-",
                d.decel_b23 != null ? fmt(d.decel_b23 * it.sets, 0) : "-",
              ];
            })}
          />
          <Provenance>Gildi í töflu = gildi drillu × fjöldi setta. Saga = bil liðsins á sama MD-degi.</Provenance>
        </Section>
      </BrandPage>
    </Document>
  );
}

export async function downloadSessionPdf(data: SessionPdfData, filename: string) {
  saveBlob(await renderPdfBlob(() => <SessionPdfDocument data={data} />), filename);
}
