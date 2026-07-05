"use client";

import { Document, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";

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

const styles = StyleSheet.create({
  page: { padding: 28, fontSize: 10, color: "#221f18", fontFamily: "Helvetica" },
  header: { marginBottom: 12, paddingBottom: 10, borderBottom: "2 solid #e6e1d4" },
  h1: { fontSize: 18, fontWeight: 700, marginBottom: 4 },
  metaRow: { flexDirection: "row", gap: 14, fontSize: 10, color: "#6d6858", marginTop: 2 },
  metaLabel: { color: "#a9a493", fontSize: 8, textTransform: "uppercase", marginBottom: 1 },
  metaValue: { fontSize: 11, fontWeight: 700, color: "#221f18" },

  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    color: "#565044",
    textTransform: "uppercase",
    marginBottom: 6,
    marginTop: 10,
  },

  // Totals
  totalsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 4 },
  tile: {
    borderWidth: 1,
    borderColor: "#DBEAFE",
    backgroundColor: "#EFF6FF",
    borderRadius: 4,
    padding: "6 8",
    width: "23.5%",
  },
  tileBig: { width: "48.8%" },
  tileLabel: { fontSize: 7, color: "#3B82F6", textTransform: "uppercase", marginBottom: 2 },
  tileValue: { fontSize: 12, fontWeight: 700, color: "#1E3A8A" },
  tileValueBig: { fontSize: 16, fontWeight: 700, color: "#1E3A8A" },

  // Drills table
  table: { borderWidth: 1, borderColor: "#e6e1d4", borderRadius: 3, marginTop: 4 },
  tHead: { flexDirection: "row", backgroundColor: "#efece2" },
  tRow: { flexDirection: "row", borderTopWidth: 1, borderTopColor: "#e6e1d4" },
  cellH: { padding: "5 6", fontSize: 8, fontWeight: 700, color: "#8b8676", textTransform: "uppercase" },
  cell: { padding: "5 6", fontSize: 9, color: "#3a352c" },
  idxCol: { width: 22 },
  nameCol: { flex: 1 },
  smallCol: { width: 34, textAlign: "right" },
  setsCol: { width: 28, textAlign: "center" },

  // Comparison table
  cmpRow: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#efece2",
    padding: "5 8",
  },
  cmpRowOk: { backgroundColor: "#eaf3ec" },
  cmpRowLow: { backgroundColor: "#faf1de" },
  cmpRowHigh: { backgroundColor: "#f8e9e3" },
  cmpIcon: { width: 14, fontSize: 10, fontWeight: 700 },
  cmpIconOk: { color: "#16653d" },
  cmpIconLow: { color: "#9a6410" },
  cmpIconHigh: { color: "#8c3221" },
  cmpLabel: { flex: 1, fontSize: 9, color: "#3a352c" },
  cmpValue: { width: 50, textAlign: "right", fontSize: 9, fontWeight: 700 },
  cmpBand: { width: 90, textAlign: "right", fontSize: 7, color: "#8b8676" },

  footer: {
    position: "absolute",
    bottom: 18,
    left: 28,
    right: 28,
    fontSize: 7,
    color: "#a9a493",
    textAlign: "center",
    borderTopWidth: 1,
    borderTopColor: "#e6e1d4",
    paddingTop: 6,
  },
});

const CATEGORY_LABELS: Record<string, string> = {
  possession: "Possession",
  ssg: "SSG",
  transition: "Transition",
  running: "Running",
  finishing: "Finishing",
  warmup: "Warm-up",
  other: "Annað",
};

function fmt(v: number | null | undefined, digits = 0): string {
  if (v == null || Number.isNaN(Number(v))) return "–";
  return Number(v).toFixed(digits);
}

