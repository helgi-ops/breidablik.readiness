"use client";

/**
 * PlayerSnapshotPdf
 * ──────────────────
 * Renders a one/two-page PDF summary of a player's daily snapshot.
 * Given the Snapshot JSON returned by /api/coach/player-snapshot, produces
 * a printable coach report covering:
 *   - Header: player, date, overall risk badge
 *   - KPI tiles: ACWR, Readiness, Daily load, Avg RPE
 *   - Risk analysis: narrative summary, drivers, recommendations
 *   - Session RPE entries
 *   - Wellness / readiness breakdown
 *   - GPS / external load blocks
 *   - Context (week plan, session_type_mix)
 */

import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

type RiskDriver = {
  key: string;
  label: string;
  value: string;
  severity: "RED" | "AMBER";
  explanation: string;
};

type RiskAnalysis = {
  overallSeverity: "LOW" | "ELEVATED" | "HIGH";
  summary: string;
  drivers: RiskDriver[];
  recommendations: string[];
};

export type PlayerSnapshotPdfData = {
  date: string;
  player: { id: string; full_name: string | null; team_id: string | null; position: string | null };
  summary: {
    daily_rpe_load_total: number;
    avg_rpe: number | null;
    rpe_count: number;
    load_band: "VERY_LIGHT" | "LIGHT" | "MEDIUM" | "HIGH" | "VERY_HIGH" | null;
    acwr: number | null;
    acwr_band: "OPTIMAL" | "CAUTION" | "RISK" | null;
    acute_load_7d: number | null;
    chronic_load_28d: number | null;
    readiness_total_raw: number | null;
    readiness_total: number | null;
    readiness_band: "GREEN" | "AMBER" | "RED" | null;
    session_type_mix: Record<string, number>;
  };
  risk_analysis: RiskAnalysis;
  rpe: {
    entries: Array<{
      id: string;
      session_type: string;
      session_name: string | null;
      duration_minutes: number;
      rpe: number;
      session_load: number;
      source: string | null;
      notes: string | null;
      submitted_at: string;
    }>;
  };
  readiness: {
    total_score: number | null;
    fatigue_energy: number | null;
    sleep_quality: number | null;
    sleep_duration: number | null;
    stress_mood: number | null;
    muscle_soreness: number | null;
    notes: string | null;
  } | null;
  external_load: Array<Record<string, unknown>>;
  context: { week_plan: Record<string, unknown> | null };
};

const styles = StyleSheet.create({
  page: { padding: 28, fontSize: 10, color: "#221f18", fontFamily: "Helvetica" },

  // Header
  header: { marginBottom: 12, paddingBottom: 10, borderBottom: "2 solid #e6e1d4" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  h1: { fontSize: 18, fontWeight: 700, marginBottom: 2 },
  subtitle: { fontSize: 10, color: "#6d6858" },
  badge: {
    fontSize: 9,
    fontWeight: 700,
    padding: "4 8",
    borderRadius: 10,
    borderWidth: 1,
  },
  badgeHigh: { backgroundColor: "#f1d3c8", color: "#72291c", borderColor: "#d68e77" },
  badgeElevated: { backgroundColor: "#f3e0b4", color: "#7c5210", borderColor: "#e0b257" },
  badgeLow: { backgroundColor: "#d3e8da", color: "#145233", borderColor: "#82bf98" },

  // Section title
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    color: "#565044",
    textTransform: "uppercase",
    marginBottom: 6,
    marginTop: 12,
  },

  // KPI tiles
  tilesRow: { flexDirection: "row", gap: 6, marginBottom: 4 },
  tile: {
    borderWidth: 1,
    borderRadius: 4,
    padding: "6 8",
    flex: 1,
  },
  tileSlate: { borderColor: "#e6e1d4", backgroundColor: "#f7f5ef" },
  tileGreen: { borderColor: "#b0d6bd", backgroundColor: "#eaf3ec" },
  tileAmber: { borderColor: "#e0b257", backgroundColor: "#faf1de" },
  tileRed: { borderColor: "#d68e77", backgroundColor: "#f8e9e3" },
  tileLabel: { fontSize: 7, color: "#8b8676", textTransform: "uppercase", marginBottom: 2 },
  tileValue: { fontSize: 16, fontWeight: 700, color: "#221f18" },
  tileBand: { fontSize: 7, color: "#8b8676", marginTop: 2 },

  // Narrative / body text
  bodyText: { fontSize: 10, color: "#3a352c", lineHeight: 1.4, marginBottom: 4 },

  // Risk analysis
  riskBox: {
    borderWidth: 1,
    borderRadius: 4,
    padding: 8,
    marginTop: 4,
    marginBottom: 6,
  },
  riskBoxHigh: { borderColor: "#d68e77", backgroundColor: "#f8e9e3" },
  riskBoxElevated: { borderColor: "#e0b257", backgroundColor: "#faf1de" },
  riskSummary: { fontSize: 10, color: "#221f18", fontWeight: 700, marginBottom: 6 },

  driverRow: {
    borderWidth: 1,
    borderColor: "#e6e1d4",
    backgroundColor: "#FFFFFF",
    borderRadius: 3,
    padding: 6,
    marginBottom: 4,
  },
  driverHead: { flexDirection: "row", justifyContent: "space-between", marginBottom: 2 },
  driverLabel: { fontSize: 9, fontWeight: 700, color: "#221f18" },
  driverValue: { fontSize: 9, fontWeight: 700, color: "#565044" },
  driverExplanation: { fontSize: 8.5, color: "#565044", lineHeight: 1.35 },

  // Recommendations
  recBox: {
    borderWidth: 1,
    borderColor: "#e6e1d4",
    backgroundColor: "#FFFFFF",
    borderRadius: 3,
    padding: 6,
    marginTop: 4,
  },
  recTitle: { fontSize: 8, fontWeight: 700, color: "#8b8676", textTransform: "uppercase", marginBottom: 4 },
  recItem: { fontSize: 8.5, color: "#3a352c", marginBottom: 2, lineHeight: 1.35 },

  // Wellness grid
  grid3: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  gridCell: {
    width: "32.5%",
    borderWidth: 1,
    borderColor: "#e6e1d4",
    backgroundColor: "#f7f5ef",
    borderRadius: 3,
    padding: "4 6",
    marginBottom: 4,
  },
  gridLabel: { fontSize: 7, color: "#8b8676", textTransform: "uppercase", marginBottom: 1 },
  gridValue: { fontSize: 11, fontWeight: 700, color: "#221f18" },

  // RPE entry
  rpeItem: {
    borderWidth: 1,
    borderColor: "#e6e1d4",
    borderRadius: 3,
    padding: 6,
    marginBottom: 4,
  },
  rpeTop: { flexDirection: "row", justifyContent: "space-between", marginBottom: 2 },
  rpeTitle: { fontSize: 10, fontWeight: 700, color: "#221f18" },
  rpeMeta: { fontSize: 8, color: "#8b8676" },

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

function fmtNum(v: number | null | undefined, digits = 0): string {
  if (v == null || !Number.isFinite(Number(v))) return "–";
  return Number(v).toFixed(digits);
}

function sessionTypeLabel(t: string): string {
  switch (t) {
    case "match":
      return "Leikur";
    case "team_training":
      return "Liðsæfing";
    case "gym":
      return "Styrktaræfing";
    case "recovery":
      return "Endurheimt";
    case "individual":
      return "Einstaklingsæfing";
    default:
      return "Annað";
  }
}

function loadBandLabel(b: PlayerSnapshotPdfData["summary"]["load_band"]): string {
  if (b === "VERY_HIGH") return "Very hard";
  if (b === "HIGH") return "Hard";
  if (b === "MEDIUM") return "Moderate";
  if (b === "LIGHT") return "Light";
  if (b === "VERY_LIGHT") return "Very light";
  return "—";
}

function acwrTileStyle(band: PlayerSnapshotPdfData["summary"]["acwr_band"]) {
  if (band === "RISK") return styles.tileRed;
  if (band === "CAUTION") return styles.tileAmber;
  if (band === "OPTIMAL") return styles.tileGreen;
  return styles.tileSlate;
}

function readinessTileStyle(band: PlayerSnapshotPdfData["summary"]["readiness_band"]) {
  if (band === "RED") return styles.tileRed;
  if (band === "AMBER") return styles.tileAmber;
  if (band === "GREEN") return styles.tileGreen;
  return styles.tileSlate;
}

export function PlayerSnapshotPdfDocument({ data }: { data: PlayerSnapshotPdfData }) {
  const sev = data.risk_analysis.overallSeverity;
  const badgeStyle =
    sev === "HIGH" ? styles.badgeHigh : sev === "ELEVATED" ? styles.badgeElevated : styles.badgeLow;
  const badgeLabel = sev === "HIGH" ? "Há áhætta" : sev === "ELEVATED" ? "Aukin aðgát" : "Lág áhætta";

  const riskBoxStyle =
    sev === "HIGH" ? styles.riskBoxHigh : sev === "ELEVATED" ? styles.riskBoxElevated : null;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.h1}>{data.player.full_name ?? "—"}</Text>
              <Text style={styles.subtitle}>
                {data.player.position ?? "—"} {"  ·  "}Dagsetning: {data.date}
              </Text>
            </View>
            <Text style={[styles.badge, badgeStyle]}>{badgeLabel}</Text>
          </View>
        </View>

        {/* KPI tiles */}
        <Text style={styles.sectionTitle}>Yfirlit</Text>
        <View style={styles.tilesRow}>
          <View style={[styles.tile, acwrTileStyle(data.summary.acwr_band)]}>
            <Text style={styles.tileLabel}>ACWR</Text>
            <Text style={styles.tileValue}>{fmtNum(data.summary.acwr, 2)}</Text>
            <Text style={styles.tileBand}>{data.summary.acwr_band ?? "N/A"}</Text>
          </View>
          <View style={[styles.tile, readinessTileStyle(data.summary.readiness_band)]}>
            <Text style={styles.tileLabel}>Readiness</Text>
            <Text style={styles.tileValue}>
              {data.summary.readiness_total != null ? `${data.summary.readiness_total}%` : "—"}
            </Text>
            <Text style={styles.tileBand}>
              {data.summary.readiness_band ?? "No entry"}
              {data.summary.readiness_total_raw != null ? ` · ${data.summary.readiness_total_raw}/25` : ""}
            </Text>
          </View>
          <View style={[styles.tile, styles.tileSlate]}>
            <Text style={styles.tileLabel}>Daily load (sRPE)</Text>
            <Text style={styles.tileValue}>
              {data.summary.daily_rpe_load_total > 0 ? data.summary.daily_rpe_load_total : "—"}
            </Text>
            <Text style={styles.tileBand}>{loadBandLabel(data.summary.load_band)}</Text>
          </View>
          <View style={[styles.tile, styles.tileSlate]}>
            <Text style={styles.tileLabel}>Avg RPE ({data.summary.rpe_count})</Text>
            <Text style={styles.tileValue}>{fmtNum(data.summary.avg_rpe, 1)}</Text>
            <Text style={styles.tileBand}>
              Acute 7d: {fmtNum(data.summary.acute_load_7d, 0)} · Chronic 28d: {fmtNum(data.summary.chronic_load_28d, 0)}
            </Text>
          </View>
        </View>

        {/* Risk analysis */}
        <Text style={styles.sectionTitle}>Áhættugreining</Text>
        <View style={[styles.riskBox, riskBoxStyle || styles.tileSlate]}>
          <Text style={styles.riskSummary}>{data.risk_analysis.summary}</Text>

          {data.risk_analysis.drivers.length > 0 ? (
            <>
              {data.risk_analysis.drivers.map((d) => (
                <View key={d.key} style={styles.driverRow}>
                  <View style={styles.driverHead}>
                    <Text style={styles.driverLabel}>
                      {d.severity === "RED" ? "[RED] " : "[AMBER] "}
                      {d.label}
                    </Text>
                    <Text style={styles.driverValue}>{d.value}</Text>
                  </View>
                  <Text style={styles.driverExplanation}>{d.explanation}</Text>
                </View>
              ))}
            </>
          ) : (
            <Text style={styles.bodyText}>Engir áhættuþættir greindir fyrir þennan dag.</Text>
          )}

          {data.risk_analysis.recommendations.length > 0 ? (
            <View style={styles.recBox}>
              <Text style={styles.recTitle}>Tillögur að aðgerðum</Text>
              {data.risk_analysis.recommendations.map((r, i) => (
                <Text key={i} style={styles.recItem}>
                  → {r}
                </Text>
              ))}
            </View>
          ) : null}
        </View>

        {/* Session RPE entries */}
        <Text style={styles.sectionTitle}>Session RPE entries</Text>
        {data.rpe.entries.length === 0 ? (
          <Text style={styles.bodyText}>Engar RPE færslur fyrir þennan dag.</Text>
        ) : (
          data.rpe.entries.map((e) => (
            <View key={e.id} style={styles.rpeItem}>
              <View style={styles.rpeTop}>
                <Text style={styles.rpeTitle}>
                  {sessionTypeLabel(e.session_type)}
                  {e.session_name ? ` · ${e.session_name}` : ""}
                </Text>
                <Text style={styles.rpeMeta}>
                  {e.duration_minutes} mín · RPE {e.rpe} · Load {e.session_load}
                </Text>
              </View>
              <Text style={styles.rpeMeta}>
                Skráð: {new Date(e.submitted_at).toLocaleString("is-IS")}
                {e.source ? ` · src: ${e.source}` : ""}
              </Text>
              {e.notes ? <Text style={[styles.rpeMeta, { fontStyle: "italic", marginTop: 2 }]}>“{e.notes}”</Text> : null}
            </View>
          ))
        )}

        {/* Wellness / readiness */}
        <Text style={styles.sectionTitle}>Readiness / wellness</Text>
        {data.readiness ? (
          <>
            <View style={styles.grid3}>
              <View style={styles.gridCell}>
                <Text style={styles.gridLabel}>Total (raw 5–25)</Text>
                <Text style={styles.gridValue}>{fmtNum(data.readiness.total_score, 0)}</Text>
              </View>
              <View style={styles.gridCell}>
                <Text style={styles.gridLabel}>Sleep quality</Text>
                <Text style={styles.gridValue}>
                  {data.readiness.sleep_quality != null ? `${data.readiness.sleep_quality}/5` : "—"}
                </Text>
              </View>
              <View style={styles.gridCell}>
                <Text style={styles.gridLabel}>Sleep duration</Text>
                <Text style={styles.gridValue}>
                  {data.readiness.sleep_duration != null
                    ? `${data.readiness.sleep_duration}/5 (${
                        ({ 1: "<5", 2: "5–6", 3: "6–7", 4: "7–8", 5: "8+" } as Record<number, string>)[
                          Number(data.readiness.sleep_duration)
                        ] ?? ""
                      } klst)`
                    : "—"}
                </Text>
              </View>
              <View style={styles.gridCell}>
                <Text style={styles.gridLabel}>Fatigue / energy</Text>
                <Text style={styles.gridValue}>
                  {data.readiness.fatigue_energy != null ? `${data.readiness.fatigue_energy}/5` : "—"}
                </Text>
              </View>
              <View style={styles.gridCell}>
                <Text style={styles.gridLabel}>Stress / mood</Text>
                <Text style={styles.gridValue}>
                  {data.readiness.stress_mood != null ? `${data.readiness.stress_mood}/5` : "—"}
                </Text>
              </View>
              <View style={styles.gridCell}>
                <Text style={styles.gridLabel}>Muscle soreness</Text>
                <Text style={styles.gridValue}>
                  {data.readiness.muscle_soreness != null ? `${data.readiness.muscle_soreness}/5` : "—"}
                </Text>
              </View>
            </View>
            {data.readiness.notes ? (
              <Text style={[styles.bodyText, { fontStyle: "italic", marginTop: 4 }]}>
                Athugasemd: “{data.readiness.notes}”
              </Text>
            ) : null}
          </>
        ) : (
          <Text style={styles.bodyText}>Engin readiness færsla fyrir þennan dag.</Text>
        )}

        {/* GPS / external load */}
        {data.external_load.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>GPS / external load (Catapult)</Text>
            {data.external_load.map((row, i) => {
              const n = (k: string) => {
                const v = row[k];
                return v == null ? null : Number(v);
              };
              const src = (row.source as string | null) ?? "—";
              return (
                <View key={i} style={{ marginBottom: 4 }}>
                  <Text style={[styles.gridLabel, { marginBottom: 2 }]}>Source: {src}</Text>
                  <View style={styles.grid3}>
                    <View style={styles.gridCell}>
                      <Text style={styles.gridLabel}>Total dist (m)</Text>
                      <Text style={styles.gridValue}>{fmtNum(n("total_distance"), 0)}</Text>
                    </View>
                    <View style={styles.gridCell}>
                      <Text style={styles.gridLabel}>Player load</Text>
                      <Text style={styles.gridValue}>{fmtNum(n("total_player_load"), 0)}</Text>
                    </View>
                    <View style={styles.gridCell}>
                      <Text style={styles.gridLabel}>HSR (vb5+vb6)</Text>
                      <Text style={styles.gridValue}>{fmtNum(n("high_speed_distance"), 0)}</Text>
                    </View>
                    <View style={styles.gridCell}>
                      <Text style={styles.gridLabel}>Sprint (vb6) m</Text>
                      <Text style={styles.gridValue}>{fmtNum(n("velocity_band6_total_distance"), 0)}</Text>
                    </View>
                    <View style={styles.gridCell}>
                      <Text style={styles.gridLabel}>Accels</Text>
                      <Text style={styles.gridValue}>{fmtNum(n("tot_as"), 0)}</Text>
                    </View>
                    <View style={styles.gridCell}>
                      <Text style={styles.gridLabel}>Decels</Text>
                      <Text style={styles.gridValue}>{fmtNum(n("tot_ds"), 0)}</Text>
                    </View>
                    <View style={styles.gridCell}>
                      <Text style={styles.gridLabel}>Accel B2-3</Text>
                      <Text style={styles.gridValue}>{fmtNum(n("accel_b2_3_tot_effs_gen2"), 0)}</Text>
                    </View>
                    <View style={styles.gridCell}>
                      <Text style={styles.gridLabel}>Decel B2-3</Text>
                      <Text style={styles.gridValue}>{fmtNum(n("decel_b2_3_tot_effs_gen2"), 0)}</Text>
                    </View>
                    <View style={styles.gridCell}>
                      <Text style={styles.gridLabel}>IMA total</Text>
                      <Text style={styles.gridValue}>{fmtNum(n("ima_total"), 0)}</Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </>
        ) : null}

        {/* Context */}
        {data.context.week_plan ? (
          <>
            <Text style={styles.sectionTitle}>Samhengi / week setup</Text>
            <Text style={styles.bodyText}>
              Day type:{" "}
              {String((data.context.week_plan as { day_type?: string }).day_type ?? "—")}
            </Text>
          </>
        ) : null}

        {/* Footer */}
        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) =>
            `MicroPulse · Player daily snapshot · ${data.player.full_name ?? "—"} · ${data.date} · Page ${pageNumber}/${totalPages}`
          }
          fixed
        />
      </Page>
    </Document>
  );
}