export function SessionPdfDocument({ data }: { data: SessionPdfData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.h1}>{data.sessionName || "Æfing"}</Text>
          <View style={styles.metaRow}>
            <View>
              <Text style={styles.metaLabel}>Dagsetning</Text>
              <Text style={styles.metaValue}>{data.date}</Text>
            </View>
            {data.mdDay && (
              <View>
                <Text style={styles.metaLabel}>MD-dagur</Text>
                <Text style={styles.metaValue}>{data.mdDay}</Text>
              </View>
            )}
            <View>
              <Text style={styles.metaLabel}>Drillur</Text>
              <Text style={styles.metaValue}>{data.items.length}</Text>
            </View>
            {data.mdSessionCount != null && (
              <View>
                <Text style={styles.metaLabel}>Liðs-saga</Text>
                <Text style={styles.metaValue}>{data.mdSessionCount} æf.</Text>
              </View>
            )}
          </View>
        </View>

        {/* Totals */}
        <Text style={styles.sectionTitle}>Áætlað heildar-load</Text>
        <View style={styles.totalsWrap}>
          <View style={[styles.tile, styles.tileBig]}>
            <Text style={styles.tileLabel}>Player Load</Text>
            <Text style={styles.tileValueBig}>{fmt(data.totals.player_load, 0)}</Text>
          </View>
          <View style={[styles.tile, styles.tileBig]}>
            <Text style={styles.tileLabel}>Duration</Text>
            <Text style={styles.tileValueBig}>{fmt(data.totals.duration_min, 0)} mín</Text>
          </View>
          <View style={styles.tile}>
            <Text style={styles.tileLabel}>Distance</Text>
            <Text style={styles.tileValue}>{fmt(data.totals.distance_m, 0)} m</Text>
          </View>
          <View style={styles.tile}>
            <Text style={styles.tileLabel}>Vel B5</Text>
            <Text style={styles.tileValue}>{fmt(data.totals.vel_b5, 0)} m</Text>
          </View>
          <View style={styles.tile}>
            <Text style={styles.tileLabel}>Vel B6</Text>
            <Text style={styles.tileValue}>{fmt(data.totals.vel_b6, 0)} m</Text>
          </View>
          <View style={styles.tile}>
            <Text style={styles.tileLabel}>PL / mín</Text>
            <Text style={styles.tileValue}>
              {data.avgPlPerMin != null ? data.avgPlPerMin.toFixed(2) : "–"}
            </Text>
          </View>
          <View style={styles.tile}>
            <Text style={styles.tileLabel}>Accel B2-3</Text>
            <Text style={styles.tileValue}>{fmt(data.totals.accel_b23, 0)}</Text>
          </View>
          <View style={styles.tile}>
            <Text style={styles.tileLabel}>Decel B2-3</Text>
            <Text style={styles.tileValue}>{fmt(data.totals.decel_b23, 0)}</Text>
          </View>
        </View>

        {/* Drills table */}
        <Text style={styles.sectionTitle}>Drillur</Text>
        <View style={styles.table}>
          <View style={styles.tHead}>
            <Text style={[styles.cellH, styles.idxCol]}>#</Text>
            <Text style={[styles.cellH, styles.nameCol]}>Nafn</Text>
            <Text style={[styles.cellH, styles.setsCol]}>Sett</Text>
            <Text style={[styles.cellH, styles.smallCol]}>PL</Text>
            <Text style={[styles.cellH, styles.smallCol]}>Mín</Text>
            <Text style={[styles.cellH, styles.smallCol]}>Dist</Text>
            <Text style={[styles.cellH, styles.smallCol]}>Acc B2-3</Text>
            <Text style={[styles.cellH, styles.smallCol]}>Dec B2-3</Text>
          </View>
          {data.items.map((it, i) => {
            const d = it.drill;
            const pl = (d.player_load ?? 0) * it.sets;
            const dur = (d.duration_min ?? 0) * it.sets;
            const dist = (d.distance_m ?? 0) * it.sets;
            const accB23 = (d.accel_b23 ?? 0) * it.sets;
            const decB23 = (d.decel_b23 ?? 0) * it.sets;
            return (
              <View key={i} style={styles.tRow}>
                <Text style={[styles.cell, styles.idxCol]}>{i + 1}</Text>
                <View style={[styles.cell, styles.nameCol]}>
                  <Text style={{ fontSize: 9, fontWeight: 700 }}>{d.drill_name}</Text>
                  <Text style={{ fontSize: 7, color: "#8b8676", marginTop: 1 }}>
                    {CATEGORY_LABELS[d.category] ?? d.category}
                    {d.drill_format ? ` · ${d.drill_format}` : ""}
                    {d.reps ? ` · ${d.reps}` : ""}
                  </Text>
                </View>
                <Text style={[styles.cell, styles.setsCol]}>{it.sets}×</Text>
                <Text style={[styles.cell, styles.smallCol]}>{fmt(pl, 0)}</Text>
                <Text style={[styles.cell, styles.smallCol]}>{fmt(dur, 0)}</Text>
                <Text style={[styles.cell, styles.smallCol]}>{fmt(dist, 0)}</Text>
                <Text style={[styles.cell, styles.smallCol]}>{d.accel_b23 != null ? fmt(accB23, 0) : "–"}</Text>
                <Text style={[styles.cell, styles.smallCol]}>{d.decel_b23 != null ? fmt(decB23, 0) : "–"}</Text>
              </View>
            );
          })}
        </View>

        {/* MD Comparison */}
        {data.planningMetrics.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Breytur vs {data.mdDay} saga</Text>
            <View style={{ borderWidth: 1, borderColor: "#e6e1d4", borderRadius: 3 }}>
              {data.planningMetrics.map((m, i) => {
                const rowStyle =
                  m.status === "ok"
                    ? styles.cmpRowOk
                    : m.status === "low"
                    ? styles.cmpRowLow
                    : m.status === "high"
                    ? styles.cmpRowHigh
                    : {};
                const iconStyle =
                  m.status === "ok"
                    ? styles.cmpIconOk
                    : m.status === "low"
                    ? styles.cmpIconLow
                    : m.status === "high"
                    ? styles.cmpIconHigh
                    : {};
                const icon =
                  m.status === "ok" ? "✓" : m.status === "high" ? "!" : m.status === "low" ? "↓" : "–";
                return (
                  <View key={i} style={[styles.cmpRow, rowStyle]}>
                    <Text style={[styles.cmpIcon, iconStyle]}>{icon}</Text>
                    <Text style={styles.cmpLabel}>{m.label}</Text>
                    <Text style={[styles.cmpValue, iconStyle]}>
                      {m.sessionValue > 0 ? m.sessionValue.toFixed(m.decimals) : "–"}
                    </Text>
                    <Text style={styles.cmpBand}>
                      saga: {m.low.toFixed(m.decimals)}–{m.high.toFixed(m.decimals)}
                    </Text>
                  </View>
                );
              })}
            </View>
          </>
        )}

        <Text style={styles.footer}>
          MicroPulse · Session plan · {data.date}
        </Text>
      </Page>
    </Document>
  );
}

export async function downloadSessionPdf(data: SessionPdfData, filename: string) {
  const blob = await pdf(<SessionPdfDocument data={data} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
